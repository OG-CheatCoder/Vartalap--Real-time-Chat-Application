import DirectChat from "../models/DirectChat.js";
import User from "../models/User.js";

// @desc    Get or create 1:1 direct conversation with a target user
// @route   POST /api/direct-chats
export const getOrCreateDirectChat = async (req, res) => {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: "targetUserId is required.",
      });
    }

    if (targetUserId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot start a direct chat with yourself.",
      });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Target user not found.",
      });
    }

    // Check if conversation already exists between the two users
    let directChat = await DirectChat.findOne({
      participants: { $all: [req.user._id, targetUserId] },
    })
      .populate("participants", "fullName username avatarUrl lastSeen")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "fullName username" },
      });

    if (!directChat) {
      directChat = await DirectChat.create({
        participants: [req.user._id, targetUserId],
      });

      directChat = await DirectChat.findById(directChat._id)
        .populate("participants", "fullName username avatarUrl lastSeen")
        .populate({
          path: "lastMessage",
          populate: { path: "sender", select: "fullName username" },
        });
    }

    res.status(200).json({
      success: true,
      data: directChat,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while creating or getting direct chat.",
    });
  }
};

// @desc    Fetch all direct conversations for the logged-in user
// @route   GET /api/direct-chats
export const getMyDirectChats = async (req, res) => {
  try {
    const directChats = await DirectChat.find({
      participants: req.user._id,
    })
      .populate("participants", "fullName username avatarUrl lastSeen")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "fullName username" },
      })
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: directChats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching direct chats.",
    });
  }
};
