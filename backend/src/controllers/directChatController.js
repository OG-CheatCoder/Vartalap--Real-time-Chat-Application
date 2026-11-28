import DirectChat from "../models/DirectChat.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import PendingEvent from "../models/PendingEvent.js";

const DURATION_LABELS = {
  0: "Off",
  86400: "24 hours",
  604800: "7 days",
  2592000: "30 days",
};

// @desc    Get or create 1:1 direct conversation with a target user
// @route   POST /api/direct-chats
export const getOrCreateDirectChat = async (req, res) => {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: "targetUserId is required." });
    }

    if (targetUserId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot start a direct chat with yourself.",
      });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Target user not found." });
    }

    let directChat = await DirectChat.findOne({
      participants: { $all: [req.user._id, targetUserId] },
    })
      .populate("participants", "fullName username avatarUrl lastSeen")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "fullName username" },
      });

    let isNew = false;
    if (!directChat) {
      isNew = true;
      directChat = await DirectChat.create({
        participants: [req.user._id, targetUserId],
        disappearingDuration: req.user.defaultDisappearingDuration || 0,
        disappearingConfigured: false,
      });

      directChat = await DirectChat.findById(directChat._id)
        .populate("participants", "fullName username avatarUrl lastSeen")
        .populate({
          path: "lastMessage",
          populate: { path: "sender", select: "fullName username" },
        });
    } else if (directChat.hiddenFor?.some((id) => id.toString() === req.user._id.toString())) {
      // Unhide for caller if they explicitly search & reopen this chat
      directChat.hiddenFor = directChat.hiddenFor.filter(
        (id) => id.toString() !== req.user._id.toString()
      );
      await directChat.save();
    }

    const chatObj = directChat.toObject();
    if (
      chatObj.lastMessage?.deletedFor?.some(
        (id) => id.toString() === req.user._id.toString()
      )
    ) {
      chatObj.lastMessage = null;
    }

    if (req.io) {
      req.io.to(`user:${req.user._id}`).emit("direct_chat:sync", chatObj);
      if (isNew) {
        req.io.to(`user:${targetUserId}`).emit("direct_chat:sync", chatObj);
      }
    }

    res.status(200).json({
      success: true,
      data: { ...chatObj, isNewChat: isNew },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while creating or getting direct chat.",
    });
  }
};

// @desc    Fetch all visible direct conversations for the logged-in user
// @route   GET /api/direct-chats
export const getMyDirectChats = async (req, res) => {
  try {
    const directChats = await DirectChat.find({
      participants: req.user._id,
      hiddenFor: { $ne: req.user._id },
    })
      .populate("participants", "fullName username avatarUrl lastSeen")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "fullName username" },
      })
      .sort({ updatedAt: -1 });

    const chatsWithCleanPreview = directChats.map((c) => {
      const obj = c.toObject();
      if (
        obj.lastMessage?.deletedFor?.some(
          (id) => id.toString() === req.user._id.toString()
        )
      ) {
        obj.lastMessage = null;
      }
      return obj;
    });

    res.status(200).json({
      success: true,
      data: chatsWithCleanPreview,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching direct chats.",
    });
  }
};

// @desc    Customize disappearing message timer for a specific 1:1 chat
// @route   PATCH /api/direct-chats/:chatId/disappearing
export const updateDirectDisappearingTimer = async (req, res) => {
  try {
    const { chatId } = req.params;
    const duration = Number(req.body.duration);

    if (![0, 86400, 604800, 2592000].includes(duration)) {
      return res.status(400).json({
        success: false,
        message: "Duration must be 0 (Off), 86400 (24h), 604800 (7d), or 2592000 (30d).",
      });
    }

    const directChat = await DirectChat.findById(chatId).populate(
      "participants",
      "fullName username avatarUrl lastSeen"
    );
    if (!directChat) {
      return res.status(404).json({ success: false, message: "Direct chat not found." });
    }

    const participantIds = (directChat.participants || []).map((p) => p._id.toString());
    if (!participantIds.includes(req.user._id.toString())) {
      return res.status(403).json({ success: false, message: "Not authorized for this chat." });
    }

    directChat.disappearingDuration = duration;
    directChat.disappearingConfigured = true;
    await directChat.save();

    const text =
      duration > 0
        ? `@${req.user.username} turned on disappearing messages (${DURATION_LABELS[duration]}).`
        : `@${req.user.username} turned off disappearing messages.`;

    const sysMsg = await Message.create({
      chatType: "direct",
      chatId: directChat._id,
      sender: req.user._id,
      content: text,
      isSystemMessage: true,
      pendingRecipients: participantIds,
    });

    const populatedMsg = await Message.findById(sysMsg._id).populate(
      "sender",
      "fullName username avatarUrl"
    );

    const chatPayload = { ...directChat.toObject(), lastMessage: populatedMsg };

    if (req.io) {
      req.io.to(`direct:${directChat._id}`).emit("message:new", populatedMsg);
      participantIds.forEach((pId) => {
        req.io.to(`user:${pId}`).emit("message:new", populatedMsg);
        req.io.to(`user:${pId}`).emit("direct_chat:sync", chatPayload);
      });
    }

    res.status(200).json({
      success: true,
      message: text,
      data: chatPayload,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error updating disappearing message timer.",
    });
  }
};

// @desc    Delete chat with user (hides from user's sidebar & purges user's queued items)
// @route   DELETE /api/direct-chats/:chatId
export const deleteDirectChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const directChat = await DirectChat.findById(chatId);

    if (!directChat) {
      return res.status(404).json({ success: false, message: "Direct chat not found." });
    }

    const isParticipant = directChat.participants.some(
      (p) => p.toString() === req.user._id.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }

    if (!directChat.hiddenFor.some((id) => id.toString() === req.user._id.toString())) {
      directChat.hiddenFor.push(req.user._id);
    }
    await directChat.save();

    await Message.updateMany(
      { chatType: "direct", chatId },
      {
        $addToSet: { deletedFor: req.user._id },
        $pull: { pendingRecipients: req.user._id },
      }
    );
    await Message.deleteMany({
      chatType: "direct",
      chatId,
      pendingRecipients: { $size: 0 },
    });
    await PendingEvent.deleteMany({
      targetUser: req.user._id,
      chatType: "direct",
      chatId,
    });

    res.status(200).json({
      success: true,
      message: "Chat deleted and removed from sidebar.",
      data: { chatId },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error deleting direct chat.",
    });
  }
};
