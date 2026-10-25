import User from "../models/User.js";
import Group from "../models/Group.js";
import Message from "../models/Message.js";

// @desc    Search verified users by @username
// @route   GET /api/users/search?q=
export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(200).json({ success: true, data: [] });
    }

    const query = q.replace(/^@/, "").toLowerCase().trim();

    const users = await User.find({
      username: { $regex: query, $options: "i" },
      _id: { $ne: req.user._id },
      isVerified: true,
    })
      .select("fullName username avatarUrl lastSeen")
      .limit(20);

    res.status(200).json({
      success: true,
      data: users,
    });
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

    // Verify membership if group
    if (chatType === "group") {
      const group = await Group.findById(chatId);
      if (!group) {
        return res.status(404).json({ success: false, message: "Group not found." });
      }
      const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
      if (!isMember) {
        return res.status(403).json({ success: false, message: "You are not a member of this group." });
      }
    }

    const messages = await Message.find({ chatType, chatId })
      .populate("sender", "fullName username avatarUrl")
      .sort({ createdAt: 1 })
      .limit(100);

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching messages.",
    });
  }
};

// @desc    Send a message
// @route   POST /api/messages
export const sendMessage = async (req, res) => {
  try {
    const { chatType, chatId, content } = req.body;

    if (!chatType || !chatId || !content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "chatType, chatId, and message content are required.",
      });
    }

    // If group message, validate session expiration
    if (chatType === "group") {
      const group = await Group.findById(chatId);
      if (!group) {
        return res.status(404).json({ success: false, message: "Group not found." });
      }

      if (group.status === "expired" || (group.isSessionGroup && new Date() >= group.expiresAt)) {
        return res.status(403).json({
          success: false,
          message: "This session group has expired.",
        });
      }

      const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this group.",
        });
      }

      const message = await Message.create({
        chatType,
        chatId,
        sender: req.user._id,
        content: content.trim(),
      });

      group.lastMessage = message._id;
      await group.save();

      const populatedMessage = await Message.findById(message._id).populate(
        "sender",
        "fullName username avatarUrl"
      );

      return res.status(201).json({
        success: true,
        data: populatedMessage,
      });
    }

    // Direct message
    const message = await Message.create({
      chatType: "direct",
      chatId,
      sender: req.user._id,
      content: content.trim(),
    });

    const populatedMessage = await Message.findById(message._id).populate(
      "sender",
      "fullName username avatarUrl"
    );

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
