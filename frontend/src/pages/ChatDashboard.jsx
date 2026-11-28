import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import axiosInstance from "../api/axiosInstance";
import {
  saveLocalMessages,
  getLocalLastMessagesMap,
  patchLocalMessage,
  applyPendingEventsLocally,
  clearLocalChatMessages,
  purgeExpiredDisappearingMessages,
} from "../utils/localMessageStore";
import Sidebar from "../components/Sidebar";
import ChatBox from "../components/ChatBox";
import GroupAdmin from "../components/GroupAdmin";
import {
  Hash,
  PlusCircle,
  X,
  Clock,
  Globe,
  UserPlus,
  Lock,
  Search,
  Check,
  Calendar,
  Timer,
} from "lucide-react";

const toLocalDateStr = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toLocalTimeStr = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toTs = (m) => {
  if (!m?.createdAt) return 0;
  const ms = new Date(m.createdAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const pickNewerMessage = (msgA, msgB) => {
  if (!msgA && !msgB) return null;
  if (!msgA) return msgB;
  if (!msgB) return msgA;
  return toTs(msgA) >= toTs(msgB) ? msgA : msgB;
};

const readUserStorageMap = (prefix, userId) => {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(`${prefix}_${userId}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeUserStorageMap = (prefix, userId, mapObj) => {
  if (!userId) return;
  try {
    localStorage.setItem(`${prefix}_${userId}`, JSON.stringify(mapObj));
  } catch {
    // Ignore storage quota errors cleanly
  }
};

const ChatDashboard = () => {
  const { user, updateUser } = useAuth();
  const { socket } = useSocket();
  const [groups, setGroups] = useState([]);
  const [directChats, setDirectChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [showAdminDrawer, setShowAdminDrawer] = useState(false);
  const [backupRefreshKey, setBackupRefreshKey] = useState(0);

  const currentUserId = (user?._id || user?.id)?.toString();
  const [drafts, setDrafts] = useState(() =>
    readUserStorageMap("vartalap_drafts", currentUserId)
  );
  const [unreadCounts, setUnreadCounts] = useState(() =>
    readUserStorageMap("vartalap_unread", currentUserId)
  );

  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat;
  const isSyncingQueueRef = useRef(false);
  const syncAgainRef = useRef(false);
  const countedMsgIdsRef = useRef(new Set());

  // Reset user-scoped drafts & unread counts cleanly when switching accounts
  useEffect(() => {
    countedMsgIdsRef.current = new Set();
    setActiveChat(null);
    setDrafts(readUserStorageMap("vartalap_drafts", currentUserId));
    setUnreadCounts(readUserStorageMap("vartalap_unread", currentUserId));
  }, [currentUserId]);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const nowDefault = new Date();
  const laterDefault = new Date(nowDefault.getTime() + 60 * 60 * 1000);

  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    joinMode: "public",
    isSessionGroup: false,
    scheduleMode: "preset", // 'preset' | 'custom'
    durationMinutes: 2,
    startDate: toLocalDateStr(nowDefault),
    startTime: toLocalTimeStr(nowDefault),
    endDate: toLocalDateStr(laterDefault),
    endTime: toLocalTimeStr(laterDefault),
    disappearingDuration: 0,
  });
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Join by ID State
  const [searchTag, setSearchTag] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [joinActionStatus, setJoinActionStatus] = useState("");

  const isChatOpenAndVisible = (chatType, chatId) => {
    const cur = activeChatRef.current;
    return (
      document.visibilityState !== "hidden" &&
      cur?.type === chatType &&
      cur?.data?._id?.toString() === chatId?.toString()
    );
  };

  const applyUnreadChanges = (updater) => {
    setUnreadCounts((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      writeUserStorageMap("vartalap_unread", currentUserId, next);
      return next;
    });
  };

  const handleDraftChange = (chatType, chatId, text) => {
    if (!currentUserId || !chatType || !chatId) return;
    const key = `${chatType}:${chatId}`;
    setDrafts((prev) => {
      const next = { ...prev };
      if (text && text.length > 0) {
        next[key] = text;
      } else {
        delete next[key];
      }
      writeUserStorageMap("vartalap_drafts", currentUserId, next);
      return next;
    });
  };

  const handleMarkChatRead = (chatType, chatId) => {
    if (!currentUserId || !chatType || !chatId) return;
    const key = `${chatType}:${chatId}`;
    applyUnreadChanges((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const fetchMyGroups = async () => {
    try {
      const [res, localMap] = await Promise.all([
        axiosInstance.get("/groups/my-groups"),
        getLocalLastMessagesMap(currentUserId),
      ]);
      if (res.data?.success) {
        const enriched = res.data.data.map((g) => ({
          ...g,
          lastMessage: pickNewerMessage(localMap[`group:${g._id}`], g.lastMessage),
        }));
        setGroups(enriched);
      }
    } catch (err) {
      console.error("Error fetching groups:", err);
    }
  };

  const fetchDirectChats = async () => {
    try {
      const [res, localMap] = await Promise.all([
        axiosInstance.get("/direct-chats"),
        getLocalLastMessagesMap(currentUserId),
      ]);
      if (res.data?.success) {
        const enriched = res.data.data.map((c) => ({
          ...c,
          lastMessage: pickNewerMessage(localMap[`direct:${c._id}`], c.lastMessage),
        }));
        setDirectChats(enriched);
      }
    } catch (err) {
      console.error("Error fetching direct chats:", err);
    }
  };

  const refreshSidebarFromLocal = async (targetChatType = null, targetChatId = null) => {
    if (!currentUserId) return;
    const localMap = await getLocalLastMessagesMap(currentUserId);

    const patchChatList = (type, list) =>
      list.map((item) => {
        if (targetChatId && item._id?.toString() !== targetChatId.toString()) {
          return item;
        }
        return {
          ...item,
          lastMessage: localMap[`${type}:${item._id}`] || null,
        };
      });

    if (!targetChatType || targetChatType === "direct") {
      setDirectChats((prev) => patchChatList("direct", prev));
    }
    if (!targetChatType || targetChatType === "group") {
      setGroups((prev) => patchChatList("group", prev));
    }
  };

  // Sync queued offline messages + control/receipt events into IndexedDB & ACK server
  const syncPendingOfflineQueue = async () => {
    if (!currentUserId) return;
    if (isSyncingQueueRef.current) {
      syncAgainRef.current = true;
      return;
    }
    isSyncingQueueRef.current = true;
    try {
      const res = await axiosInstance.get("/messages/pending");
      if (!res.data?.success) return;

      const { messages: pendingMsgs = [], events: pendingEvents = [] } = res.data.data || {};
      if (pendingMsgs.length === 0 && pendingEvents.length === 0) return;

      const unreadDeltas = {};
      for (const m of pendingMsgs) {
        const sId = (m.sender?._id || m.sender?.id || m.sender)?.toString();
        if (
          sId &&
          sId !== currentUserId &&
          !m.isSystemMessage &&
          !countedMsgIdsRef.current.has(m._id)
        ) {
          countedMsgIdsRef.current.add(m._id);
          if (!isChatOpenAndVisible(m.chatType, m.chatId)) {
            const key = `${m.chatType}:${m.chatId}`;
            unreadDeltas[key] = (unreadDeltas[key] || 0) + 1;
          }
        }
      }

      if (pendingMsgs.length > 0) {
        await saveLocalMessages(currentUserId, pendingMsgs);
      }
      if (pendingEvents.length > 0) {
        await applyPendingEventsLocally(currentUserId, pendingEvents);
        for (const ev of pendingEvents) {
          if (ev.eventType === "edit" && !countedMsgIdsRef.current.has(`edit_${ev._id}`)) {
            countedMsgIdsRef.current.add(`edit_${ev._id}`);
            if (!isChatOpenAndVisible(ev.chatType, ev.chatId)) {
              const key = `${ev.chatType}:${ev.chatId}`;
              unreadDeltas[key] = Math.max(1, unreadDeltas[key] || 0);
            }
          }
        }
      }

      if (Object.keys(unreadDeltas).length > 0) {
        applyUnreadChanges((prev) => {
          const next = { ...prev };
          Object.entries(unreadDeltas).forEach(([k, addCount]) => {
            next[k] = (Number(next[k]) || 0) + addCount;
          });
          return next;
        });
      }

      await axiosInstance.post("/messages/ack", {
        messageIds: pendingMsgs.map((m) => m._id),
        eventIds: pendingEvents.map((e) => e._id),
      });

      await refreshSidebarFromLocal();
      setBackupRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Offline sync failed:", err);
    } finally {
      isSyncingQueueRef.current = false;
      if (syncAgainRef.current) {
        syncAgainRef.current = false;
        syncPendingOfflineQueue();
      }
    }
  };

  useEffect(() => {
    const initDashboard = async () => {
      await Promise.all([fetchMyGroups(), fetchDirectChats()]);
      await syncPendingOfflineQueue();
    };
    initDashboard();

    // Background disappearing message sweep every 30s
    const sweepInterval = setInterval(async () => {
      if (!currentUserId) return;
      const purged = await purgeExpiredDisappearingMessages(currentUserId).catch(() => 0);
      if (purged > 0) {
        await refreshSidebarFromLocal();
        setBackupRefreshKey((k) => k + 1);
      }
    }, 30000);

    return () => clearInterval(sweepInterval);
  }, [currentUserId]);

  const handleDirectChatSynced = (directChat) => {
    if (!directChat?._id) return;
    const cId = directChat._id.toString();

    setDirectChats((prev) => {
      const idx = prev.findIndex((c) => c._id?.toString() === cId);
      if (idx !== -1) {
        const merged = {
          ...prev[idx],
          ...directChat,
          lastMessage: pickNewerMessage(directChat.lastMessage, prev[idx].lastMessage),
        };
        const remaining = prev.filter((_, i) => i !== idx);
        return [merged, ...remaining];
      }
      return [directChat, ...prev];
    });

    setActiveChat((prev) =>
      prev?.type === "direct" && prev?.data?._id?.toString() === cId
        ? { ...prev, data: { ...prev.data, ...directChat } }
        : prev
    );
  };

  const handleIncomingSocketMessage = async (newMsg) => {
    if (!newMsg?._id) return;

    const senderId = (newMsg.sender?._id || newMsg.sender?.id || newMsg.sender)?.toString();
    if (currentUserId) {
      try {
        await saveLocalMessages(currentUserId, [newMsg]);
        if (senderId !== currentUserId || newMsg.isSystemMessage) {
          socket?.emit("message:ack", { messageIds: [newMsg._id] });
        }
      } catch (err) {
        console.error("Failed persisting incoming message locally:", err);
      }
    }

    if (
      currentUserId &&
      senderId &&
      senderId !== currentUserId &&
      !newMsg.isSystemMessage &&
      !countedMsgIdsRef.current.has(newMsg._id)
    ) {
      countedMsgIdsRef.current.add(newMsg._id);
      if (!isChatOpenAndVisible(newMsg.chatType, newMsg.chatId)) {
        const key = `${newMsg.chatType}:${newMsg.chatId}`;
        applyUnreadChanges((prev) => ({
          ...prev,
          [key]: (Number(prev[key]) || 0) + 1,
        }));
      }
    }

    handleSidebarMessageUpdate(newMsg);
  };

  const handleSidebarMessageUpdate = (newMsg) => {
    if (!newMsg) return;

    if (newMsg.chatType === "direct") {
      setDirectChats((prev) => {
        const index = prev.findIndex(
          (c) => c._id?.toString() === newMsg.chatId?.toString()
        );
        if (index !== -1) {
          const updated = {
            ...prev[index],
            lastMessage: pickNewerMessage(newMsg, prev[index].lastMessage),
          };
          const remaining = prev.filter((_, i) => i !== index);
          return [updated, ...remaining];
        }
        return prev;
      });
    } else if (newMsg.chatType === "group") {
      setGroups((prev) => {
        const index = prev.findIndex(
          (g) => g._id?.toString() === newMsg.chatId?.toString()
        );
        if (index !== -1) {
          const updated = {
            ...prev[index],
            lastMessage: pickNewerMessage(newMsg, prev[index].lastMessage),
          };
          const remaining = prev.filter((_, i) => i !== index);
          return [updated, ...remaining];
        }
        return prev;
      });
    }
  };

  const handleGroupRemoved = (groupId) => {
    setGroups((prev) => prev.filter((g) => g._id?.toString() !== groupId?.toString()));
    setActiveChat((prev) =>
      prev?.type === "group" && prev?.data?._id?.toString() === groupId?.toString()
        ? null
        : prev
    );
    setShowAdminDrawer(false);
  };

  const handleGroupSynced = (updatedGroup) => {
    if (!updatedGroup?._id) return;
    const gId = updatedGroup._id.toString();
    const amIMember = updatedGroup.members?.some(
      (m) => (m?._id || m)?.toString() === currentUserId
    );

    if (!amIMember) {
      handleGroupRemoved(gId);
      return;
    }

    setGroups((prev) => {
      const exists = prev.some((g) => g._id?.toString() === gId);
      if (exists) {
        return prev.map((g) =>
          g._id?.toString() === gId
            ? {
                ...g,
                ...updatedGroup,
                lastMessage: pickNewerMessage(g.lastMessage, updatedGroup.lastMessage),
              }
            : g
        );
      }
      return [updatedGroup, ...prev];
    });

    setActiveChat((prev) =>
      prev?.type === "group" && prev?.data?._id?.toString() === gId
        ? { ...prev, data: { ...prev.data, ...updatedGroup } }
        : prev
    );
  };

  const handleLastMessagePatched = async (patchedMsg) => {
    const msgId = (patchedMsg._id || patchedMsg.messageId)?.toString();
    if (!msgId) return;

    if (currentUserId) {
      if (patchedMsg._id) {
        await patchLocalMessage(
          currentUserId,
          msgId,
          {
            ...(patchedMsg.content !== undefined && { content: patchedMsg.content }),
            ...(patchedMsg.isEdited !== undefined && { isEdited: patchedMsg.isEdited }),
            ...(patchedMsg.editedAt !== undefined && { editedAt: patchedMsg.editedAt }),
            ...(patchedMsg.isPinned !== undefined && { isPinned: patchedMsg.isPinned }),
            ...(patchedMsg.deliveryStatus !== undefined && {
              deliveryStatus: patchedMsg.deliveryStatus,
            }),
          },
          { allowStatusDowngrade: Boolean(patchedMsg.isEdited) }
        ).catch(() => {});

        if (
          patchedMsg.isEdited &&
          patchedMsg.senderId?.toString() !== currentUserId &&
          patchedMsg.chatType &&
          patchedMsg.chatId &&
          !isChatOpenAndVisible(patchedMsg.chatType, patchedMsg.chatId)
        ) {
          const key = `${patchedMsg.chatType}:${patchedMsg.chatId}`;
          applyUnreadChanges((prev) => ({
            ...prev,
            [key]: Math.max(1, Number(prev[key]) || 0),
          }));
        }
      } else {
        await patchLocalMessage(currentUserId, msgId, {
          isDeletedForEveryone: true,
          isPinned: false,
          content: "This message was deleted",
          mediaUrl: "",
          mediaType: "text",
          fileName: "",
        }).catch(() => {});
      }
    }

    const patchList = (list) =>
      list.map((chat) => {
        if ((chat.lastMessage?._id || chat.lastMessage)?.toString() !== msgId) return chat;
        return {
          ...chat,
          lastMessage: patchedMsg._id
            ? { ...chat.lastMessage, ...patchedMsg }
            : { ...chat.lastMessage, content: "This message was deleted", isDeletedForEveryone: true },
        };
      });

    setGroups(patchList);
    setDirectChats(patchList);
  };

  const handleBackupRestored = async () => {
    await refreshSidebarFromLocal();
    setBackupRefreshKey((prev) => prev + 1);
  };

  const patchStatusInLists = (messageId, nextStatus) => {
    const updateStatus = (list) =>
      list.map((chat) => {
        if ((chat.lastMessage?._id || chat.lastMessage)?.toString() !== messageId?.toString()) {
          return chat;
        }
        if (chat.lastMessage?.deliveryStatus === "seen" && nextStatus !== "seen") {
          return chat;
        }
        return {
          ...chat,
          lastMessage: { ...chat.lastMessage, deliveryStatus: nextStatus },
        };
      });
    setDirectChats(updateStatus);
    setGroups(updateStatus);
  };

  const handleMessageDelivered = async ({ messageId, eventId }) => {
    if (currentUserId && messageId) {
      await patchLocalMessage(currentUserId, messageId, { deliveryStatus: "delivered" }).catch(() => {});
      patchStatusInLists(messageId, "delivered");
      if (eventId) socket?.emit("message:ack", { eventIds: [eventId] });
    }
  };

  const handleMessageSeen = async ({ messageId, eventId }) => {
    if (currentUserId && messageId) {
      await patchLocalMessage(currentUserId, messageId, { deliveryStatus: "seen" }).catch(() => {});
      patchStatusInLists(messageId, "seen");
      if (eventId) socket?.emit("message:ack", { eventIds: [eventId] });
    }
  };

  const handlePeerUpdated = ({ userId, username, fullName }) => {
    const uId = userId?.toString();
    if (!uId) return;

    const patchUser = (u) =>
      (u?._id || u)?.toString() === uId && typeof u === "object"
        ? { ...u, username, fullName }
        : u;

    setDirectChats((prev) =>
      prev.map((c) => ({ ...c, participants: (c.participants || []).map(patchUser) }))
    );

    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        admin: patchUser(g.admin),
        admins: (g.admins || []).map(patchUser),
        members: (g.members || []).map(patchUser),
      }))
    );

    setActiveChat((prev) => {
      if (!prev) return prev;
      if (prev.type === "direct") {
        return {
          ...prev,
          recipient: patchUser(prev.recipient),
          data: {
            ...prev.data,
            participants: (prev.data?.participants || []).map(patchUser),
          },
        };
      }
      return {
        ...prev,
        data: {
          ...prev.data,
          admin: patchUser(prev.data?.admin),
          admins: (prev.data?.admins || []).map(patchUser),
          members: (prev.data?.members || []).map(patchUser),
        },
      };
    });
  };

  const handleDirectChatDeleted = ({ chatId }) => {
    const cId = chatId?.toString();
    setDirectChats((prev) => prev.filter((c) => c._id?.toString() !== cId));
    setActiveChat((prev) =>
      prev?.type === "direct" && prev?.data?._id?.toString() === cId ? null : prev
    );
  };

  const handleGroupStartedOrExpired = ({ groupId }, nextStatus) => {
    const gId = groupId?.toString();
    setGroups((prev) =>
      prev.map((g) => (g._id?.toString() === gId ? { ...g, status: nextStatus } : g))
    );
    setActiveChat((prev) =>
      prev?.type === "group" && prev?.data?._id?.toString() === gId
        ? { ...prev, data: { ...prev.data, status: nextStatus } }
        : prev
    );
  };

  useEffect(() => {
    if (!socket) return;

    const onDeletedGroup = ({ groupId }) => handleGroupRemoved(groupId);
    const onStartedGroup = (d) => handleGroupStartedOrExpired(d, "active");
    const onExpiredGroup = (d) => handleGroupStartedOrExpired(d, "expired");

    socket.on("connect", syncPendingOfflineQueue);
    socket.on("message:new", handleIncomingSocketMessage);
    socket.on("sidebar:update", handleSidebarMessageUpdate);
    socket.on("direct_chat:sync", handleDirectChatSynced);
    socket.on("message:updated", handleLastMessagePatched);
    socket.on("message:deleted_for_everyone", handleLastMessagePatched);
    socket.on("message:delivered", handleMessageDelivered);
    socket.on("message:seen", handleMessageSeen);
    socket.on("group:updated", handleGroupSynced);
    socket.on("group:started", onStartedGroup);
    socket.on("group:expired", onExpiredGroup);
    socket.on("group:deleted", onDeletedGroup);
    socket.on("user:updated", handlePeerUpdated);
    socket.on("direct_chat:deleted", handleDirectChatDeleted);

    return () => {
      socket.off("connect", syncPendingOfflineQueue);
      socket.off("message:new", handleIncomingSocketMessage);
      socket.off("sidebar:update", handleSidebarMessageUpdate);
      socket.off("direct_chat:sync", handleDirectChatSynced);
      socket.off("message:updated", handleLastMessagePatched);
      socket.off("message:deleted_for_everyone", handleLastMessagePatched);
      socket.off("message:delivered", handleMessageDelivered);
      socket.off("message:seen", handleMessageSeen);
      socket.off("group:updated", handleGroupSynced);
      socket.off("group:started", onStartedGroup);
      socket.off("group:expired", onExpiredGroup);
      socket.off("group:deleted", onDeletedGroup);
      socket.off("user:updated", handlePeerUpdated);
      socket.off("direct_chat:deleted", handleDirectChatDeleted);
    };
  }, [socket, currentUserId]);

  const handleToggleBlockUser = async (targetUserId, isCurrentlyBlocked) => {
    if (!targetUserId) return;
    try {
      const res = isCurrentlyBlocked
        ? await axiosInstance.delete(`/users/${targetUserId}/block`)
        : await axiosInstance.post(`/users/${targetUserId}/block`);

      if (res.data?.success) {
        updateUser({
          ...user,
          blockedUsers: res.data.data.blockedUsers,
        });
      }
    } catch (err) {
      console.error("Failed toggling block status:", err);
    }
  };

  const handleDeleteDirectChat = async (chatId) => {
    if (!chatId) return;
    try {
      await clearLocalChatMessages(currentUserId, "direct", chatId);
      handleDraftChange("direct", chatId, "");
      handleMarkChatRead("direct", chatId);
      const res = await axiosInstance.delete(`/direct-chats/${chatId}`);
      if (res.data?.success) {
        handleDirectChatDeleted({ chatId });
      }
    } catch (err) {
      console.error("Failed deleting direct chat:", err);
    }
  };

  const handleSelectUser = async (targetUser) => {
    try {
      const res = await axiosInstance.post("/direct-chats", {
        targetUserId: targetUser._id,
      });

      if (res.data?.success) {
        const directChat = res.data.data;
        setDirectChats((prev) => {
          const exists = prev.some((c) => c._id === directChat._id);
          return exists ? prev : [directChat, ...prev];
        });
        setActiveChat({
          type: "direct",
          data: directChat,
          recipient: targetUser,
        });
      }
    } catch (err) {
      console.error("Error creating direct chat:", err);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setCreateError("");
    if (!createForm.name.trim()) return;

    const payload = {
      name: createForm.name,
      description: createForm.description,
      joinMode: createForm.joinMode,
      isSessionGroup: createForm.isSessionGroup,
      disappearingDuration: createForm.disappearingDuration,
    };

    if (createForm.isSessionGroup) {
      if (createForm.scheduleMode === "custom") {
        if (
          !createForm.startDate ||
          !createForm.startTime ||
          !createForm.endDate ||
          !createForm.endTime
        ) {
          setCreateError("Please fill Start Date, Start Time, End Date, and End Time.");
          return;
        }
        const start = new Date(`${createForm.startDate}T${createForm.startTime}`);
        const end = new Date(`${createForm.endDate}T${createForm.endTime}`);
        if (end <= start) {
          setCreateError("End date & time must be after Start date & time.");
          return;
        }
        if (end <= new Date()) {
          setCreateError("End date & time must be in the future.");
          return;
        }
        payload.startsAt = start.toISOString();
        payload.expiresAt = end.toISOString();
      } else {
        payload.durationMinutes = createForm.durationMinutes;
      }
    }

    setCreateLoading(true);
    try {
      const res = await axiosInstance.post("/groups", payload);
      if (res.data?.success) {
        const newGroup = res.data.data;
        setGroups((prev) => [newGroup, ...prev]);
        setActiveChat({ type: "group", data: newGroup });
        setShowCreateModal(false);
        const now = new Date();
        const later = new Date(now.getTime() + 60 * 60 * 1000);
        setCreateForm({
          name: "",
          description: "",
          joinMode: "public",
          isSessionGroup: false,
          scheduleMode: "preset",
          durationMinutes: 2,
          startDate: toLocalDateStr(now),
          startTime: toLocalTimeStr(now),
          endDate: toLocalDateStr(later),
          endTime: toLocalTimeStr(later),
          disappearingDuration: 0,
        });
      }
    } catch (err) {
      setCreateError(err.response?.data?.message || "Failed to create group.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSearchGroup = async (e) => {
    e.preventDefault();
    if (!searchTag.trim()) return;

    setSearchLoading(true);
    setSearchError("");
    setSearchResult(null);
    setJoinActionStatus("");

    try {
      const res = await axiosInstance.get(
        `/groups/search?tag=${encodeURIComponent(searchTag.trim())}`
      );
      if (res.data?.success) {
        setSearchResult(res.data.data);
      }
    } catch (err) {
      setSearchError(err.response?.data?.message || "Group not found with this ID.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!searchResult?.group?._id) return;

    try {
      const res = await axiosInstance.post(`/groups/${searchResult.group._id}/join`);
      if (res.data?.success) {
        if (res.data?.data?.status === "pending") {
          setJoinActionStatus("Request sent! Waiting for Admin approval.");
        } else {
          setJoinActionStatus("Successfully joined!");
          await fetchMyGroups();
          setActiveChat({ type: "group", data: res.data.data });
          setTimeout(() => setShowJoinModal(false), 1000);
        }
      }
    } catch (err) {
      setSearchError(err.response?.data?.message || "Failed to join group.");
    }
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex bg-white dark:bg-[#0b0d10] text-slate-900 dark:text-zinc-100 font-sans relative">
      <Sidebar
        activeChat={activeChat}
        setActiveChat={setActiveChat}
        groups={groups}
        directChats={directChats}
        drafts={drafts}
        unreadCounts={unreadCounts}
        onSelectUser={handleSelectUser}
        onToggleBlockUser={handleToggleBlockUser}
        onDeleteDirectChat={handleDeleteDirectChat}
        onOpenCreateGroup={() => {
          const now = new Date();
          const later = new Date(now.getTime() + 60 * 60 * 1000);
          setCreateError("");
          setCreateForm((prev) => ({
            ...prev,
            startDate: toLocalDateStr(now),
            startTime: toLocalTimeStr(now),
            endDate: toLocalDateStr(later),
            endTime: toLocalTimeStr(later),
          }));
          setShowCreateModal(true);
        }}
        onOpenJoinGroup={() => {
          setSearchTag("");
          setSearchResult(null);
          setSearchError("");
          setJoinActionStatus("");
          setShowJoinModal(true);
        }}
        onBackupRestored={handleBackupRestored}
      />

      <ChatBox
        activeChat={activeChat}
        onBack={() => setActiveChat(null)}
        onMessageSent={handleSidebarMessageUpdate}
        onChatHistoryChanged={refreshSidebarFromLocal}
        onDirectChatUpdated={handleDirectChatSynced}
        onGroupUpdated={handleGroupSynced}
        onToggleBlockUser={handleToggleBlockUser}
        onDeleteDirectChat={handleDeleteDirectChat}
        drafts={drafts}
        onDraftChange={handleDraftChange}
        onMarkChatRead={handleMarkChatRead}
        backupRefreshKey={backupRefreshKey}
        groups={groups}
        directChats={directChats}
        onOpenAdmin={
          activeChat?.type === "group" ? () => setShowAdminDrawer((prev) => !prev) : null
        }
      />

      {showAdminDrawer && activeChat?.type === "group" && (
        <>
          <div
            onClick={() => setShowAdminDrawer(false)}
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          />
          <GroupAdmin
            group={activeChat.data}
            onClose={() => setShowAdminDrawer(false)}
            onUpdateGroup={(updated) => {
              setActiveChat((prev) => ({
                ...prev,
                data: { ...prev.data, ...updated },
              }));
              fetchMyGroups();
            }}
            onLeaveGroup={handleGroupRemoved}
            onDeleteGroup={handleGroupRemoved}
          />
        </>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-white dark:bg-[#111418] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl text-slate-900 dark:text-zinc-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-zinc-800">
              <h3 className="text-base font-semibold flex items-center space-x-2">
                <PlusCircle size={18} className="text-blue-600 dark:text-emerald-400" />
                <span>Create New Group</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-100 p-1 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="mt-4 space-y-4">
              {createError && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
                  {createError}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Placement Bootcamp 2026"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  required
                  className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Group focus, topics, or announcements..."
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, description: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-600"
                />
              </div>

              {/* Join Mode Selector */}
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1.5">
                  Entry Permission
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "public", title: "Anyone", icon: Globe },
                    { id: "invite_only", title: "Invite Only", icon: UserPlus },
                    { id: "closed", title: "Closed", icon: Lock },
                  ].map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        type="button"
                        key={mode.id}
                        onClick={() =>
                          setCreateForm({ ...createForm, joinMode: mode.id })
                        }
                        className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center space-y-1 ${
                          createForm.joinMode === mode.id
                            ? "bg-blue-50 dark:bg-[#1f3b2c]/50 border-blue-500 dark:border-emerald-600 text-blue-700 dark:text-emerald-300"
                            : "bg-slate-50 dark:bg-[#0b0d10] border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:border-slate-300"
                        }`}
                      >
                        <Icon size={16} />
                        <span className="text-[11px] font-medium">{mode.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Disappearing Messages Timer */}
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center space-x-1.5">
                  <Timer size={13} className="text-blue-600 dark:text-emerald-400" />
                  <span>Disappearing Messages</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "Off", value: 0 },
                    { label: "24 Hours", value: 86400 },
                    { label: "7 Days", value: 604800 },
                    { label: "30 Days", value: 2592000 },
                  ].map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() =>
                        setCreateForm({ ...createForm, disappearingDuration: opt.value })
                      }
                      className={`py-1.5 px-2 text-[11px] rounded-xl border transition font-medium ${
                        createForm.disappearingDuration === opt.value
                          ? "bg-blue-600 dark:bg-emerald-700 border-blue-600 dark:border-emerald-600 text-white"
                          : "bg-slate-50 dark:bg-[#0b0d10] border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lifecycle: Permanent vs Session */}
              <div className="pt-2 border-t border-slate-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium block">
                      Session-Based Group
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Lock chat automatically outside a preset or custom date/time window
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={createForm.isSessionGroup}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        isSessionGroup: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded text-blue-600 bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700"
                  />
                </div>

                {createForm.isSessionGroup && (
                  <div className="mt-3 p-3 bg-slate-50 dark:bg-[#0b0d10] rounded-xl border border-slate-200 dark:border-zinc-800 space-y-3">
                    <div className="flex space-x-1 bg-slate-200/70 dark:bg-zinc-900 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() =>
                          setCreateForm({ ...createForm, scheduleMode: "preset" })
                        }
                        className={`flex-1 py-1 text-[11px] rounded-md font-medium flex items-center justify-center space-x-1 transition ${
                          createForm.scheduleMode === "preset"
                            ? "bg-blue-600 dark:bg-emerald-700 text-white"
                            : "text-slate-600 dark:text-zinc-400"
                        }`}
                      >
                        <Clock size={12} />
                        <span>Quick Presets</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCreateForm({ ...createForm, scheduleMode: "custom" })
                        }
                        className={`flex-1 py-1 text-[11px] rounded-md font-medium flex items-center justify-center space-x-1 transition ${
                          createForm.scheduleMode === "custom"
                            ? "bg-blue-600 dark:bg-emerald-700 text-white"
                            : "text-slate-600 dark:text-zinc-400"
                        }`}
                      >
                        <Calendar size={12} />
                        <span>Custom Schedule</span>
                      </button>
                    </div>

                    {createForm.scheduleMode === "preset" ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { label: "2 Mins", value: 2 },
                          { label: "1 Hour", value: 60 },
                          { label: "24 Hours", value: 1440 },
                          { label: "7 Days", value: 10080 },
                        ].map((preset) => (
                          <button
                            type="button"
                            key={preset.value}
                            onClick={() =>
                              setCreateForm({
                                ...createForm,
                                durationMinutes: preset.value,
                              })
                            }
                            className={`py-1.5 px-2 text-[11px] rounded-lg border font-mono transition ${
                              createForm.durationMinutes === preset.value
                                ? "bg-blue-600 dark:bg-emerald-700 border-blue-600 dark:border-emerald-600 text-white font-semibold"
                                : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                        <div>
                          <label className="text-slate-500 dark:text-zinc-400 block mb-1">Start Date</label>
                          <input
                            type="date"
                            value={createForm.startDate}
                            onChange={(e) =>
                              setCreateForm({ ...createForm, startDate: e.target.value })
                            }
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 dark:text-zinc-400 block mb-1">Start Time</label>
                          <input
                            type="time"
                            value={createForm.startTime}
                            onChange={(e) =>
                              setCreateForm({ ...createForm, startTime: e.target.value })
                            }
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 dark:text-zinc-400 block mb-1">End Date</label>
                          <input
                            type="date"
                            value={createForm.endDate}
                            onChange={(e) =>
                              setCreateForm({ ...createForm, endDate: e.target.value })
                            }
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 dark:text-zinc-400 block mb-1">End Time</label>
                          <input
                            type="time"
                            value={createForm.endTime}
                            onChange={(e) =>
                              setCreateForm({ ...createForm, endTime: e.target.value })
                            }
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 text-xs font-semibold bg-blue-600 dark:bg-emerald-700 hover:bg-blue-500 dark:hover:bg-emerald-600 text-white rounded-xl shadow-lg transition disabled:opacity-50"
                >
                  {createLoading ? "Creating..." : "Create Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join by Unique Group ID Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#111418] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl text-slate-900 dark:text-zinc-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-zinc-800">
              <h3 className="text-base font-semibold flex items-center space-x-2">
                <Hash size={18} className="text-blue-600 dark:text-emerald-400" />
                <span>Join Group by Unique ID</span>
              </h3>
              <button
                onClick={() => setShowJoinModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-100 p-1 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSearchGroup} className="mt-4 space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-3 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  placeholder="Enter Group ID (e.g. #7K9M2X4P)"
                  value={searchTag}
                  onChange={(e) => setSearchTag(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl pl-10 pr-20 py-2.5 text-xs font-mono uppercase text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-600"
                />
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="absolute right-1.5 top-1.5 px-3 py-1 bg-blue-600 dark:bg-emerald-700 hover:bg-blue-500 dark:hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition"
                >
                  {searchLoading ? "..." : "Search"}
                </button>
              </div>
            </form>

            {searchError && (
              <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
                {searchError}
              </div>
            )}

            {searchResult && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">{searchResult.group?.name}</h4>
                  <span className="font-mono text-xs text-blue-600 dark:text-emerald-400 font-bold">
                    {searchResult.group?.groupTag}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {searchResult.group?.description || "No description provided."}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 pt-2 border-t border-slate-200 dark:border-zinc-800/80">
                  <span>{searchResult.group?.members?.length || 1} members</span>
                  <span className="capitalize">Mode: {searchResult.group?.joinMode}</span>
                </div>

                {joinActionStatus ? (
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs text-center rounded-lg flex items-center justify-center space-x-1.5">
                    <Check size={14} />
                    <span>{joinActionStatus}</span>
                  </div>
                ) : searchResult.isMember ? (
                  <div className="text-center text-xs text-slate-500 dark:text-zinc-400 py-1 font-medium">
                    You are already a member of this group.
                  </div>
                ) : searchResult.hasPendingRequest ? (
                  <div className="text-center text-xs text-amber-600 dark:text-amber-400 py-1 font-medium">
                    Request Pending: Waiting for admin approval.
                  </div>
                ) : searchResult.group?.joinMode === "closed" ? (
                  <div className="text-center text-xs text-rose-600 dark:text-rose-400 py-1 font-medium">
                    This group is currently closed to new members.
                  </div>
                ) : (
                  <button
                    onClick={handleJoinGroup}
                    className="w-full py-2 bg-blue-600 dark:bg-emerald-700 hover:bg-blue-500 dark:hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl shadow transition"
                  >
                    {searchResult.group?.joinMode === "invite_only"
                      ? "Request to Join Group"
                      : "Join Group Instantly"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatDashboard;
