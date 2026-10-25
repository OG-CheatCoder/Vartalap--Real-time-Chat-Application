import { customAlphabet } from "nanoid";
import Group from "../models/Group.js";
import Message from "../models/Message.js";

// Nanoid generator for #VRT-XXXX tags (4 alphanumeric uppercase chars)
const generateNano = customAlphabet("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", 4);
const generateGroupTag = () => `#VRT-${generateNano()}`;

// @desc    Create a new group (Permanent or Session-Based)
// @route   POST /api/groups
export const createGroup = async (req, res) => {
  try {
    const { name, description, joinMode, isSessionGroup, durationMinutes, customExpiresAt } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Group name is required.",
      });
    }

    let groupTag = generateGroupTag();
    // Ensure tag uniqueness
    let existingTag = await Group.findOne({ groupTag });
    while (existingTag) {
      groupTag = generateGroupTag();
      existingTag = await Group.findOne({ groupTag });
    }

    let expiresAt = null;
    if (isSessionGroup) {
      if (customExpiresAt) {
        expiresAt = new Date(customExpiresAt);
      } else if (durationMinutes) {
        expiresAt = new Date(Date.now() + Number(durationMinutes) * 60 * 1000);
      } else {
        // Default 24 hours
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
    }

    const group = await Group.create({
      name: name.trim(),
      description: (description || "").trim(),
      groupTag,
      admin: req.user._id,
      members: [req.user._id],
      joinMode: ["public", "invite_only", "closed"].includes(joinMode) ? joinMode : "public",
      isSessionGroup: Boolean(isSessionGroup),
      expiresAt,
      status: "active",
      pinnedMessages: [],
    });

    const populatedGroup = await Group.findById(group._id)
      .populate("admin", "fullName username avatarUrl")
      .populate("members", "fullName username avatarUrl lastSeen");

    res.status(201).json({
      success: true,
      message: `Group created successfully with ID ${groupTag}`,
      data: populatedGroup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while creating group.",
    });
  }
};

// @desc    Get user's joined groups
// @route   GET /api/groups/my-groups
export const getMyGroups = async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id })
      .populate("admin", "fullName username avatarUrl")
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: groups,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching groups.",
    });
  }
};

// @desc    Search group by unique tag (#VRT-XXXX)
// @route   GET /api/groups/search
export const searchGroupByTag = async (req, res) => {
  try {
    const { tag } = req.query;

    if (!tag) {
      return res.status(400).json({
        success: false,
        message: "Please provide a group tag to search.",
      });
    }

    let normalizedTag = tag.trim().toUpperCase();
    if (!normalizedTag.startsWith("#")) {
      if (!normalizedTag.startsWith("VRT-")) {
        normalizedTag = `#VRT-${normalizedTag}`;
      } else {
        normalizedTag = `#${normalizedTag}`;
      }
    }

    const group = await Group.findOne({ groupTag: normalizedTag })
      .populate("admin", "fullName username avatarUrl")
      .select("-pinnedMessages");

    if (!group) {
      return res.status(404).json({
        success: false,
        message: `No group found with ID ${normalizedTag}`,
      });
    }

    const isMember = group.members.some(
      (m) => m.toString() === req.user._id.toString()
    );
    const hasPendingRequest = group.pendingRequests.some(
      (p) => p.user.toString() === req.user._id.toString()
    );

    res.status(200).json({
      success: true,
      data: {
        group,
        isMember,
        hasPendingRequest,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while searching group.",
    });
  }
};

// @desc    Join group or request entry
// @route   POST /api/groups/:groupId/join
export const joinGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found.",
      });
    }

    if (group.status === "expired" || (group.isSessionGroup && new Date() >= group.expiresAt)) {
      return res.status(403).json({
        success: false,
        message: "This session group has expired.",
      });
    }

    const isAlreadyMember = group.members.some(
      (m) => m.toString() === req.user._id.toString()
    );
    if (isAlreadyMember) {
      return res.status(400).json({
        success: false,
        message: "You are already a member of this group.",
      });
    }

    if (group.joinMode === "closed") {
      return res.status(403).json({
        success: false,
        message: "This group is closed to new members.",
      });
    }

    if (group.joinMode === "invite_only") {
      const alreadyPending = group.pendingRequests.some(
        (p) => p.user.toString() === req.user._id.toString()
      );
      if (alreadyPending) {
        return res.status(400).json({
          success: false,
          message: "You have already requested to join this group. Please wait for admin approval.",
        });
      }

      group.pendingRequests.push({ user: req.user._id });
      await group.save();

      return res.status(200).json({
        success: true,
        message: "Join request submitted. Waiting for admin approval.",
        data: { status: "pending" },
      });
    }

    // Public join
    group.members.push(req.user._id);
    await group.save();

    // Create system notification message
    await Message.create({
      chatType: "group",
      chatId: group._id,
      sender: req.user._id,
      content: `@${req.user.username} joined the group via ID ${group.groupTag}`,
      isSystemMessage: true,
    });

    res.status(200).json({
      success: true,
      message: "Successfully joined the group.",
      data: group,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while joining group.",
    });
  }
};

// @desc    Admin approve or reject join request
// @route   POST /api/groups/:groupId/requests/:userId
export const handleJoinRequest = async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { action } = req.body; // 'approve' | 'reject'

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (group.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only group admins can manage join requests." });
    }

    const requestIndex = group.pendingRequests.findIndex(
      (p) => p.user.toString() === userId
    );

    if (requestIndex === -1) {
      return res.status(404).json({ success: false, message: "Join request not found." });
    }

    group.pendingRequests.splice(requestIndex, 1);

    if (action === "approve") {
      if (!group.members.some((m) => m.toString() === userId)) {
        group.members.push(userId);
      }
      await group.save();

      return res.status(200).json({
        success: true,
        message: "Request approved and user added to group.",
        data: group,
      });
    }

    await group.save();
    res.status(200).json({
      success: true,
      message: "Request rejected.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while handling join request.",
    });
  }
};

// @desc    Admin update group settings
// @route   PATCH /api/groups/:groupId/settings
export const updateGroupSettings = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { joinMode, description, extendMinutes } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (group.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only group admins can modify group settings." });
    }

    if (joinMode && ["public", "invite_only", "closed"].includes(joinMode)) {
      group.joinMode = joinMode;
    }

    if (typeof description === "string") {
      group.description = description.trim();
    }

    if (extendMinutes && group.isSessionGroup) {
      const currentExpiry = new Date(group.expiresAt).getTime();
      group.expiresAt = new Date(Math.max(Date.now(), currentExpiry) + Number(extendMinutes) * 60 * 1000);
      group.status = "active";
    }

    await group.save();

    res.status(200).json({
      success: true,
      message: "Group settings updated successfully.",
      data: group,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while updating group settings.",
    });
  }
};

// @desc    Admin pin/unpin a message
// @route   POST /api/groups/:groupId/pin/:messageId
export const togglePinMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (group.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only group admins can pin messages." });
    }

    const pinIndex = group.pinnedMessages.indexOf(messageId);
    let isPinned = false;

    if (pinIndex > -1) {
      group.pinnedMessages.splice(pinIndex, 1);
      isPinned = false;
    } else {
      group.pinnedMessages.push(messageId);
      isPinned = true;
    }

    await group.save();

    res.status(200).json({
      success: true,
      message: isPinned ? "Message pinned." : "Message unpinned.",
      data: { pinnedMessages: group.pinnedMessages },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while toggling pin.",
    });
  }
};

// @desc    Remove member or leave group
// @route   DELETE /api/groups/:groupId/members/:userId
export const removeMember = async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    const isAdmin = group.admin.toString() === req.user._id.toString();
    const isSelf = req.user._id.toString() === userId;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ success: false, message: "Not authorized to remove this member." });
    }

    group.members = group.members.filter((m) => m.toString() !== userId);
    await group.save();

    res.status(200).json({
      success: true,
      message: isSelf ? "Left group successfully." : "Member removed from group.",
      data: group,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while removing member.",
    });
  }
};
