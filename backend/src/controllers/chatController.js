import mongoose from "mongoose";
import User from "../models/User.js";
import Group from "../models/Group.js";
import Message from "../models/Message.js";
import DirectChat from "../models/DirectChat.js";
import PendingEvent from "../models/PendingEvent.js";
import ScheduledMessage from "../models/ScheduledMessage.js";

const toId = (val) => (val?._id || val)?.toString();
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const checkDirectBlockState = async (senderId, peerId) => {
  if (!senderId || !peerId) return { blockedBySender: false, blockedByPeer: false };
  const [senderDoc, peerDoc] = await Promise.all([
    User.findById(senderId).select("blockedUsers").lean(),
    User.findById(peerId).select("blockedUsers").lean(),
  ]);
  const sId = senderId.toString();
  const pId = peerId.toString();
  return {
    blockedBySender: Boolean(senderDoc?.blockedUsers?.some((id) => id.toString() === pId)),
    blockedByPeer: Boolean(peerDoc?.blockedUsers?.some((id) => id.toString() === sId)),
  };
};

const isSocketOnline = (io, userId) => {
  if (!io || !userId) return false;
  const room = io.sockets.adapter.rooms.get(`user:${userId.toString()}`);
  return Boolean(room && room.size > 0);
};

const populateMessageById = (messageId) =>
  Message.findById(messageId)
    .populate("sender", "fullName username avatarUrl")
    .populate({
      path: "replyTo",
      select: "content sender mediaType fileName isDeletedForEveryone",
      populate: { path: "sender", select: "fullName username" },
    });

// Always persist receipt in PendingEvent first so receipts survive mid-reload/account-switch races,
// then emit via live socket with eventId for immediate client ACK after IndexedDB write.
const deliverOrQueueReceipt = async (
  io,
  { targetUser, chatType, chatId, messageId, eventType, payload = {} }
) => {
  const tId = targetUser?.toString();
  if (!tId || !messageId) return;

  let savedEventId = null;
  if (mongoose.Types.ObjectId.isValid(tId) && mongoose.Types.ObjectId.isValid(messageId)) {
    const evDoc = await PendingEvent.findOneAndUpdate(
      { targetUser: tId, messageId, eventType },
      {
        targetUser: tId,
        chatType,
        chatId,
        messageId,
        eventType,
        payload,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      { upsert: true, new: true }
    );
    savedEventId = evDoc?._id?.toString() || null;
  }

  if (isSocketOnline(io, tId)) {
    const socketEvent =
      eventType === "delivered"
        ? "message:delivered"
        : eventType === "seen"
        ? "message:seen"
        : null;
    if (socketEvent) {
      io.to(`user:${tId}`).emit(socketEvent, {
        messageId: messageId.toString(),
        chatType,
        chatId: chatId.toString(),
        deliveryStatus: eventType,
        eventId: savedEventId,
        ...payload,
      });
    }
  }
};

// Helper to get participant/member IDs for any direct or group chat
const getChatMemberIds = async (chatType, chatId, requestingUserId) => {
  if (chatType === "group") {
    const group = await Group.findById(chatId);
    if (!group) return { errorStatus: 404, errorMsg: "Group not found." };
    const members = (group.members || []).map((m) => toId(m));
    if (!members.includes(requestingUserId.toString())) {
      return { errorStatus: 403, errorMsg: "You are not a member of this group." };
    }
    return { chatDoc: group, memberIds: members };
  }

  if (chatType === "direct") {
    const directChat = await DirectChat.findById(chatId);
    if (!directChat) return { errorStatus: 404, errorMsg: "Direct chat not found." };
    const members = (directChat.participants || []).map((p) => toId(p));
    if (!members.includes(requestingUserId.toString())) {
      return { errorStatus: 403, errorMsg: "You are not a participant in this conversation." };
    }
    return { chatDoc: directChat, memberIds: members };
  }

  return { errorStatus: 400, errorMsg: "Invalid chatType. Must be 'direct' or 'group'." };
};

/**
 * Core Delete-on-Delivery Engine:
 * Pulls acknowledging user from `pendingRecipients`, deletes any message with zero remaining
 * pending recipients immediately from MongoDB, and sends/queues `delivered` receipt to sender.
 */
export const acknowledgeMessagesForUser = async (
  io,
  userId,
  messageIds = [],
  eventIds = []
) => {
  const uId = userId?.toString();
  if (!uId) return { deletedCount: 0, eventsCleared: 0 };

  let deletedCount = 0;

  if (Array.isArray(messageIds) && messageIds.length > 0) {
    const validIds = messageIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length > 0) {
      const queuedDocs = await Message.find({
        _id: { $in: validIds },
        pendingRecipients: uId,
      }).select("_id sender chatType chatId isSystemMessage");

      if (queuedDocs.length > 0) {
        await Message.updateMany(
          { _id: { $in: queuedDocs.map((m) => m._id) } },
          { $pull: { pendingRecipients: new mongoose.Types.ObjectId(uId) } }
        );

        const fullyDelivered = await Message.find({
          _id: { $in: queuedDocs.map((m) => m._id) },
          pendingRecipients: { $size: 0 },
        }).select("_id sender chatType chatId isSystemMessage");

        if (fullyDelivered.length > 0) {
          const deleteIds = fullyDelivered.map((m) => m._id);
          const delResult = await Message.deleteMany({ _id: { $in: deleteIds } });
          deletedCount = delResult.deletedCount || 0;

          for (const doc of fullyDelivered) {
            if (doc.isSystemMessage) continue;
            await deliverOrQueueReceipt(io, {
              targetUser: doc.sender,
              chatType: doc.chatType,
              chatId: doc.chatId,
              messageId: doc._id,
              eventType: "delivered",
            });
          }
        }
      }
    }
  }

  let eventsCleared = 0;
  if (Array.isArray(eventIds) && eventIds.length > 0) {
    const validEventIds = eventIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validEventIds.length > 0) {
      const evDel = await PendingEvent.deleteMany({
        _id: { $in: validEventIds },
        targetUser: uId,
      });
      eventsCleared = evDel.deletedCount || 0;
    }
  }

  return { deletedCount, eventsCleared };
};

/**
 * Core Read / Seen Receipt Engine:
 * Routes blue-tick `seen` receipts to online senders immediately OR persists as PendingEvent
 * for offline senders so blue ticks NEVER fail to sync across reloads or relaunches.
 */
export const processSeenReceipts = async (io, readerUserId, items = []) => {
  const readerId = readerUserId?.toString();
  if (!readerId || !Array.isArray(items) || items.length === 0) return;

  for (const item of items) {
    const { messageId, senderId, chatType, chatId } = item || {};
    if (!messageId || !senderId || !chatType || !chatId) continue;
    if (senderId.toString() === readerId) continue;

    await deliverOrQueueReceipt(io, {
      targetUser: senderId,
      chatType,
      chatId,
      messageId,
      eventType: "seen",
      payload: { seenBy: readerId },
    });
  }
};

// @desc    Mark messages as seen via HTTP fallback
// @route   POST /api/messages/seen
export const markMessagesSeen = async (req, res) => {
  try {
    const { items = [] } = req.body || {};
    await processSeenReceipts(req.io, req.user._id, items);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error marking messages seen.",
    });
  }
};

// @desc    Search verified users by name or @username (min 3 characters)
// @route   GET /api/users/search?q=
export const searchUsers = async (req, res) => {
  try {
    const raw = (req.query.q || "").trim();
    if (raw.length < 3) {
      return res.status(200).json({ success: true, data: [] });
    }

    const isUsernamePrefixed = raw.startsWith("@");
    const term = raw.replace(/^@+/, "").trim();
    if (!term) return res.status(200).json({ success: true, data: [] });

    const safePattern = escapeRegex(term);
    const searchFilter = isUsernamePrefixed
      ? { username: { $regex: safePattern, $options: "i" } }
      : {
          $or: [
            { fullName: { $regex: safePattern, $options: "i" } },
            { username: { $regex: safePattern, $options: "i" } },
          ],
        };

    const users = await User.find({
      ...searchFilter,
      _id: { $ne: req.user._id },
      isVerified: true,
    })
      .select("fullName username avatarUrl lastSeen")
      .sort({ fullName: 1, username: 1 })
      .limit(100)
      .lean();

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while searching users.",
    });
  }
};

// @desc    Get list of blocked users
// @route   GET /api/users/blocked
export const getBlockedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("blockedUsers", "fullName username avatarUrl")
      .lean();

    res.status(200).json({
      success: true,
      data: user?.blockedUsers || [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching blocked users.",
    });
  }
};

// @desc    Block a user
// @route   POST /api/users/:targetUserId/block
export const blockUser = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "Cannot block yourself." });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { blockedUsers: targetUserId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "User blocked.",
      data: { blockedUsers: (updated.blockedUsers || []).map((id) => id.toString()) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while blocking user.",
    });
  }
};

// @desc    Unblock a user
// @route   DELETE /api/users/:targetUserId/block
export const unblockUser = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { blockedUsers: targetUserId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "User unblocked.",
      data: { blockedUsers: (updated.blockedUsers || []).map((id) => id.toString()) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while unblocking user.",
    });
  }
};

// @desc    Fetch ALL pending offline messages & control/receipt events for current user
// @route   GET /api/messages/pending
export const getPendingSync = async (req, res) => {
  try {
    const [pendingMessages, pendingEvents] = await Promise.all([
      Message.find({
        pendingRecipients: req.user._id,
        deletedFor: { $ne: req.user._id },
      })
        .populate("sender", "fullName username avatarUrl")
        .populate({
          path: "replyTo",
          select: "content sender mediaType fileName isDeletedForEveryone",
          populate: { path: "sender", select: "fullName username" },
        })
        .sort({ createdAt: 1 })
        .lean(),
      PendingEvent.find({ targetUser: req.user._id })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        messages: pendingMessages,
        events: pendingEvents,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while syncing pending messages.",
    });
  }
};

// @desc    Confirm device-level message/event receipt
// @route   POST /api/messages/ack
export const ackMessages = async (req, res) => {
  try {
    const { messageIds = [], eventIds = [] } = req.body || {};
    const result = await acknowledgeMessagesForUser(
      req.io,
      req.user._id,
      messageIds,
      eventIds
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error confirming message delivery.",
    });
  }
};

// @desc    Fetch only pending offline messages for a specific chat
// @route   GET /api/messages/:chatType/:chatId
export const getMessages = async (req, res) => {
  try {
    const { chatType, chatId } = req.params;
    const { errorStatus, errorMsg } = await getChatMemberIds(chatType, chatId, req.user._id);
    if (errorStatus) {
      return res.status(errorStatus).json({ success: false, message: errorMsg });
    }

    const queuedMessages = await Message.find({
      chatType,
      chatId,
      deletedFor: { $ne: req.user._id },
      $or: [
        { pendingRecipients: req.user._id },
        { pendingRecipients: { $exists: false } },
      ],
    })
      .populate("sender", "fullName username avatarUrl")
      .populate({
        path: "replyTo",
        select: "content sender mediaType fileName isDeletedForEveryone",
        populate: { path: "sender", select: "fullName username" },
      })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    res.status(200).json({
      success: true,
      data: queuedMessages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching pending messages.",
    });
  }
};

/**
 * Core shared relay helper used by both immediate `sendMessage` and offline-capable
 * `processDueScheduledMessages`. Implements WhatsApp-style stealth blocking:
 * - If sender blocked peer -> 403 error ("Unblock them to send messages").
 * - If peer blocked sender -> stealth-succeeds with 201 & single tick ("sent") for sender ONLY;
 *   never stores in MongoDB queue, never notifies peer, never delivers even if peer unblocks later.
 */
const relayMessageToChat = async ({
  io,
  senderUser,
  chatType,
  chatId,
  content = "",
  mediaUrl = "",
  mediaType = "text",
  fileName = "",
  fileSize = 0,
  replyTo = null,
  replyPreview = null,
  recordSenderOfflineEvent = false,
  scheduledMessageId = null,
}) => {
  const { chatDoc, memberIds, errorStatus, errorMsg } = await getChatMemberIds(
    chatType,
    chatId,
    senderUser._id
  );
  if (errorStatus) {
    return { errorStatus, errorMsg };
  }

  const now = new Date();
  if (chatType === "group" && chatDoc.isSessionGroup) {
    if (chatDoc.status === "scheduled" || (chatDoc.startsAt && now < new Date(chatDoc.startsAt))) {
      return { errorStatus: 403, errorMsg: "This session group has not started yet." };
    }
    if (chatDoc.status === "expired" || (chatDoc.expiresAt && now >= new Date(chatDoc.expiresAt))) {
      return { errorStatus: 403, errorMsg: "This session group has expired." };
    }
  }

  const senderId = senderUser._id.toString();
  const recipientIds = memberIds.filter((id) => id !== senderId);
  let stealthBlocked = false;

  if (chatType === "direct" && recipientIds.length > 0) {
    const peerId = recipientIds[0];
    const { blockedBySender, blockedByPeer } = await checkDirectBlockState(senderId, peerId);

    if (blockedBySender) {
      return {
        errorStatus: 403,
        errorMsg: "You have blocked this user. Unblock them to send messages.",
      };
    }

    if (blockedByPeer) {
      stealthBlocked = true;
    } else if (chatDoc.hiddenFor?.some((id) => id.toString() === peerId)) {
      chatDoc.hiddenFor = chatDoc.hiddenFor.filter((id) => id.toString() !== peerId);
    }
  }

  const durationSec = Number(chatDoc.disappearingDuration) || 0;
  const disappearAt = durationSec > 0 ? new Date(Date.now() + durationSec * 1000) : null;
  const queueExpiresAt = disappearAt
    ? new Date(Math.min(Date.now() + 30 * 24 * 60 * 60 * 1000, disappearAt.getTime()))
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  let wireMessage;

  if (recipientIds.length === 0 || stealthBlocked) {
    wireMessage = {
      _id: new mongoose.Types.ObjectId().toString(),
      chatType,
      chatId: chatId.toString(),
      sender: {
        _id: senderUser._id,
        fullName: senderUser.fullName,
        username: senderUser.username,
        avatarUrl: senderUser.avatarUrl || "",
      },
      content: content.trim(),
      mediaUrl: mediaUrl.trim(),
      mediaType: mediaUrl ? mediaType : "text",
      fileName: fileName.trim(),
      fileSize: Number(fileSize) || 0,
      replyTo: replyTo || null,
      replyPreview: replyPreview || null,
      isSystemMessage: false,
      isPinned: false,
      isEdited: false,
      starredBy: [],
      disappearAt,
      deliveryStatus: stealthBlocked ? "sent" : "seen",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (stealthBlocked && chatDoc.hiddenFor?.some((id) => id.toString() === senderId)) {
      chatDoc.hiddenFor = chatDoc.hiddenFor.filter((id) => id.toString() !== senderId);
      await chatDoc.save();
    }
  } else {
    const message = await Message.create({
      chatType,
      chatId,
      sender: senderUser._id,
      content: content.trim(),
      mediaUrl: mediaUrl.trim(),
      mediaType: mediaUrl ? mediaType : "text",
      fileName: fileName.trim(),
      fileSize: Number(fileSize) || 0,
      replyTo: replyTo || null,
      replyPreview: replyPreview || null,
      disappearAt,
      expiresAt: queueExpiresAt,
      pendingRecipients: recipientIds,
    });

    chatDoc.lastMessage = message._id;
    chatDoc.updatedAt = new Date();
    await chatDoc.save();

    const populatedDoc = await populateMessageById(message._id);
    wireMessage = {
      ...populatedDoc.toObject(),
      deliveryStatus: "sent",
    };
  }

  if (stealthBlocked) {
    // Only notify sender's own connected sessions; peer gets ZERO signal & ZERO DB queue
    if (io && isSocketOnline(io, senderId)) {
      io.to(`user:${senderId}`).emit("message:new", wireMessage);
      io.to(`user:${senderId}`).emit("sidebar:update", wireMessage);
    } else if (recordSenderOfflineEvent) {
      await PendingEvent.create({
        targetUser: senderId,
        chatType,
        chatId,
        messageId: wireMessage._id,
        eventType: "scheduled_sent",
        payload: { message: wireMessage, scheduledMessageId },
      });
    }
  } else {
    if (io) {
      io.to(`${chatType}:${chatId}`).emit("message:new", wireMessage);

      let directChatPayload = null;
      if (chatType === "direct") {
        const dc = await DirectChat.findById(chatId).populate(
          "participants",
          "fullName username avatarUrl lastSeen"
        );
        if (dc) {
          directChatPayload = { ...dc.toObject(), lastMessage: wireMessage };
        }
      }

      memberIds.forEach((mId) => {
        io.to(`user:${mId}`).emit("message:new", wireMessage);
        io.to(`user:${mId}`).emit("sidebar:update", wireMessage);
        if (directChatPayload) {
          io.to(`user:${mId}`).emit("direct_chat:sync", directChatPayload);
        }
      });
    }

    // If a scheduled message fires while sender is offline, queue copy for sender's IndexedDB
    if (recordSenderOfflineEvent && !isSocketOnline(io, senderId)) {
      await PendingEvent.create({
        targetUser: senderId,
        chatType,
        chatId,
        messageId: wireMessage._id,
        eventType: "scheduled_sent",
        payload: { message: wireMessage, scheduledMessageId },
      });
    }
  }

  return { wireMessage, stealthBlocked };
};

// @desc    Relay a message (enforces stealth block, session window, disappearing timer, ephemeral queue)
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
      replyPreview = null,
    } = req.body;

    if (!chatType || !chatId || (!content.trim() && !mediaUrl)) {
      return res.status(400).json({
        success: false,
        message: "Message content or media attachment is required.",
      });
    }

    const result = await relayMessageToChat({
      io: req.io,
      senderUser: req.user,
      chatType,
      chatId,
      content,
      mediaUrl,
      mediaType,
      fileName,
      fileSize,
      replyTo,
      replyPreview,
    });

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ success: false, message: result.errorMsg });
    }

    res.status(201).json({
      success: true,
      data: result.wireMessage,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while sending message.",
    });
  }
};

// @desc    Edit own sent message (resets seen status back to unseen unless stealth-blocked)
// @route   PATCH /api/messages/:messageId
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content, chatType: bodyChatType, chatId: bodyChatId } = req.body;

    const trimmedContent = typeof content === "string" ? content.trim() : "";
    const message = await Message.findById(messageId);

    const chatType = message?.chatType || bodyChatType;
    const chatId = message?.chatId?.toString() || bodyChatId;

    if (message) {
      if (message.isSystemMessage || message.isDeletedForEveryone) {
        return res.status(400).json({ success: false, message: "This message cannot be edited." });
      }
      if (message.sender.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "You can only edit your own messages." });
      }
      if (!trimmedContent && !message.mediaUrl) {
        return res.status(400).json({ success: false, message: "Message content cannot be empty." });
      }
      message.content = trimmedContent;
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();
    } else if (!chatType || !chatId || !trimmedContent) {
      return res.status(400).json({
        success: false,
        message: "chatType, chatId, and content are required.",
      });
    }

    const { memberIds, errorStatus, errorMsg } = await getChatMemberIds(
      chatType,
      chatId,
      req.user._id
    );
    if (errorStatus) {
      return res.status(errorStatus).json({ success: false, message: errorMsg });
    }

    const senderId = req.user._id.toString();
    const otherMembers = memberIds.filter((id) => id !== senderId);
    let stealthBlocked = false;

    if (chatType === "direct" && otherMembers.length > 0) {
      const { blockedByPeer } = await checkDirectBlockState(senderId, otherMembers[0]);
      stealthBlocked = blockedByPeer;
    }

    const activeRecipients = stealthBlocked ? [] : otherMembers;
    const anyOnline = activeRecipients.some((id) => isSocketOnline(req.io, id));

    const editedAt = message?.editedAt || new Date();
    const editPayload = {
      _id: messageId,
      senderId,
      chatType,
      chatId: chatId.toString(),
      content: trimmedContent,
      isEdited: true,
      editedAt,
      deliveryStatus: stealthBlocked ? "sent" : anyOnline ? "delivered" : "sent",
    };

    if (req.io) {
      if (stealthBlocked) {
        req.io.to(`user:${senderId}`).emit("message:updated", editPayload);
      } else {
        req.io.to(`${chatType}:${chatId}`).emit("message:updated", editPayload);
        for (const mId of activeRecipients) {
          if (isSocketOnline(req.io, mId)) {
            req.io.to(`user:${mId}`).emit("message:updated", editPayload);
          } else {
            await PendingEvent.create({
              targetUser: mId,
              chatType,
              chatId,
              messageId,
              eventType: "edit",
              payload: {
                content: trimmedContent,
                isEdited: true,
                editedAt,
                deliveryStatus: "delivered",
              },
            });
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Message updated.",
      data: editPayload,
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
    const { chatType: bodyChatType, chatId: bodyChatId, isPinned: bodyIsPinned } = req.body || {};

    const message = await Message.findById(messageId);
    const chatType = message?.chatType || bodyChatType;
    const chatId = message?.chatId?.toString() || bodyChatId;

    if (!chatType || !chatId) {
      return res.status(400).json({ success: false, message: "chatType and chatId are required." });
    }

    const { memberIds, errorStatus, errorMsg } = await getChatMemberIds(
      chatType,
      chatId,
      req.user._id
    );
    if (errorStatus) {
      return res.status(errorStatus).json({ success: false, message: errorMsg });
    }

    let nextPinned = typeof bodyIsPinned === "boolean" ? bodyIsPinned : true;
    if (message) {
      if (message.isDeletedForEveryone) {
        return res.status(400).json({ success: false, message: "Deleted messages cannot be pinned." });
      }
      message.isPinned = typeof bodyIsPinned === "boolean" ? bodyIsPinned : !message.isPinned;
      nextPinned = message.isPinned;
      await message.save();
    }

    const senderId = req.user._id.toString();
    const otherMembers = memberIds.filter((id) => id !== senderId);
    let stealthBlocked = false;
    if (chatType === "direct" && otherMembers.length > 0) {
      const { blockedByPeer } = await checkDirectBlockState(senderId, otherMembers[0]);
      stealthBlocked = blockedByPeer;
    }

    const pinPayload = {
      _id: messageId,
      chatType,
      chatId: chatId.toString(),
      isPinned: nextPinned,
    };

    if (req.io) {
      if (stealthBlocked) {
        req.io.to(`user:${senderId}`).emit("message:updated", pinPayload);
      } else {
        req.io.to(`${chatType}:${chatId}`).emit("message:updated", pinPayload);
        for (const mId of otherMembers) {
          if (isSocketOnline(req.io, mId)) {
            req.io.to(`user:${mId}`).emit("message:updated", pinPayload);
          } else {
            await PendingEvent.create({
              targetUser: mId,
              chatType,
              chatId,
              messageId,
              eventType: "pin",
              payload: { isPinned: nextPinned },
            });
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: nextPinned ? "Message pinned to top." : "Message unpinned.",
      data: pinPayload,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while pinning message.",
    });
  }
};

// @desc    Toggle star/favourite
// @route   POST /api/messages/:messageId/star
export const toggleStarMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);
    let isStarred = true;

    if (message) {
      const userId = req.user._id.toString();
      const wasStarred = message.starredBy.some((id) => id.toString() === userId);
      isStarred = !wasStarred;
      if (wasStarred) {
        message.starredBy = message.starredBy.filter((id) => id.toString() !== userId);
      } else {
        message.starredBy.push(req.user._id);
      }
      await message.save();
    }

    res.status(200).json({
      success: true,
      message: "Star updated.",
      data: { isStarred, messageId },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while starring message.",
    });
  }
};

// @desc    Delete messages (protects system announcements; relays delete-for-everyone to peers)
// @route   POST /api/messages/delete
export const deleteMessages = async (req, res) => {
  try {
    const { messageIds, deleteType, chatType: bodyChatType, chatId: bodyChatId } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ success: false, message: "messageIds array is required." });
    }

    if (deleteType === "for_me") {
      await Message.updateMany(
        { _id: { $in: messageIds }, isSystemMessage: { $ne: true } },
        {
          $addToSet: { deletedFor: req.user._id },
          $pull: { pendingRecipients: req.user._id },
        }
      );
      await Message.deleteMany({
        _id: { $in: messageIds },
        pendingRecipients: { $size: 0 },
      });

      return res.status(200).json({
        success: true,
        message: "Messages deleted for you.",
        data: { messageIds, deleteType: "for_me" },
      });
    }

    if (deleteType === "for_everyone") {
      const queuedDocs = await Message.find({ _id: { $in: messageIds } });
      const skippedSystemIds = new Set(
        queuedDocs.filter((m) => m.isSystemMessage).map((m) => m._id.toString())
      );

      let groupDoc = null;
      if (bodyChatType === "group" && bodyChatId) {
        groupDoc = await Group.findById(bodyChatId);
      }
      const isUserGroupAdmin =
        groupDoc &&
        (groupDoc.admin?.toString() === req.user._id.toString() ||
          groupDoc.admins?.some((a) => a.toString() === req.user._id.toString()));

      for (const msg of queuedDocs) {
        if (msg.isSystemMessage) continue;
        const isSender = msg.sender.toString() === req.user._id.toString();
        if (!isSender && !isUserGroupAdmin) continue;
        msg.isDeletedForEveryone = true;
        msg.isPinned = false;
        msg.content = "This message was deleted";
        msg.mediaUrl = "";
        msg.mediaType = "text";
        msg.fileName = "";
        msg.fileSize = 0;
        await msg.save();
      }

      const eligibleIds = messageIds.filter((id) => !skippedSystemIds.has(id.toString()));
      if (bodyChatType && bodyChatId && eligibleIds.length > 0) {
        const { memberIds } = await getChatMemberIds(bodyChatType, bodyChatId, req.user._id);
        const senderId = req.user._id.toString();
        const otherMembers = (memberIds || []).filter((id) => id !== senderId);
        let stealthBlocked = false;
        if (bodyChatType === "direct" && otherMembers.length > 0) {
          const { blockedByPeer } = await checkDirectBlockState(senderId, otherMembers[0]);
          stealthBlocked = blockedByPeer;
        }

        for (const msgId of eligibleIds) {
          const payload = {
            messageId: msgId,
            chatType: bodyChatType,
            chatId: bodyChatId.toString(),
          };
          if (req.io) {
            if (stealthBlocked) {
              req.io.to(`user:${senderId}`).emit("message:deleted_for_everyone", payload);
            } else {
              req.io.to(`${bodyChatType}:${bodyChatId}`).emit("message:deleted_for_everyone", payload);
              for (const mId of otherMembers) {
                if (isSocketOnline(req.io, mId)) {
                  req.io.to(`user:${mId}`).emit("message:deleted_for_everyone", payload);
                } else {
                  await PendingEvent.create({
                    targetUser: mId,
                    chatType: bodyChatType,
                    chatId: bodyChatId,
                    messageId: msgId,
                    eventType: "delete_for_everyone",
                    payload: {},
                  });
                }
              }
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: "Messages deleted for everyone.",
        data: { messageIds: eligibleIds, deleteType: "for_everyone" },
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

// @desc    Clear chat (pulls user from any server offline queue for that chat)
// @route   POST /api/messages/clear-chat
export const clearChat = async (req, res) => {
  try {
    const { chatType, chatId } = req.body;
    if (!chatType || !chatId) {
      return res.status(400).json({ success: false, message: "chatType and chatId are required." });
    }

    await Message.updateMany(
      { chatType, chatId },
      {
        $addToSet: { deletedFor: req.user._id },
        $pull: { pendingRecipients: req.user._id },
      }
    );
    await Message.deleteMany({
      chatType,
      chatId,
      pendingRecipients: { $size: 0 },
    });
    await PendingEvent.deleteMany({ targetUser: req.user._id, chatType, chatId });

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

// @desc    Schedule a message for future delivery (works even when sender is offline at send time)
// @route   POST /api/messages/scheduled
export const scheduleMessage = async (req, res) => {
  try {
    const {
      targets,
      chatType,
      chatId,
      content = "",
      mediaUrl = "",
      mediaType = "text",
      fileName = "",
      fileSize = 0,
      replyTo = null,
      replyPreview = null,
      scheduledFor,
    } = req.body || {};

    if (!content.trim() && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: "Message content or media attachment is required.",
      });
    }

    const scheduledDate = new Date(scheduledFor);
    if (!scheduledFor || Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Valid scheduled date and time are required.",
      });
    }

    if (scheduledDate.getTime() <= Date.now() + 2000) {
      return res.status(400).json({
        success: false,
        message: "Scheduled time must be in the future.",
      });
    }

    const rawTargets =
      Array.isArray(targets) && targets.length > 0
        ? targets
        : chatType && chatId
        ? [{ chatType, chatId }]
        : [];

    const dedupedMap = new Map();
    for (const t of rawTargets) {
      if (!t?.chatType || !t?.chatId || !["direct", "group"].includes(t.chatType)) continue;
      if (!mongoose.Types.ObjectId.isValid(t.chatId)) continue;
      dedupedMap.set(`${t.chatType}:${t.chatId}`, {
        chatType: t.chatType,
        chatId: t.chatId.toString(),
      });
    }

    const cleanTargets = Array.from(dedupedMap.values());
    if (cleanTargets.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one valid participant or group.",
      });
    }

    const senderId = req.user._id.toString();
    for (const t of cleanTargets) {
      const { memberIds, errorStatus, errorMsg } = await getChatMemberIds(
        t.chatType,
        t.chatId,
        req.user._id
      );
      if (errorStatus) {
        return res.status(errorStatus).json({ success: false, message: errorMsg });
      }
      if (t.chatType === "direct") {
        const peerId = memberIds.find((id) => id !== senderId);
        if (peerId) {
          const { blockedBySender } = await checkDirectBlockState(senderId, peerId);
          if (blockedBySender) {
            return res.status(403).json({
              success: false,
              message: "Cannot schedule a message to a user you have blocked.",
            });
          }
        }
      }
    }

    const scheduled = await ScheduledMessage.create({
      sender: req.user._id,
      targets: cleanTargets,
      content: content.trim(),
      mediaUrl: mediaUrl.trim(),
      mediaType: mediaUrl ? mediaType : "text",
      fileName: fileName.trim(),
      fileSize: Number(fileSize) || 0,
      replyTo: cleanTargets.length === 1 ? replyTo || null : null,
      replyPreview: cleanTargets.length === 1 ? replyPreview || null : null,
      scheduledFor: scheduledDate,
      status: "pending",
    });

    if (req.io) {
      req.io.to(`user:${senderId}`).emit("scheduled:created", scheduled);
    }

    res.status(201).json({
      success: true,
      message: `Message scheduled for ${scheduledDate.toLocaleString()}`,
      data: scheduled,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error scheduling message.",
    });
  }
};

// @desc    List pending scheduled messages for the logged-in user
// @route   GET /api/messages/scheduled
export const getScheduledMessages = async (req, res) => {
  try {
    const { chatType, chatId } = req.query || {};
    const query = { sender: req.user._id, status: "pending" };
    if (chatType && chatId && mongoose.Types.ObjectId.isValid(chatId)) {
      query["targets"] = { $elemMatch: { chatType, chatId } };
    }

    const list = await ScheduledMessage.find(query).sort({ scheduledFor: 1 }).lean();
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching scheduled messages.",
    });
  }
};

// @desc    Cancel a pending scheduled message before delivery
// @route   DELETE /api/messages/scheduled/:scheduledId
export const cancelScheduledMessage = async (req, res) => {
  try {
    const { scheduledId } = req.params;
    const cancelled = await ScheduledMessage.findOneAndUpdate(
      { _id: scheduledId, sender: req.user._id, status: "pending" },
      { status: "cancelled" },
      { new: true }
    );

    if (!cancelled) {
      return res.status(404).json({
        success: false,
        message: "Pending scheduled message not found or already sent.",
      });
    }

    if (req.io) {
      req.io.to(`user:${req.user._id}`).emit("scheduled:cancelled", {
        scheduledId: scheduledId.toString(),
      });
    }

    res.status(200).json({
      success: true,
      message: "Scheduled message cancelled.",
      data: { scheduledId },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error cancelling scheduled message.",
    });
  }
};

/**
 * Background dispatcher called periodically by cron: atomically claims due
 * pending ScheduledMessage records and sends them even if the sender is offline.
 */
export const processDueScheduledMessages = async (io) => {
  while (true) {
    const now = new Date();
    const job = await ScheduledMessage.findOneAndUpdate(
      { status: "pending", scheduledFor: { $lte: now } },
      { status: "processing" },
      { sort: { scheduledFor: 1 }, new: true }
    );
    if (!job) break;

    const senderUser = await User.findById(job.sender).select(
      "fullName username avatarUrl isVerified"
    );

    if (!senderUser) {
      job.status = "failed";
      job.results = [{ error: "Sender account no longer exists." }];
      await job.save();
      continue;
    }

    const results = [];
    let successCount = 0;

    for (const target of job.targets || []) {
      try {
        const res = await relayMessageToChat({
          io,
          senderUser,
          chatType: target.chatType,
          chatId: target.chatId,
          content: job.content,
          mediaUrl: job.mediaUrl,
          mediaType: job.mediaType,
          fileName: job.fileName,
          fileSize: job.fileSize,
          replyTo: job.targets.length === 1 ? job.replyTo : null,
          replyPreview: job.targets.length === 1 ? job.replyPreview : null,
          recordSenderOfflineEvent: true,
          scheduledMessageId: job._id,
        });

        if (res.errorStatus) {
          results.push({
            chatType: target.chatType,
            chatId: target.chatId,
            status: "failed",
            error: res.errorMsg,
          });
        } else {
          successCount += 1;
          results.push({
            chatType: target.chatType,
            chatId: target.chatId,
            messageId: res.wireMessage._id,
            status: "sent",
          });
        }
      } catch (err) {
        results.push({
          chatType: target.chatType,
          chatId: target.chatId,
          status: "failed",
          error: err.message,
        });
      }
    }

    job.results = results;
    job.dispatchedAt = new Date();
    job.status =
      successCount === (job.targets || []).length
        ? "sent"
        : successCount > 0
        ? "partial"
        : "failed";
    await job.save();

    if (io) {
      io.to(`user:${senderUser._id.toString()}`).emit("scheduled:dispatched", {
        scheduledId: job._id.toString(),
        status: job.status,
      });
    }
  }
};
