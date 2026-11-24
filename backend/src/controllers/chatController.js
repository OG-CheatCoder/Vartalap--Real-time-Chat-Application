import User from "../models/User.js";
import Group from "../models/Group.js";
import Message from "../models/Message.js";
import DirectChat from "../models/DirectChat.js";

const populateMessageById = (messageId) =>
  Message.findById(messageId)
    .populate("sender", "fullName username avatarUrl")
    .populate({
      path: "replyTo",
      select: "content sender mediaType fileName isDeletedForEveryone",
      populate: { path: "sender", select: "fullName username" },
    });

// @desc    Search verified users by @username or name
// @route   GET /api/users/search?q=
export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(200).json({ success: true, data: [] });
    }

    const query = q.replace(/^@/, "").toLowerCase().trim();

    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: "i" } },
        { fullName: { $regex: query, $options: "i" } },
      ],
      _id: { $ne: req.user._id },
      isVerified: true,
    })
      .select("fullName username avatarUrl lastSeen")
      .limit(20);

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while searching users.",
    });
  }
};

// @desc    Fetch messages for a chat (direct or group)
// @route   GET /api/messages/:chatType/:chatId
export const getMessages = async (req, res) => {
  try {
    const { chatType, chatId } = req.params;

    if (!["direct", "group"].includes(chatType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid chatType. Must be 'direct' or 'group'.",
      });
    }

    if (chatType === "group") {
      const group = await Group.findById(chatId);
      if (!group) {
        return res.status(404).json({ success: false, message: "Group not found." });
      }
      const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
      if (!isMember) {
        return res.status(403).json({ success: false, message: "You are not a member of this group." });
      }
    } else {
      const directChat = await DirectChat.findById(chatId);
      if (!directChat) {
        return res.status(404).json({ success: false, message: "Direct chat not found." });
      }
      const isParticipant = directChat.participants.some(
        (p) => p.toString() === req.user._id.toString()
      );
      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: "You are not a participant in this conversation.",
        });
      }
    }

    const recentMessages = await Message.find({
      chatType,
      chatId,
      deletedFor: { $ne: req.user._id },
    })
      .populate("sender", "fullName username avatarUrl")
      .populate({
        path: "replyTo",
        select: "content sender mediaType fileName isDeletedForEveryone",
        populate: { path: "sender", select: "fullName username" },
      })
      .sort({ createdAt: -1 })
      .limit(300);

    res.status(200).json({
      success: true,
      data: recentMessages.reverse(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching messages.",
    });
  }
};

// @desc    Send a message (Text, Media, Voice, Document, Reply)
// @route   POST /api/messages
export const sendMessage = async (req, res) => {
  try {
    const {
      chatType,
      chatId,
      content = "",
      mediaUrl = "",
      mediaType = "text",
      fileName = "",
      fileSize = 0,
      replyTo = null,
    } = req.body;

    if (!chatType || !chatId || (!content.trim() && !mediaUrl)) {
      return res.status(400).json({
        success: false,
        message: "Message content or media attachment is required.",
      });
    }

    let chatDoc;
    if (chatType === "group") {
      chatDoc = await Group.findById(chatId);
      if (!chatDoc) {
        return res.status(404).json({ success: false, message: "Group not found." });
      }
      if (chatDoc.status === "expired" || (chatDoc.isSessionGroup && new Date() >= chatDoc.expiresAt)) {
        return res.status(403).json({ success: false, message: "This session group has expired." });
      }
      const isMember = chatDoc.members.some((m) => m.toString() === req.user._id.toString());
      if (!isMember) {
        return res.status(403).json({ success: false, message: "You are not a member of this group." });
      }
    } else if (chatType === "direct") {
      chatDoc = await DirectChat.findById(chatId);
      if (!chatDoc) {
        return res.status(404).json({ success: false, message: "Direct chat not found." });
      }
      const isParticipant = chatDoc.participants.some(
        (p) => p.toString() === req.user._id.toString()
      );
      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: "You are not a participant in this direct chat.",
        });
      }
    } else {
      return res.status(400).json({ success: false, message: "Invalid chatType." });
    }

    const message = await Message.create({
      chatType,
      chatId,
      sender: req.user._id,
      content: content.trim(),
      mediaUrl: mediaUrl.trim(),
      mediaType: mediaUrl ? mediaType : "text",
      fileName: fileName.trim(),
      fileSize: Number(fileSize) || 0,
      replyTo: replyTo || null,
    });

    chatDoc.lastMessage = message._id;
    await chatDoc.save();

    const populatedMessage = await populateMessageById(message._id);

    if (req.io) {
      req.io.to(`${chatType}:${chatId}`).emit("message:new", populatedMessage);
      req.io.emit("sidebar:update", populatedMessage);
    }

    res.status(201).json({
      success: true,
      data: populatedMessage,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while sending message.",
    });
  }
};

// @desc    Edit own sent message
// @route   PATCH /api/messages/:messageId
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    if (message.isSystemMessage || message.isDeletedForEveryone) {
      return res.status(400).json({ success: false, message: "This message cannot be edited." });
    }

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "You can only edit your own messages." });
    }

    if (message.chatType === "group") {
      const group = await Group.findById(message.chatId);
      if (group && (group.status === "expired" || (group.isSessionGroup && new Date() >= group.expiresAt))) {
        return res.status(403).json({
          success: false,
          message: "Cannot edit messages in an expired session group.",
        });
      }
    }

    const trimmedContent = typeof content === "string" ? content.trim() : "";
    if (!trimmedContent && !message.mediaUrl) {
      return res.status(400).json({ success: false, message: "Message content cannot be empty." });
    }

    message.content = trimmedContent;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    const populated = await populateMessageById(message._id);

    if (req.io) {
      req.io.to(`${message.chatType}:${message.chatId}`).emit("message:updated", populated);
      req.io.emit("message:updated", populated);
    }

    res.status(200).json({
      success: true,
      message: "Message updated.",
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while editing message.",
    });
  }
};

// @desc    Toggle pin on a message
// @route   POST /api/messages/:messageId/pin
export const togglePinMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    if (message.isDeletedForEveryone) {
      return res.status(400).json({ success: false, message: "Deleted messages cannot be pinned." });
    }

    if (message.chatType === "group") {
      const group = await Group.findById(message.chatId);
      if (!group || !group.members.some((m) => m.toString() === req.user._id.toString())) {
        return res.status(403).json({ success: false, message: "Not authorized to pin in this group." });
      }

      message.isPinned = !message.isPinned;
      await message.save();

      if (message.isPinned) {
        if (!group.pinnedMessages.some((id) => id.toString() === message._id.toString())) {
          group.pinnedMessages.push(message._id);
        }
      } else {
        group.pinnedMessages = group.pinnedMessages.filter(
          (id) => id.toString() !== message._id.toString()
        );
      }
      await group.save();
    } else {
      const directChat = await DirectChat.findById(message.chatId);
      if (!directChat || !directChat.participants.some((p) => p.toString() === req.user._id.toString())) {
        return res.status(403).json({ success: false, message: "Not authorized to pin in this chat." });
      }
      message.isPinned = !message.isPinned;
      await message.save();
    }

    const populated = await populateMessageById(message._id);

    if (req.io) {
      req.io.to(`${message.chatType}:${message.chatId}`).emit("message:updated", populated);
    }

    res.status(200).json({
      success: true,
      message: message.isPinned ? "Message pinned to top." : "Message unpinned.",
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while pinning message.",
    });
  }
};

// @desc    Toggle star/favourite on a message
// @route   POST /api/messages/:messageId/star
export const toggleStarMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    const userId = req.user._id.toString();
    const isStarred = message.starredBy.some((id) => id.toString() === userId);

    if (isStarred) {
      message.starredBy = message.starredBy.filter((id) => id.toString() !== userId);
    } else {
      message.starredBy.push(req.user._id);
    }

    await message.save();

    res.status(200).json({
      success: true,
      message: isStarred ? "Removed from starred." : "Added to starred.",
      data: { isStarred: !isStarred, messageId },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while starring message.",
    });
  }
};

// @desc    Delete messages (Delete for me OR Delete for everyone)
// @route   POST /api/messages/delete
export const deleteMessages = async (req, res) => {
  try {
    const { messageIds, deleteType } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "messageIds array is required.",
      });
    }

    if (deleteType === "for_me") {
      await Message.updateMany(
        { _id: { $in: messageIds } },
        { $addToSet: { deletedFor: req.user._id } }
      );

      return res.status(200).json({
        success: true,
        message: "Messages deleted for you.",
        data: { messageIds, deleteType: "for_me" },
      });
    }

    if (deleteType === "for_everyone") {
      const messages = await Message.find({ _id: { $in: messageIds } });

      for (const msg of messages) {
        const isSender = msg.sender.toString() === req.user._id.toString();
        let isGroupAdmin = false;
        let group = null;

        if (msg.chatType === "group") {
          group = await Group.findById(msg.chatId);
          isGroupAdmin =
            group?.admin?.toString() === req.user._id.toString() ||
            group?.admins?.some((a) => a.toString() === req.user._id.toString());
        }

        if (isSender || isGroupAdmin) {
          msg.isDeletedForEveryone = true;
          msg.isPinned = false;
          msg.content = "This message was deleted";
          msg.mediaUrl = "";
          msg.mediaType = "text";
          msg.fileName = "";
          msg.fileSize = 0;
          await msg.save();

          if (group && group.pinnedMessages?.length) {
            group.pinnedMessages = group.pinnedMessages.filter(
              (id) => id.toString() !== msg._id.toString()
            );
            await group.save();
          }

          if (req.io) {
            const payload = {
              messageId: msg._id,
              chatType: msg.chatType,
              chatId: msg.chatId,
            };
            req.io.to(`${msg.chatType}:${msg.chatId}`).emit("message:deleted_for_everyone", payload);
            req.io.emit("message:deleted_for_everyone", payload);
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: "Messages deleted for everyone.",
        data: { messageIds, deleteType: "for_everyone" },
      });
    }

    res.status(400).json({
      success: false,
      message: "Invalid deleteType. Must be 'for_me' or 'for_everyone'.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while deleting messages.",
    });
  }
};

// @desc    Clear entire chat for current user
// @route   POST /api/messages/clear-chat
export const clearChat = async (req, res) => {
  try {
    const { chatType, chatId } = req.body;

    if (!chatType || !chatId) {
      return res.status(400).json({
        success: false,
        message: "chatType and chatId are required.",
      });
    }

    await Message.updateMany(
      { chatType, chatId },
      { $addToSet: { deletedFor: req.user._id } }
    );

    res.status(200).json({
      success: true,
      message: "Chat history cleared successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while clearing chat.",
    });
  }
};
