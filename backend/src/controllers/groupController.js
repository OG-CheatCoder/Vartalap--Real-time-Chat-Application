import { customAlphabet } from "nanoid";
import Group from "../models/Group.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

// Pure random 8-character alphanumeric Group ID (no static prefix)
const generateNano = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);
const generateGroupTag = () => `#${generateNano()}`;

const MODE_LABELS = {
  public: "Anyone Can Join",
  invite_only: "Invite Only",
  closed: "Closed",
};

const DURATION_LABELS = {
  0: "Off",
  86400: "24 hours",
  604800: "7 days",
  2592000: "30 days",
};

const getPopulatedGroup = (groupId) =>
  Group.findById(groupId)
    .populate("admin", "fullName username avatarUrl")
    .populate("admins", "fullName username avatarUrl")
    .populate("members", "fullName username avatarUrl lastSeen")
    .populate("pendingRequests.user", "fullName username avatarUrl")
    .populate("lastMessage");

const toId = (val) => (val?._id || val)?.toString();

export const isUserAdmin = (group, userId) => {
  if (!group || !userId) return false;
  const uId = userId.toString();
  if (toId(group.admin) === uId) return true;
  return Array.isArray(group.admins) && group.admins.some((a) => toId(a) === uId);
};

export const getPrimaryAdminId = (group) => {
  if (!group) return null;
  if (Array.isArray(group.admins) && group.admins.length > 0) {
    return toId(group.admins[0]);
  }
  return toId(group.admin);
};

const syncAdminsOrder = (group) => {
  if (!group.admins || group.admins.length === 0) {
    group.admins = group.admin ? [group.admin] : [];
  } else {
    group.admin = group.admins[0];
  }
};

const emitGroupSync = (io, populatedGroup, extraUserIds = []) => {
  if (!io || !populatedGroup) return;
  const groupId = populatedGroup._id.toString();
  io.to(`group:${groupId}`).emit("group:updated", populatedGroup);

  const recipientIds = new Set(
    (populatedGroup.members || []).map((m) => toId(m)).filter(Boolean)
  );
  extraUserIds.forEach((id) => {
    if (id) recipientIds.add(id.toString());
  });

  recipientIds.forEach((uId) => {
    io.to(`user:${uId}`).emit("group:updated", populatedGroup);
  });
};

// Emit system announcement helper (queued ephemerally until all group members ACK receipt)
const createSystemAnnouncement = async (io, group, actorId, content) => {
  const memberIds = (group.members || []).map((m) => toId(m)).filter(Boolean);

  const sysMsg = await Message.create({
    chatType: "group",
    chatId: group._id,
    sender: actorId,
    content,
    isSystemMessage: true,
    pendingRecipients: memberIds,
  });

  group.updatedAt = new Date();
  await group.save();

  const populatedMsg = await Message.findById(sysMsg._id).populate(
    "sender",
    "fullName username avatarUrl"
  );

  if (io) {
    io.to(`group:${group._id}`).emit("message:new", populatedMsg);
    memberIds.forEach((mId) => {
      io.to(`user:${mId}`).emit("message:new", populatedMsg);
      io.to(`user:${mId}`).emit("sidebar:update", populatedMsg);
    });
  }

  return populatedMsg;
};

// @desc    Create a new group (Permanent or Scheduled/Session-Based)
// @route   POST /api/groups
export const createGroup = async (req, res) => {
  try {
    const {
      name,
      description,
      joinMode,
      isSessionGroup,
      durationMinutes,
      startsAt: rawStartsAt,
      expiresAt: rawExpiresAt,
      customExpiresAt,
      disappearingDuration = 0,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Group name is required." });
    }

    let groupTag = generateGroupTag();
    while (await Group.findOne({ groupTag })) {
      groupTag = generateGroupTag();
    }

    let startsAt = null;
    let expiresAt = null;
    let initialStatus = "active";

    if (isSessionGroup) {
      const now = new Date();
      startsAt = rawStartsAt ? new Date(rawStartsAt) : now;
      if (Number.isNaN(startsAt.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid session start date/time." });
      }

      if (rawExpiresAt || customExpiresAt) {
        expiresAt = new Date(rawExpiresAt || customExpiresAt);
      } else if (durationMinutes) {
        expiresAt = new Date(startsAt.getTime() + Number(durationMinutes) * 60 * 1000);
      } else {
        expiresAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
      }

      if (Number.isNaN(expiresAt.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid session end date/time." });
      }

      if (expiresAt <= startsAt) {
        return res.status(400).json({
          success: false,
          message: "Session end date/time must be strictly after start date/time.",
        });
      }

      if (expiresAt <= now) {
        return res.status(400).json({
          success: false,
          message: "Session end date/time must be in the future.",
        });
      }

      if (startsAt > now) {
        initialStatus = "scheduled";
      }
    }

    const validDisappear = [0, 86400, 604800, 2592000].includes(Number(disappearingDuration))
      ? Number(disappearingDuration)
      : 0;

    const group = await Group.create({
      name: name.trim(),
      description: (description || "").trim(),
      groupTag,
      admin: req.user._id,
      admins: [req.user._id],
      members: [req.user._id],
      joinMode: ["public", "invite_only", "closed"].includes(joinMode) ? joinMode : "public",
      isSessionGroup: Boolean(isSessionGroup),
      startsAt,
      expiresAt,
      status: initialStatus,
      disappearingDuration: validDisappear,
      pinnedMessages: [],
    });

    const populatedGroup = await getPopulatedGroup(group._id);

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
      .populate("admins", "fullName username avatarUrl")
      .populate("members", "fullName username avatarUrl lastSeen")
      .populate("pendingRequests.user", "fullName username avatarUrl")
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    const cleanGroups = groups.map((g) => {
      const obj = g.toObject();
      if (
        obj.lastMessage?.deletedFor?.some(
          (id) => id.toString() === req.user._id.toString()
        )
      ) {
        obj.lastMessage = null;
      }
      return obj;
    });

    res.status(200).json({ success: true, data: cleanGroups });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching groups.",
    });
  }
};

// @desc    Search group by random unique ID (#XXXXXXXX or #VRT-XXXX)
// @route   GET /api/groups/search
export const searchGroupByTag = async (req, res) => {
  try {
    const { tag } = req.query;
    if (!tag) {
      return res.status(400).json({ success: false, message: "Please provide a group ID to search." });
    }

    const raw = tag.trim().toUpperCase();
    const normalizedTag = raw.startsWith("#") ? raw : `#${raw}`;

    const group = await Group.findOne({ groupTag: normalizedTag })
      .populate("admin", "fullName username avatarUrl")
      .populate("admins", "fullName username avatarUrl")
      .select("-pinnedMessages");

    if (!group) {
      return res.status(404).json({ success: false, message: `No group found with ID ${normalizedTag}` });
    }

    const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
    const hasPendingRequest = group.pendingRequests.some(
      (p) => toId(p.user) === req.user._id.toString()
    );

    res.status(200).json({
      success: true,
      data: { group, isMember, hasPendingRequest },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while searching group.",
    });
  }
};

// @desc    Join a group via ID
// @route   POST /api/groups/:groupId/join
export const joinGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (group.status === "expired" || (group.isSessionGroup && new Date() >= group.expiresAt)) {
      return res.status(403).json({ success: false, message: "This session group has expired." });
    }

    if (group.members.some((m) => m.toString() === req.user._id.toString())) {
      return res.status(400).json({ success: false, message: "You are already a member of this group." });
    }

    if (group.joinMode === "closed") {
      return res.status(403).json({ success: false, message: "This group is closed to new members." });
    }

    if (group.joinMode === "invite_only") {
      const alreadyPending = group.pendingRequests.some(
        (p) => toId(p.user) === req.user._id.toString()
      );
      if (alreadyPending) {
        return res.status(400).json({
          success: false,
          message: "You have already requested to join this group. Please wait for admin approval.",
        });
      }

      group.pendingRequests.push({ user: req.user._id });
      await group.save();

      const populatedGroup = await getPopulatedGroup(group._id);
      emitGroupSync(req.io, populatedGroup);

      return res.status(200).json({
        success: true,
        message: "Join request submitted. Waiting for admin approval.",
        data: { status: "pending" },
      });
    }

    group.members.push(req.user._id);
    await createSystemAnnouncement(
      req.io,
      group,
      req.user._id,
      `@${req.user.username} joined the group via ID ${group.groupTag}`
    );

    const populatedGroup = await getPopulatedGroup(group._id);
    emitGroupSync(req.io, populatedGroup);

    res.status(200).json({
      success: true,
      message: "Joined group successfully.",
      data: populatedGroup,
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
    const { action } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (!isUserAdmin(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "Only group admins can manage join requests." });
    }

    const requestIndex = group.pendingRequests.findIndex(
      (p) => toId(p.user) === userId.toString()
    );

    if (requestIndex === -1) {
      return res.status(404).json({ success: false, message: "Join request not found." });
    }

    group.pendingRequests.splice(requestIndex, 1);

    if (action === "approve") {
      if (!group.members.some((m) => toId(m) === userId.toString())) {
        group.members.push(userId);
      }

      const targetUser = await User.findById(userId);
      const targetName = targetUser ? `@${targetUser.username}` : "A new user";
      await createSystemAnnouncement(
        req.io,
        group,
        req.user._id,
        `${targetName} was accepted into the group by @${req.user.username}`
      );

      const populatedGroup = await getPopulatedGroup(groupId);
      emitGroupSync(req.io, populatedGroup, [userId]);

      return res.status(200).json({
        success: true,
        message: "Request approved and user added to group.",
        data: populatedGroup,
      });
    }

    await group.save();
    const populatedGroup = await getPopulatedGroup(groupId);
    emitGroupSync(req.io, populatedGroup);

    res.status(200).json({
      success: true,
      message: "Request rejected.",
      data: populatedGroup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while handling join request.",
    });
  }
};

// @desc    Admin update group settings + broadcast mode-change announcement
// @route   PATCH /api/groups/:groupId/settings
export const updateGroupSettings = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { joinMode, description, extendMinutes } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (!isUserAdmin(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "Only group admins can modify group settings." });
    }

    const prevMode = group.joinMode;
    let modeChanged = false;

    if (joinMode && ["public", "invite_only", "closed"].includes(joinMode)) {
      if (joinMode !== prevMode) {
        group.joinMode = joinMode;
        modeChanged = true;
      }
    }

    if (typeof description === "string") {
      group.description = description.trim();
    }

    if (extendMinutes && group.isSessionGroup) {
      const currentExpiry = new Date(group.expiresAt).getTime();
      group.expiresAt = new Date(Math.max(Date.now(), currentExpiry) + Number(extendMinutes) * 60 * 1000);
      group.status = "active";
    }

    if (modeChanged) {
      await createSystemAnnouncement(
        req.io,
        group,
        req.user._id,
        `@${req.user.username} changed the group mode to "${MODE_LABELS[group.joinMode]}"`
      );
    } else {
      await group.save();
    }

    const populatedGroup = await getPopulatedGroup(groupId);
    emitGroupSync(req.io, populatedGroup);

    res.status(200).json({
      success: true,
      message: "Group settings updated successfully.",
      data: populatedGroup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while updating group settings.",
    });
  }
};

// @desc    Admin update group disappearing message timer
// @route   PATCH /api/groups/:groupId/disappearing
export const updateGroupDisappearingTimer = async (req, res) => {
  try {
    const { groupId } = req.params;
    const duration = Number(req.body.duration);

    if (![0, 86400, 604800, 2592000].includes(duration)) {
      return res.status(400).json({
        success: false,
        message: "Duration must be 0 (Off), 86400 (24h), 604800 (7d), or 2592000 (30d).",
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (!isUserAdmin(group, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Only group admins can configure disappearing messages.",
      });
    }

    group.disappearingDuration = duration;
    const text =
      duration > 0
        ? `@${req.user.username} turned on disappearing messages (${DURATION_LABELS[duration]}).`
        : `@${req.user.username} turned off disappearing messages.`;

    await createSystemAnnouncement(req.io, group, req.user._id, text);
    const populatedGroup = await getPopulatedGroup(groupId);
    emitGroupSync(req.io, populatedGroup);

    res.status(200).json({
      success: true,
      message: text,
      data: populatedGroup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error updating group disappearing timer.",
    });
  }
};

// @desc    Leave group
// @route   POST /api/groups/:groupId/leave
export const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { newAdminId } = req.body;
    const userId = req.user._id.toString();

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (!group.members.some((m) => m.toString() === userId)) {
      return res.status(400).json({ success: false, message: "You are not a member of this group." });
    }

    const otherMembers = group.members.filter((m) => m.toString() !== userId);

    if (otherMembers.length === 0) {
      await Message.deleteMany({ chatId: group._id });
      await Group.findByIdAndDelete(groupId);
      if (req.io) {
        req.io.to(`group:${groupId}`).emit("group:deleted", { groupId });
        req.io.emit("sidebar:update", { chatId: groupId, chatType: "group", isDeleted: true });
      }
      return res.status(200).json({
        success: true,
        message: "You were the last member. Group deleted.",
        data: { deleted: true, groupId },
      });
    }

    syncAdminsOrder(group);

    if (isUserAdmin(group, userId)) {
      const otherAdmins = group.admins.filter((a) => toId(a) !== userId);

      if (otherAdmins.length === 0) {
        if (!newAdminId) {
          return res.status(400).json({
            success: false,
            message: "You are the only admin. Please choose a new admin before leaving.",
            code: "NEW_ADMIN_REQUIRED",
          });
        }

        const isNewAdminMember = otherMembers.some((m) => m.toString() === newAdminId.toString());
        if (!isNewAdminMember) {
          return res.status(400).json({
            success: false,
            message: "Selected new admin is not a member of this group.",
          });
        }

        group.admins.push(newAdminId);
      }
    }

    group.members = otherMembers;
    group.admins = group.admins.filter((a) => toId(a) !== userId);
    syncAdminsOrder(group);

    await createSystemAnnouncement(req.io, group, req.user._id, `@${req.user.username} left the group.`);

    const populatedGroup = await getPopulatedGroup(group._id);
    emitGroupSync(req.io, populatedGroup, [userId]);

    res.status(200).json({
      success: true,
      message: "You have left the group.",
      data: { groupId },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while leaving group.",
    });
  }
};

// @desc    Promote or demote admin with seniority protection
// @route   POST /api/groups/:groupId/admins/:userId
export const updateMemberRole = async (req, res) => {
  try {
    const { groupId } = req.params;
    const targetUserId = (req.params.targetUserId || req.params.userId)?.toString();
    const actorId = req.user._id.toString();
    const { action } = req.body;

    if (!targetUserId || !["promote", "demote"].includes(action)) {
      return res.status(400).json({ success: false, message: "Valid target user ID and action are required." });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (!isUserAdmin(group, actorId)) {
      return res.status(403).json({ success: false, message: "Only group admins can manage roles." });
    }

    if (!group.members.some((m) => m.toString() === targetUserId)) {
      return res.status(400).json({ success: false, message: "Target user is not a member of this group." });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    syncAdminsOrder(group);
    const primaryAdminId = getPrimaryAdminId(group);

    let content = "";
    if (action === "promote") {
      if (!group.admins.some((a) => toId(a) === targetUserId)) {
        group.admins.push(targetUserId);
      }
      content = `@${targetUser.username} is now an admin.`;
    } else {
      if (group.admins.length <= 1) {
        return res.status(400).json({
          success: false,
          message: "A group must have at least one admin. Promote another member first.",
        });
      }

      const isSelfDemotion = targetUserId === actorId;
      if (!isSelfDemotion && actorId !== primaryAdminId) {
        return res.status(403).json({
          success: false,
          message: "Only the primary (first / longest-serving) admin can demote other admins.",
        });
      }

      group.admins = group.admins.filter((a) => toId(a) !== targetUserId);
      syncAdminsOrder(group);

      content = isSelfDemotion
        ? `@${targetUser.username} stepped down from admin.`
        : `@${targetUser.username} is no longer an admin.`;
    }

    await createSystemAnnouncement(req.io, group, req.user._id, content);

    const populatedGroup = await getPopulatedGroup(groupId);
    emitGroupSync(req.io, populatedGroup);

    res.status(200).json({
      success: true,
      message: content,
      data: populatedGroup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while updating member role.",
    });
  }
};

// @desc    Remove member
// @route   DELETE /api/groups/:groupId/members/:userId
export const removeMember = async (req, res) => {
  try {
    const { groupId, userId: targetUserId } = req.params;
    const actorId = req.user._id.toString();

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (actorId === targetUserId) {
      return res.status(400).json({ success: false, message: "Use Exit Group to leave the group." });
    }

    if (!isUserAdmin(group, actorId)) {
      return res.status(403).json({ success: false, message: "Only group admins can remove members." });
    }

    if (!group.members.some((m) => m.toString() === targetUserId)) {
      return res.status(404).json({ success: false, message: "User is not a member of this group." });
    }

    syncAdminsOrder(group);
    const primaryAdminId = getPrimaryAdminId(group);
    const targetIsAdmin = isUserAdmin(group, targetUserId);

    if (targetUserId === primaryAdminId) {
      return res.status(403).json({
        success: false,
        message: "The primary admin cannot be removed unless they step down or leave the group.",
      });
    }

    if (targetIsAdmin && actorId !== primaryAdminId) {
      return res.status(403).json({
        success: false,
        message: "Only the primary (first / longest-serving) admin can remove another admin.",
      });
    }

    const targetUser = await User.findById(targetUserId);
    group.members = group.members.filter((m) => m.toString() !== targetUserId);
    group.admins = group.admins.filter((a) => toId(a) !== targetUserId);
    syncAdminsOrder(group);

    const targetLabel = targetUser ? `@${targetUser.username}` : "A member";
    await createSystemAnnouncement(
      req.io,
      group,
      req.user._id,
      `${targetLabel} was removed from the group by @${req.user.username}.`
    );

    const populatedGroup = await getPopulatedGroup(groupId);
    emitGroupSync(req.io, populatedGroup, [targetUserId]);

    res.status(200).json({
      success: true,
      message: "Member removed from group.",
      data: populatedGroup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while removing member.",
    });
  }
};

// @desc    Admin delete group completely
// @route   DELETE /api/groups/:groupId
export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (!isUserAdmin(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "Only group admins can delete the group." });
    }

    await Message.deleteMany({ chatId: groupId });
    await Group.findByIdAndDelete(groupId);

    if (req.io) {
      req.io.to(`group:${groupId}`).emit("group:deleted", { groupId });
      req.io.emit("sidebar:update", { chatId: groupId, chatType: "group", isDeleted: true });
      req.io.emit("group:deleted", { groupId });
    }

    res.status(200).json({
      success: true,
      message: "Group and its messages deleted successfully.",
      data: { groupId },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while deleting group.",
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

    if (!isUserAdmin(group, req.user._id)) {
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
