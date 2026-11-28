import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import axiosInstance, { resolveMediaUrl } from "../../api/axiosInstance";
import { compressImageIfNeeded } from "../../utils/mediaCompression";
import {
  saveLocalMessages,
  getLocalChatMessages,
  patchLocalMessage,
  deleteLocalMessages,
  clearLocalChatMessages,
} from "../../utils/localMessageStore";
import {
  Send,
  Pin,
  Clock,
  Shield,
  AlertCircle,
  Hash,
  Paperclip,
  Mic,
  Trash2,
  CornerUpLeft,
  Copy,
  Forward,
  Star,
  CheckSquare,
  MoreVertical,
  X,
  Download,
  FileText,
  Check,
  CheckCheck,
  Edit3,
  Timer,
  Ban,
  ShieldCheck,
  CalendarClock,
  ArrowLeft,
} from "lucide-react";

const DISAPPEAR_OPTIONS = [
  { label: "24 Hours", short: "24h", value: 86400 },
  { label: "7 Days", short: "7d", value: 604800 },
  { label: "30 Days", short: "30d", value: 2592000 },
  { label: "Off", short: "Off", value: 0 },
];

const formatCountdown = (ms) => {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const hms = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
  return days > 0 ? `${days}d ${hms}` : hms;
};

const buildReplyPreview = (msg) => {
  if (!msg) return null;
  return {
    _id: msg._id,
    senderUsername: msg.sender?.username || "user",
    content: msg.content || "",
    mediaType: msg.mediaType || "text",
    fileName: msg.fileName || "",
  };
};

const toLocalDateStr = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toLocalTimeStr = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toggleTargetInList = (list, targetType, targetId) => {
  const exists = list.some((t) => t.id === targetId && t.type === targetType);
  return exists
    ? list.filter((t) => !(t.id === targetId && t.type === targetType))
    : [...list, { type: targetType, id: targetId }];
};

const BubbleTail = ({ isMe }) =>
  isMe ? (
    <svg
      viewBox="0 0 12 16"
      aria-hidden="true"
      className="absolute -right-[6px] bottom-0 w-3 h-4 fill-[#c8d8fa] dark:fill-[#1f3b2c] pointer-events-none"
    >
      <path d="M0 0 C2 7 7 12 12 15 C5 16 1 15 0 12 Z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 12 16"
      aria-hidden="true"
      className="absolute -left-[6px] bottom-0 w-3 h-4 fill-white dark:fill-[#20272e] pointer-events-none"
    >
      <path d="M12 0 C10 7 5 12 0 15 C7 16 11 15 12 12 Z" />
    </svg>
  );

const ChatTargetChecklist = ({
  directChats,
  groups,
  currentUserId,
  selectedTargets,
  searchTerm,
  onSearchChange,
  onToggleTarget,
}) => (
  <>
    <input
      type="text"
      placeholder="Filter contacts or groups..."
      value={searchTerm}
      onChange={(e) => onSearchChange(e.target.value)}
      className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-600"
    />

    <div className="max-h-52 overflow-y-auto space-y-1">
      {directChats.map((chat) => {
        const other = chat.participants?.find(
          (p) => (p._id || p)?.toString() !== currentUserId
        );
        const label = `${other?.fullName || ""} @${other?.username || ""}`;
        if (searchTerm && !label.toLowerCase().includes(searchTerm.toLowerCase())) {
          return null;
        }
        const checked = selectedTargets.some((t) => t.id === chat._id && t.type === "direct");
        return (
          <button
            type="button"
            key={chat._id}
            onClick={() => onToggleTarget("direct", chat._id)}
            className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between transition ${
              checked
                ? "bg-blue-50 dark:bg-[#1f3b2c]/45 border border-blue-300 dark:border-emerald-600/70"
                : "hover:bg-slate-100 dark:hover:bg-zinc-800"
            }`}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <input
                type="checkbox"
                checked={checked}
                readOnly
                className="rounded text-blue-600 bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700"
              />
              <span className="w-7 h-7 rounded-full bg-blue-100 dark:bg-zinc-800 text-blue-700 dark:text-emerald-300 flex items-center justify-center font-bold text-[10px] uppercase shrink-0">
                {other?.username?.slice(0, 2) || "DM"}
              </span>
              <span className="font-medium text-slate-900 dark:text-zinc-200 truncate">
                {other?.fullName || `@${other?.username}`}
              </span>
            </div>
            <span className="text-[10px] text-blue-600 dark:text-emerald-400 shrink-0">Direct</span>
          </button>
        );
      })}

      {groups.map((group) => {
        if (searchTerm && !group.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          return null;
        }
        const checked = selectedTargets.some((t) => t.id === group._id && t.type === "group");
        return (
          <button
            type="button"
            key={group._id}
            onClick={() => onToggleTarget("group", group._id)}
            className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between transition ${
              checked
                ? "bg-blue-50 dark:bg-[#1f3b2c]/45 border border-blue-300 dark:border-emerald-600/70"
                : "hover:bg-slate-100 dark:hover:bg-zinc-800"
            }`}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <input
                type="checkbox"
                checked={checked}
                readOnly
                className="rounded text-blue-600 bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700"
              />
              <span className="w-7 h-7 rounded-full bg-slate-200 dark:bg-zinc-800 text-blue-600 dark:text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                G
              </span>
              <span className="font-medium text-slate-900 dark:text-zinc-200 truncate">{group.name}</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 shrink-0">Group</span>
          </button>
        );
      })}
    </div>
  </>
);

const STATUS_RANK = { sent: 1, delivered: 2, seen: 3 };
const mergeHighestStatuses = (existingList, nextList) => {
  const existingMap = new Map(existingList.map((m) => [m._id?.toString(), m]));
  return nextList.map((m) => {
    const prev = existingMap.get(m._id?.toString());
    if (!prev) return m;
    const prevRank = STATUS_RANK[prev.deliveryStatus] || 0;
    const nextRank = STATUS_RANK[m.deliveryStatus] || 0;
    if (prevRank > nextRank && !(m.isEdited && m.editedAt !== prev.editedAt)) {
      return { ...m, deliveryStatus: prev.deliveryStatus };
    }
    return m;
  });
};

const ChatBox = ({
  activeChat,
  onBack,
  onOpenAdmin,
  onMessageSent,
  onChatHistoryChanged,
  onDirectChatUpdated,
  onGroupUpdated,
  onToggleBlockUser,
  onDeleteDirectChat,
  drafts = {},
  onDraftChange,
  onMarkChatRead,
  backupRefreshKey = 0,
  groups = [],
  directChats = [],
}) => {
  const { user } = useAuth();
  const { socket, onlineUsers = [] } = useSocket();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const [isNotStarted, setIsNotStarted] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messageRefs = useRef({});
  const prevMsgCountRef = useRef(0);
  const seenSentKeysRef = useRef(new Set());

  // Media Upload & Voice Recording State
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // Interaction & Modal States
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);
  const [forwardTargets, setForwardTargets] = useState([]); // [{ type, id }]
  const [forwardSearch, setForwardSearch] = useState("");
  const [showDisappearModal, setShowDisappearModal] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [pinnedCursor, setPinnedCursor] = useState(0);
  const [toast, setToast] = useState(null);

  // Timed / Scheduled Messages State
  const [scheduledMessages, setScheduledMessages] = useState([]);
  const [showScheduledPanel, setShowScheduledPanel] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedContent, setSchedContent] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedTargets, setSchedTargets] = useState([]);
  const [schedSearch, setSchedSearch] = useState("");
  const [schedError, setSchedError] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);

  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const onMarkChatReadRef = useRef(onMarkChatRead);
  onMarkChatReadRef.current = onMarkChatRead;

  const isGroup = activeChat?.type === "group";
  const groupData = isGroup ? activeChat.data : null;
  const isSessionGroup = groupData?.isSessionGroup;
  const currentUserId = (user?._id || user?.id)?.toString();

  const isCurrentUserGroupAdmin =
    isGroup &&
    ((groupData?.admin?._id || groupData?.admin)?.toString() === currentUserId ||
      (groupData?.admins || []).some((a) => (a?._id || a)?.toString() === currentUserId));

  const directRecipient = !isGroup
    ? activeChat?.recipient ||
      activeChat?.data?.participants?.find(
        (p) => (p?._id || p)?.toString() !== currentUserId
      )
    : null;

  const isDirectBlockedByMe =
    !isGroup &&
    directRecipient?._id &&
    (user?.blockedUsers || []).some(
      (id) => id.toString() === directRecipient._id.toString()
    );

  const isDirectOnline =
    !isDirectBlockedByMe &&
    Boolean(
      directRecipient?._id &&
        onlineUsers.some((id) => id.toString() === directRecipient._id.toString())
    );

  const disappearingDuration = Number(activeChat?.data?.disappearingDuration) || 0;
  const activeDisappearMeta =
    DISAPPEAR_OPTIONS.find((o) => o.value === disappearingDuration) ||
    DISAPPEAR_OPTIONS[3];

  const showToast = (text, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 2500);
  };

  // Close menus on outside click / Escape
  useEffect(() => {
    const closeMenus = () => setContextMenu(null);
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        setShowHeaderMenu(false);
      }
    };
    window.addEventListener("click", closeMenus);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeMenus);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Restore saved per-chat draft cleanly only when switching chats or accounts
  useEffect(() => {
    if (!activeChat?.data?._id) {
      setInputText("");
      return;
    }
    const draftKey = `${activeChat.type}:${activeChat.data._id}`;
    setInputText(draftsRef.current[draftKey] || "");
  }, [activeChat?.type, activeChat?.data?._id, currentUserId]);

  // Device-first load: read IndexedDB, then drain queued items & ACK
  useEffect(() => {
    setIsExpired(false);
    setIsNotStarted(false);
    setTimeLeft("");
    setReplyingTo(null);
    setEditingMsg(null);
    setSelectedIds([]);
    setIsSelectionMode(false);
    setContextMenu(null);
    setShowHeaderMenu(false);
    setShowDisappearModal(false);
    setHighlightedMsgId(null);
    setPinnedCursor(0);
    prevMsgCountRef.current = 0;

    if (!activeChat?.data?._id || !currentUserId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    const chatType = activeChat.type;
    const chatId = activeChat.data._id;

    const loadDeviceFirstHistory = async () => {
      try {
        const localHistory = await getLocalChatMessages(currentUserId, chatType, chatId);
        if (isMounted) {
          setMessages((prev) =>
            prev.length > 0 && prev.every((m) => m.chatId?.toString() === chatId.toString())
              ? mergeHighestStatuses(prev, localHistory)
              : localHistory
          );
          if (document.visibilityState !== "hidden") {
            onMarkChatReadRef.current?.(chatType, chatId);
          }
        }

        const res = await axiosInstance.get(`/messages/${chatType}/${chatId}`);
        const queuedMsgs = res.data?.success ? res.data.data || [] : [];

        if (queuedMsgs.length > 0 && isMounted) {
          await saveLocalMessages(currentUserId, queuedMsgs);
          const refreshed = await getLocalChatMessages(currentUserId, chatType, chatId);
          if (isMounted) {
            setMessages((prev) => mergeHighestStatuses(prev, refreshed));
            if (document.visibilityState !== "hidden") {
              onMarkChatReadRef.current?.(chatType, chatId);
            }
          }

          await axiosInstance
            .post("/messages/ack", { messageIds: queuedMsgs.map((m) => m._id) })
            .catch(() => {});
        }
      } catch (err) {
        console.error("Error loading chat messages:", err);
      }
    };

    loadDeviceFirstHistory();
    return () => {
      isMounted = false;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setTypingUser(null);
      setIsTyping(false);
    };
  }, [activeChat?.type, activeChat?.data?._id, currentUserId, backupRefreshKey]);

  // Emit WhatsApp Read / Seen receipts when user opens/views peer messages (and after re-edit!)
  useEffect(() => {
    if (!activeChat?.data?._id || !currentUserId) return;

    const flushSeenReceipts = () => {
      if (document.visibilityState === "hidden") return;

      onMarkChatReadRef.current?.(activeChat.type, activeChat.data._id);
      if (messages.length === 0) return;

      const unseenItems = [];
      for (const m of messages) {
        if (!m?._id || m.isSystemMessage || m.isDeletedForEveryone) continue;
        const senderId = (m.sender?._id || m.sender?.id || m.sender)?.toString();
        if (!senderId || senderId === currentUserId) continue;

        const key = `${m._id}_${m.editedAt || ""}`;
        if (!seenSentKeysRef.current.has(key)) {
          seenSentKeysRef.current.add(key);
          unseenItems.push({
            messageId: m._id,
            senderId,
            chatType: activeChat.type,
            chatId: activeChat.data._id,
          });
        }
      }

      if (unseenItems.length > 0) {
        if (socket?.connected) {
          socket.emit("message:seen", { items: unseenItems });
        } else {
          axiosInstance.post("/messages/seen", { items: unseenItems }).catch(() => {});
        }
      }
    };

    flushSeenReceipts();
    window.addEventListener("focus", flushSeenReceipts);
    document.addEventListener("visibilitychange", flushSeenReceipts);
    return () => {
      window.removeEventListener("focus", flushSeenReceipts);
      document.removeEventListener("visibilitychange", flushSeenReceipts);
    };
  }, [messages, activeChat?.type, activeChat?.data?._id, currentUserId, socket]);

  // Live disappearing message cleanup inside open chat every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => {
        const filtered = prev.filter(
          (m) => !m.disappearAt || new Date(m.disappearAt).getTime() > now
        );
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Scheduled start & expiry timer logic for session groups
  useEffect(() => {
    if (!isGroup || !isSessionGroup || !groupData?.expiresAt) {
      setIsExpired(false);
      setIsNotStarted(false);
      setTimeLeft("");
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const startTs = groupData.startsAt ? new Date(groupData.startsAt).getTime() : 0;
      const expiryTs = new Date(groupData.expiresAt).getTime();

      if (startTs && now < startTs) {
        setIsNotStarted(true);
        setIsExpired(false);
        setTimeLeft(`Starts in ${formatCountdown(startTs - now)}`);
        return;
      }

      setIsNotStarted(false);
      const diff = expiryTs - now;
      if (diff <= 0) {
        setTimeLeft("00:00:00");
        setIsExpired(true);
        return;
      }

      setTimeLeft(formatCountdown(diff));
      setIsExpired(false);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isGroup, isSessionGroup, groupData?.startsAt, groupData?.expiresAt]);

  // Socket room join & real-time message + receipt listeners
  useEffect(() => {
    if (!socket || !activeChat?.data?._id) return;

    const roomType = activeChat.type;
    const roomId = activeChat.data._id;
    const joinRoom = () => socket.emit("room:join", { roomType, roomId });
    joinRoom();
    socket.on("connect", joinRoom);

    const handleNewMessage = (newMsg) => {
      if (newMsg.chatId?.toString() !== roomId.toString()) return;
      setMessages((prev) =>
        prev.some((m) => m._id === newMsg._id) ? prev : [...prev, newMsg]
      );
    };

    const handleMessageUpdated = (updatedMsg) => {
      if (updatedMsg.chatId?.toString() !== roomId.toString()) return;
      setMessages((prev) =>
        prev.map((m) => (m._id === updatedMsg._id ? { ...m, ...updatedMsg } : m))
      );
    };

    const handleDeletedForEveryone = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? {
                ...m,
                isDeletedForEveryone: true,
                isPinned: false,
                content: "This message was deleted",
                mediaUrl: "",
                mediaType: "text",
                fileName: "",
              }
            : m
        )
      );
    };

    const handleDelivered = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId && m.deliveryStatus !== "seen"
            ? { ...m, deliveryStatus: "delivered" }
            : m
        )
      );
    };

    const handleSeen = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, deliveryStatus: "seen" } : m
        )
      );
    };

    const handleTyping = (data) => {
      if (data.roomId === roomId && data.username !== user?.username) {
        setTypingUser(data.isTyping ? data.username : null);
      }
    };

    const handleGroupStarted = (data) => {
      if (data.groupId === roomId) setIsNotStarted(false);
    };

    const handleGroupExpired = (data) => {
      if (data.groupId === roomId) setIsExpired(true);
    };

    const syncScheduled = () => {
      axiosInstance
        .get("/messages/scheduled")
        .then((res) => {
          if (res.data?.success) setScheduledMessages(res.data.data || []);
        })
        .catch(() => {});
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:updated", handleMessageUpdated);
    socket.on("message:deleted_for_everyone", handleDeletedForEveryone);
    socket.on("message:delivered", handleDelivered);
    socket.on("message:seen", handleSeen);
    socket.on("typing:update", handleTyping);
    socket.on("group:started", handleGroupStarted);
    socket.on("group:expired", handleGroupExpired);
    socket.on("scheduled:created", syncScheduled);
    socket.on("scheduled:cancelled", syncScheduled);
    socket.on("scheduled:dispatched", syncScheduled);

    return () => {
      socket.emit("room:leave", { roomType, roomId });
      socket.off("connect", joinRoom);
      socket.off("message:new", handleNewMessage);
      socket.off("message:updated", handleMessageUpdated);
      socket.off("message:deleted_for_everyone", handleDeletedForEveryone);
      socket.off("message:delivered", handleDelivered);
      socket.off("message:seen", handleSeen);
      socket.off("typing:update", handleTyping);
      socket.off("group:started", handleGroupStarted);
      socket.off("group:expired", handleGroupExpired);
      socket.off("scheduled:created", syncScheduled);
      socket.off("scheduled:cancelled", syncScheduled);
      socket.off("scheduled:dispatched", syncScheduled);
    };
  }, [socket, activeChat?.type, activeChat?.data?._id, user?.username]);

  // Fetch user's pending timed / scheduled messages whenever dashboard/chat mounts
  useEffect(() => {
    if (!currentUserId) return;
    axiosInstance
      .get("/messages/scheduled")
      .then((res) => {
        if (res.data?.success) setScheduledMessages(res.data.data || []);
      })
      .catch(() => {});
  }, [currentUserId, activeChat?.data?._id, backupRefreshKey]);

  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && selectedIds.length === 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, selectedIds.length]);

  const appendSentMessage = async (savedMsg) => {
    await saveLocalMessages(currentUserId, [savedMsg]).catch(() => {});
    setMessages((prev) => {
      const existing = prev.find((m) => m._id === savedMsg._id);
      if (existing) {
        return mergeHighestStatuses([existing], [savedMsg]).length
          ? prev.map((m) =>
              m._id === savedMsg._id ? mergeHighestStatuses([existing], [savedMsg])[0] : m
            )
          : prev;
      }
      return [...prev, savedMsg];
    });
    if (onMessageSent) onMessageSent(savedMsg);
  };

  // Send New Message OR Save Edited Message (Edit resets seen state back to unseen!)
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (
      !inputText.trim() ||
      (isGroup && isSessionGroup && (isExpired || isNotStarted)) ||
      isDirectBlockedByMe ||
      !activeChat?.data?._id
    ) {
      return;
    }

    const trimmed = inputText.trim();

    if (editingMsg) {
      try {
        const res = await axiosInstance.patch(`/messages/${editingMsg._id}`, {
          content: trimmed,
          chatType: activeChat.type,
          chatId: activeChat.data._id,
        });
        if (res.data?.success) {
          const patch = {
            content: trimmed,
            isEdited: true,
            editedAt: res.data.data?.editedAt || new Date().toISOString(),
            deliveryStatus: res.data.data?.deliveryStatus || "delivered",
          };
          await patchLocalMessage(currentUserId, editingMsg._id, patch, {
            allowStatusDowngrade: true,
          }).catch(() => {});
          setMessages((prev) =>
            prev.map((m) => (m._id === editingMsg._id ? { ...m, ...patch } : m))
          );
          if (onChatHistoryChanged) {
            await onChatHistoryChanged(activeChat.type, activeChat.data._id);
          }
          setEditingMsg(null);
          setInputText(draftsRef.current[`${activeChat.type}:${activeChat.data._id}`] || "");
          showToast("Message updated");
        }
      } catch (err) {
        showToast(err.response?.data?.message || "Failed to edit message", true);
      }
      return;
    }

    const replyTargetId = replyingTo?._id || null;
    const replyPreview = buildReplyPreview(replyingTo);
    setInputText("");
    onDraftChange?.(activeChat.type, activeChat.data._id, "");
    setReplyingTo(null);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setIsTyping(false);
    if (socket) {
      socket.emit("typing:stop", {
        roomType: activeChat.type,
        roomId: activeChat.data._id,
        username: user?.username,
      });
    }

    try {
      const res = await axiosInstance.post("/messages", {
        chatType: activeChat.type,
        chatId: activeChat.data._id,
        content: trimmed,
        replyTo: replyTargetId,
        replyPreview,
      });

      if (res.data?.success) {
        await appendSentMessage(res.data.data);
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to send message", true);
    }
  };

  const handleTypingChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    if (!editingMsg && activeChat?.data?._id) {
      onDraftChange?.(activeChat.type, activeChat.data._id, val);
    }

    if (editingMsg || !socket || !activeChat?.data?._id) return;

    if (val.trim().length === 0) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setIsTyping(false);
      socket.emit("typing:stop", {
        roomType: activeChat.type,
        roomId: activeChat.data._id,
        username: user?.username,
      });
      return;
    }

    if (!isTyping) {
      setIsTyping(true);
      socket.emit("typing:start", {
        roomType: activeChat.type,
        roomId: activeChat.data._id,
        username: user?.username,
      });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit("typing:stop", {
        roomType: activeChat.type,
        roomId: activeChat.data._id,
        username: user?.username,
      });
    }, 500);
  };

  const uploadAndSendMedia = async (rawFile, mediaCaption = "", forcedMediaType = null) => {
    if (!rawFile || !activeChat?.data?._id) return;

    setIsUploading(true);
    try {
      const file = await compressImageIfNeeded(rawFile);
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await axiosInstance.post("/upload", formData, {
        timeout: 60000,
      });

      if (uploadRes.data?.success) {
        const { fileUrl, mediaType, fileName, fileSize } = uploadRes.data.data;

        const msgRes = await axiosInstance.post("/messages", {
          chatType: activeChat.type,
          chatId: activeChat.data._id,
          content: mediaCaption,
          mediaUrl: fileUrl,
          mediaType: forcedMediaType || mediaType,
          fileName,
          fileSize,
          replyTo: replyingTo?._id || null,
          replyPreview: buildReplyPreview(replyingTo),
        });

        if (msgRes.data?.success) {
          setReplyingTo(null);
          await appendSentMessage(msgRes.data.data);
        }
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to send attachment", true);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadAndSendMedia(file, "");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ];
      const supportedType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType, audioBitsPerSecond: 32000 })
        : new MediaRecorder(stream, { audioBitsPerSecond: 32000 });

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      showToast("Microphone permission denied or not available.", true);
    }
  };

  const stopRecordingTracks = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    stopRecordingTracks();
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

    const recorder = mediaRecorderRef.current;
    const rawMime = recorder.mimeType || "audio/webm";
    const baseMime = rawMime.split(";")[0];
    const ext = baseMime.includes("mp4") ? "mp4" : baseMime.includes("ogg") ? "ogg" : "webm";

    recorder.onstop = async () => {
      const chunks = audioChunksRef.current;
      audioChunksRef.current = [];
      if (chunks.length === 0) {
        showToast("Recording was empty", true);
        return;
      }

      const audioBlob = new Blob(chunks, { type: baseMime });
      const audioFile = new File([audioBlob], `voice_${Date.now()}.${ext}`, {
        type: baseMime,
      });

      await uploadAndSendMedia(audioFile, "", "audio");
    };

    recorder.stop();
    stopRecordingTracks();
  };

  const handleSetDisappearingTimer = async (duration) => {
    if (!activeChat?.data?._id) return;
    try {
      if (isGroup) {
        const res = await axiosInstance.patch(
          `/groups/${activeChat.data._id}/disappearing`,
          { duration }
        );
        if (res.data?.success) {
          onGroupUpdated && onGroupUpdated(res.data.data);
          setShowDisappearModal(false);
          showToast("Disappearing message setting updated");
        }
      } else {
        const res = await axiosInstance.patch(
          `/direct-chats/${activeChat.data._id}/disappearing`,
          { duration }
        );
        if (res.data?.success) {
          onDirectChatUpdated && onDirectChatUpdated(res.data.data);
          setShowDisappearModal(false);
          showToast("Disappearing message setting updated");
        }
      }
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to update disappearing timer",
        true
      );
    }
  };

  const handleCopyMessage = (msg) => {
    const text = msg.content || msg.fileName || "";
    if (text) {
      navigator.clipboard.writeText(text);
      showToast("Copied to clipboard");
    }
  };

  const handleToggleStar = async (msgId) => {
    const target = messages.find((m) => m._id === msgId);
    if (!target) return;
    const isStarred = (target.starredBy || []).some(
      (id) => id.toString() === currentUserId
    );
    const updatedStarredBy = isStarred
      ? target.starredBy.filter((id) => id.toString() !== currentUserId)
      : [...(target.starredBy || []), currentUserId];

    await patchLocalMessage(currentUserId, msgId, { starredBy: updatedStarredBy }).catch(() => {});
    setMessages((prev) =>
      prev.map((m) => (m._id === msgId ? { ...m, starredBy: updatedStarredBy } : m))
    );

    axiosInstance.post(`/messages/${msgId}/star`).catch(() => {});
  };

  const handleTogglePin = async (msgId) => {
    const target = messages.find((m) => m._id === msgId);
    const nextPinned = target ? !target.isPinned : true;
    try {
      const res = await axiosInstance.post(`/messages/${msgId}/pin`, {
        chatType: activeChat.type,
        chatId: activeChat.data._id,
        isPinned: nextPinned,
      });
      if (res.data?.success) {
        await patchLocalMessage(currentUserId, msgId, { isPinned: nextPinned }).catch(() => {});
        setMessages((prev) =>
          prev.map((m) => (m._id === msgId ? { ...m, isPinned: nextPinned } : m))
        );
        showToast(nextPinned ? "Message pinned to top" : "Message unpinned");
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to toggle pin", true);
    }
  };

  const toggleForwardTarget = (targetType, targetId) => {
    setForwardTargets((prev) => toggleTargetInList(prev, targetType, targetId));
  };

  const openScheduleModal = () => {
    const defaultTime = new Date(Date.now() + 15 * 60 * 1000);
    setSchedContent(inputText || "");
    setSchedDate(toLocalDateStr(defaultTime));
    setSchedTime(toLocalTimeStr(defaultTime));
    setSchedTargets(
      activeChat?.data?._id
        ? [{ type: activeChat.type, id: activeChat.data._id }]
        : []
    );
    setSchedSearch("");
    setSchedError("");
    setShowScheduleModal(true);
  };

  const applySchedulePreset = (offsetMinutes, fixedHour = null) => {
    let targetDate;
    if (fixedHour !== null) {
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(fixedHour, 0, 0, 0);
    } else {
      targetDate = new Date(Date.now() + offsetMinutes * 60 * 1000);
    }
    setSchedDate(toLocalDateStr(targetDate));
    setSchedTime(toLocalTimeStr(targetDate));
  };

  const handleConfirmSchedule = async (e) => {
    e.preventDefault();
    setSchedError("");
    const trimmed = schedContent.trim();
    if (!trimmed) {
      setSchedError("Please type a message to schedule.");
      return;
    }
    if (!schedDate || !schedTime) {
      setSchedError("Please select both a date and time.");
      return;
    }
    const scheduledAt = new Date(`${schedDate}T${schedTime}`);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now() + 2000) {
      setSchedError("Scheduled date & time must be in the future.");
      return;
    }
    if (schedTargets.length === 0) {
      setSchedError("Select at least one participant or group.");
      return;
    }

    setIsScheduling(true);
    try {
      const isSingleActiveReply =
        schedTargets.length === 1 && schedTargets[0].id === activeChat?.data?._id;
      const res = await axiosInstance.post("/messages/scheduled", {
        targets: schedTargets.map((t) => ({ chatType: t.type, chatId: t.id })),
        content: trimmed,
        replyTo: isSingleActiveReply ? replyingTo?._id || null : null,
        replyPreview: isSingleActiveReply ? buildReplyPreview(replyingTo) : null,
        scheduledFor: scheduledAt.toISOString(),
      });

      if (res.data?.success) {
        setScheduledMessages((prev) =>
          [...prev, res.data.data].sort(
            (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
          )
        );
        if (inputText.trim() === trimmed) {
          setInputText("");
          onDraftChange?.(activeChat.type, activeChat.data._id, "");
        }
        if (isSingleActiveReply) setReplyingTo(null);
        setShowScheduleModal(false);
        showToast("Timed message scheduled (sends even if offline)");
      }
    } catch (err) {
      setSchedError(err.response?.data?.message || "Failed to schedule message.");
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCancelScheduled = async (scheduledId) => {
    try {
      const res = await axiosInstance.delete(`/messages/scheduled/${scheduledId}`);
      if (res.data?.success) {
        setScheduledMessages((prev) => prev.filter((item) => item._id !== scheduledId));
        showToast("Scheduled message cancelled");
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to cancel scheduled message", true);
    }
  };

  const handleConfirmMultiForward = async () => {
    if (!messageToForward || forwardTargets.length === 0) return;

    try {
      const results = await Promise.allSettled(
        forwardTargets.map((target) =>
          axiosInstance.post("/messages", {
            chatType: target.type,
            chatId: target.id,
            content: messageToForward.content,
            mediaUrl: messageToForward.mediaUrl,
            mediaType: messageToForward.mediaType,
            fileName: messageToForward.fileName,
            fileSize: messageToForward.fileSize,
          })
        )
      );

      let sentCount = 0;
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.data?.success) {
          const forwardedMsg = r.value.data.data;
          sentCount += 1;
          await saveLocalMessages(currentUserId, [forwardedMsg]).catch(() => {});
          if (onMessageSent) onMessageSent(forwardedMsg);
          if (forwardedMsg.chatId === activeChat?.data?._id) {
            setMessages((prev) =>
              prev.some((m) => m._id === forwardedMsg._id) ? prev : [...prev, forwardedMsg]
            );
          }
        }
      }

      setShowForwardModal(false);
      setMessageToForward(null);
      setForwardTargets([]);
      setForwardSearch("");
      showToast(
        sentCount > 0
          ? `Forwarded to ${sentCount} chat${sentCount > 1 ? "s" : ""}`
          : "Could not forward message",
        sentCount === 0
      );
    } catch {
      showToast("Failed to forward message", true);
    }
  };

  const toggleSelectMessage = (msgId) => {
    setSelectedIds((prev) =>
      prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]
    );
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds([]);
  };

  const selectableMessages = messages.filter((m) => !m.isSystemMessage);

  const handleSelectAll = () => {
    if (selectedIds.length === selectableMessages.length && selectableMessages.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableMessages.map((m) => m._id));
    }
  };

  const openDeleteModal = (targetIds) => {
    if (!targetIds || targetIds.length === 0) return;
    setDeleteTargets(targetIds);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async (deleteType) => {
    if (deleteTargets.length === 0) return;
    try {
      const res = await axiosInstance.post("/messages/delete", {
        messageIds: deleteTargets,
        deleteType,
        chatType: activeChat.type,
        chatId: activeChat.data._id,
      });

      if (res.data?.success) {
        if (deleteType === "for_me") {
          await deleteLocalMessages(currentUserId, deleteTargets).catch(() => {});
          const delSet = new Set(deleteTargets);
          setMessages((prev) => prev.filter((m) => !(delSet.has(m._id) && !m.isSystemMessage)));
        } else {
          for (const id of deleteTargets) {
            await patchLocalMessage(currentUserId, id, {
              isDeletedForEveryone: true,
              isPinned: false,
              content: "This message was deleted",
              mediaUrl: "",
              mediaType: "text",
              fileName: "",
            }).catch(() => {});
          }
          setMessages((prev) =>
            prev.map((m) =>
              deleteTargets.includes(m._id) && !m.isSystemMessage
                ? {
                    ...m,
                    isDeletedForEveryone: true,
                    isPinned: false,
                    content: "This message was deleted",
                    mediaUrl: "",
                    mediaType: "text",
                    fileName: "",
                  }
                : m
            )
          );
        }
        if (onChatHistoryChanged) {
          await onChatHistoryChanged(activeChat.type, activeChat.data._id);
        }
        setSelectedIds((prev) => {
          const remaining = prev.filter((id) => !deleteTargets.includes(id));
          if (remaining.length === 0) setIsSelectionMode(false);
          return remaining;
        });
        setDeleteTargets([]);
        setShowDeleteModal(false);
      }
    } catch {
      showToast("Failed to delete messages", true);
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm("Clear all messages in this chat on your device?")) return;
    try {
      await clearLocalChatMessages(currentUserId, activeChat.type, activeChat.data._id);
      await axiosInstance.post("/messages/clear-chat", {
        chatType: activeChat.type,
        chatId: activeChat.data._id,
      });
      setMessages([]);
      onDraftChange?.(activeChat.type, activeChat.data._id, "");
      onMarkChatReadRef.current?.(activeChat.type, activeChat.data._id);
      if (onChatHistoryChanged) {
        await onChatHistoryChanged(activeChat.type, activeChat.data._id);
      }
      setShowHeaderMenu(false);
      showToast("Chat history cleared on this device");
    } catch {
      showToast("Failed to clear chat", true);
    }
  };

  const scrollToMessage = (messageId) => {
    const el = messageRefs.current[messageId];
    if (!el) {
      showToast("Original message not in current view", true);
      return;
    }
    el.scrollIntoView({ behavior: "auto", block: "center" });
    setHighlightedMsgId(messageId);
    setTimeout(() => {
      setHighlightedMsgId((cur) => (cur === messageId ? null : cur));
    }, 1800);
  };

  const handleOpenContextMenu = (e, msg) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 190;
    const menuHeight = 320;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 12);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 12);
    setContextMenu({ msg, x: Math.max(8, x), y: Math.max(8, y) });
  };

  if (!activeChat) {
    return (
      <div className="hidden md:flex flex-1 h-full chat-canvas-light dark:chat-canvas-dark flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-16 h-16 rounded-full bg-white/90 dark:bg-[#15191f] border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-blue-600 dark:text-emerald-400 mb-4 shadow-lg">
          <Hash size={30} />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-zinc-200">
          Select a conversation
        </h2>
        <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 max-w-sm">
          Pick a direct chat or group from the sidebar, or search by name or{" "}
          <span className="text-blue-600 dark:text-emerald-400 font-medium">@username</span> to start a new chat.
        </p>
      </div>
    );
  }

  const pinnedMessages = messages.filter((m) => m.isPinned && !m.isDeletedForEveryone);
  const safeCursor =
    pinnedMessages.length > 0 ? pinnedCursor % pinnedMessages.length : 0;
  const activePinned = pinnedMessages[safeCursor] || null;

  const canDeleteForEveryone =
    deleteTargets.length > 0 &&
    deleteTargets.every((id) => {
      const m = messages.find((item) => item._id === id);
      if (!m || m.isDeletedForEveryone || m.isSystemMessage) return false;
      const senderId = (m.sender?._id || m.sender?.id || m.sender)?.toString();
      return senderId === currentUserId || isCurrentUserGroupAdmin;
    });

  // Show inline WhatsApp-style Disappearing Message selector card when starting a brand new DM
  const showStrangerDisappearSetup =
    !isGroup && !activeChat.data?.disappearingConfigured && messages.length === 0 && !isDirectBlockedByMe;

  const activeChatScheduled = scheduledMessages.filter((s) =>
    (s.targets || []).some(
      (t) =>
        t.chatType === activeChat.type &&
        t.chatId?.toString() === activeChat.data?._id?.toString()
    )
  );

  return (
    <div className="flex-1 h-full w-full chat-canvas-light dark:chat-canvas-dark flex flex-col overflow-hidden relative text-slate-900 dark:text-zinc-100">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs font-medium shadow-xl border ${
            toast.isError
              ? "bg-rose-50 dark:bg-rose-950/95 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-200"
              : "bg-white/95 dark:bg-[#141920]/95 border-blue-200 dark:border-emerald-700 text-slate-800 dark:text-emerald-200"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Selection Header OR Chat Header */}
      {isSelectionMode || selectedIds.length > 0 ? (
        <div className="relative z-20 px-4 sm:px-6 py-3 bg-blue-50 dark:bg-[#17212b] border-b border-blue-200 dark:border-zinc-800 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3 text-blue-700 dark:text-emerald-300 font-semibold text-xs">
            <button
              onClick={exitSelectionMode}
              className="p-1.5 hover:bg-blue-100 dark:hover:bg-zinc-800 rounded-full text-slate-600 dark:text-zinc-300 transition"
              title="Cancel Selection"
            >
              <X size={16} />
            </button>
            <span>{selectedIds.length} Selected</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-blue-100 dark:hover:bg-zinc-700 text-xs text-blue-700 dark:text-zinc-200 rounded-full border border-blue-200 dark:border-zinc-700 transition"
            >
              {selectedIds.length === selectableMessages.length && selectableMessages.length > 0
                ? "Deselect All"
                : "Select All"}
            </button>
            <button
              onClick={() => openDeleteModal(selectedIds)}
              disabled={selectedIds.length === 0}
              className="p-2 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/80 text-rose-600 dark:text-rose-300 rounded-full border border-rose-200 dark:border-rose-800/60 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Delete Selected"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative z-20 px-3 sm:px-6 py-2.5 sm:py-3 bg-white/95 dark:bg-[#111418]/95 backdrop-blur-sm border-b border-slate-200 dark:border-zinc-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="md:hidden p-1.5 -ml-1 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition shrink-0"
                title="Back to chats"
              >
                <ArrowLeft size={18} />
              </button>
            )}

            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-zinc-800 border border-blue-200/70 dark:border-zinc-700/70 flex items-center justify-center text-blue-700 dark:text-emerald-300 font-bold">
                {isGroup ? (
                  <Hash size={18} />
                ) : (
                  <span className="text-xs uppercase font-mono">
                    {directRecipient?.username?.slice(0, 2) || "DM"}
                  </span>
                )}
              </div>
              {!isGroup && isDirectOnline && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#111418]"></span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <h2 className="font-semibold text-sm truncate">
                  {isGroup
                    ? groupData?.name
                    : directRecipient?.fullName || `@${directRecipient?.username}`}
                </h2>
                {!isGroup && (
                  <span className="hidden sm:inline font-mono text-xs text-blue-600 dark:text-emerald-400 truncate">
                    @{directRecipient?.username}
                  </span>
                )}
                {isDirectBlockedByMe && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 shrink-0">
                    Blocked
                  </span>
                )}
              </div>

              {isGroup ? (
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center space-x-1 mt-0.5 truncate">
                  <span>{groupData?.members?.length || 1} members</span>
                  {typingUser && (
                    <>
                      <span className="opacity-60">•</span>
                      <span className="text-blue-600 dark:text-emerald-400 italic font-medium animate-pulse">
                        @{typingUser} is typing...
                      </span>
                    </>
                  )}
                </p>
              ) : (
                <p className="text-[11px] flex items-center space-x-1.5 mt-0.5">
                  {isDirectBlockedByMe ? (
                    <span className="text-rose-500">blocked</span>
                  ) : isDirectOnline ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">online</span>
                  ) : (
                    <span className="text-slate-400 dark:text-zinc-500">offline</span>
                  )}
                  {typingUser && !isDirectBlockedByMe && (
                    <>
                      <span className="opacity-60">•</span>
                      <span className="text-blue-600 dark:text-emerald-400 italic font-medium animate-pulse">
                        typing...
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2 relative shrink-0">
            {(!isGroup || isCurrentUserGroupAdmin) && (
              <button
                onClick={() => setShowDisappearModal(true)}
                className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-medium border transition ${
                  disappearingDuration > 0
                    ? "bg-blue-50 dark:bg-[#1f3b2c]/50 border-blue-300 dark:border-emerald-700/70 text-blue-700 dark:text-emerald-300"
                    : "bg-slate-100 dark:bg-zinc-800/80 border-slate-200 dark:border-zinc-700/60 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                }`}
                title="Customize disappearing messages timer"
              >
                <Timer size={12} />
                <span className="hidden xs:inline sm:inline">
                  {disappearingDuration > 0 ? activeDisappearMeta.short : "Timer Off"}
                </span>
              </button>
            )}

            {isSessionGroup && (
              <div
                className={`flex items-center space-x-1 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-mono font-medium border ${
                  isExpired
                    ? "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300"
                    : isNotStarted
                    ? "bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300"
                    : "bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/80 text-amber-700 dark:text-amber-300 animate-pulse"
                }`}
              >
                <Clock size={12} />
                <span>{isExpired ? "Ended" : timeLeft}</span>
              </div>
            )}

            {isGroup && onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className="p-2 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition"
                title="Group Details & Shield Actions"
              >
                <Shield size={18} />
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowHeaderMenu((prev) => !prev);
              }}
              className="p-2 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition"
              title="Chat Options"
            >
              <MoreVertical size={18} />
            </button>

            {showHeaderMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-11 z-50 w-52 bg-white dark:bg-[#14181e] border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 text-xs text-slate-700 dark:text-zinc-200"
              >
                {(!isGroup || isCurrentUserGroupAdmin) && (
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      setShowDisappearModal(true);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2"
                  >
                    <Timer size={14} className="text-blue-600 dark:text-emerald-400" />
                    <span>Disappearing Messages</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsSelectionMode(true);
                    setSelectedIds([]);
                    setShowHeaderMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2"
                >
                  <CheckSquare size={14} />
                  <span>Select Messages</span>
                </button>

                {!isGroup && directRecipient?._id && (
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      onToggleBlockUser &&
                        onToggleBlockUser(directRecipient._id, isDirectBlockedByMe);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2"
                  >
                    {isDirectBlockedByMe ? (
                      <ShieldCheck size={14} className="text-emerald-500" />
                    ) : (
                      <Ban size={14} className="text-amber-500" />
                    )}
                    <span>
                      {isDirectBlockedByMe
                        ? `Unblock @${directRecipient.username}`
                        : `Block @${directRecipient.username}`}
                    </span>
                  </button>
                )}

                {isGroup && (
                  <button
                    onClick={handleClearChat}
                    className="w-full text-left px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center space-x-2"
                  >
                    <Trash2 size={14} />
                    <span>Clear Chat History</span>
                  </button>
                )}

                {!isGroup && (
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      if (
                        window.confirm(
                          `Delete entire chat with ${directRecipient?.fullName || "this user"} and remove from sidebar?`
                        )
                      ) {
                        onDeleteDirectChat && onDeleteDirectChat(activeChat.data._id);
                      }
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center space-x-2"
                  >
                    <Trash2 size={14} />
                    <span>Delete Chat</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Clickable Pinned Announcement Banner */}
      {activePinned && (
        <div
          onClick={() => {
            scrollToMessage(activePinned._id);
            if (pinnedMessages.length > 1) {
              setPinnedCursor((prev) => (prev + 1) % pinnedMessages.length);
            }
          }}
          className="bg-white/85 dark:bg-[#141a21]/90 hover:bg-white dark:hover:bg-[#1a222b] cursor-pointer border-b border-slate-200/80 dark:border-zinc-800 px-4 sm:px-6 py-2 flex items-center justify-between text-xs transition select-none backdrop-blur-sm"
          title="Click to jump instantly to pinned message"
        >
          <div className="flex items-center space-x-2 min-w-0">
            <Pin size={13} className="text-amber-500 rotate-45 shrink-0" />
            <span className="font-semibold text-blue-700 dark:text-emerald-400 shrink-0">
              Pinned{pinnedMessages.length > 1 ? ` (${safeCursor + 1}/${pinnedMessages.length})` : ""}:
            </span>
            <span className="truncate text-slate-700 dark:text-zinc-300 font-normal">
              {activePinned.content ||
                (activePinned.mediaType === "audio"
                  ? "🎤 Voice message"
                  : activePinned.mediaType === "image"
                  ? "📷 Photo"
                  : activePinned.mediaType === "video"
                  ? "🎥 Video"
                  : activePinned.fileName || "Media message")}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePin(activePinned._id);
            }}
            className="text-[11px] text-blue-600 dark:text-emerald-400 hover:underline ml-3 shrink-0 px-2 py-0.5 rounded"
          >
            Unpin
          </button>
        </div>
      )}

      {/* Message Feed */}
      <div
        onScroll={() => setContextMenu(null)}
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2.5"
      >
        {/* First-time Stranger Chat Disappearing Timer Quick Prompt */}
        {showStrangerDisappearSetup && (
          <div className="max-w-md mx-auto my-6 p-4 bg-white/95 dark:bg-[#14181e]/95 border border-slate-200 dark:border-zinc-800 rounded-2xl text-center space-y-3 shadow-md backdrop-blur-sm">
            <div className="w-10 h-10 mx-auto rounded-full bg-blue-50 dark:bg-[#1f3b2c]/50 border border-blue-200 dark:border-emerald-700/60 flex items-center justify-center text-blue-600 dark:text-emerald-400">
              <Timer size={20} />
            </div>
            <div>
              <h4 className="text-xs font-semibold">
                Disappearing Messages with @{directRecipient?.username}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                New chat started. Choose a disappearing timer for this conversation (customizable anytime):
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {DISAPPEAR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSetDisappearingTimer(opt.value)}
                  className={`py-1.5 px-2 rounded-xl border text-[11px] font-medium transition ${
                    disappearingDuration === opt.value
                      ? "bg-blue-600 dark:bg-emerald-700 border-blue-600 dark:border-emerald-600 text-white"
                      : "bg-slate-50 dark:bg-[#0b0d10] border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-blue-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length === 0 && !showStrangerDisappearSetup ? (
          <div className="text-center py-16 text-slate-600 dark:text-zinc-500 text-xs">
            <div className="inline-block px-4 py-2 rounded-full bg-white/80 dark:bg-[#14181e] border border-slate-200/70 dark:border-zinc-800 shadow-sm">
              <p className="font-medium">No messages yet.</p>
              <p className="text-[11px] mt-0.5 text-slate-500 dark:text-zinc-500">
                Messages live on your device & are deleted from servers once delivered.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const senderId = (msg.sender?._id || msg.sender?.id || msg.sender)?.toString();
            const isMe = senderId === currentUserId;
            const isSelected = selectedIds.includes(msg._id);
            const isHighlighted = highlightedMsgId === msg._id;
            const isStarred = (msg.starredBy || []).some(
              (id) => id.toString() === currentUserId
            );

            if (msg.isSystemMessage) {
              return (
                <div key={msg._id || index} className="text-center my-3">
                  <span className="inline-block px-3.5 py-1 rounded-full bg-white/85 dark:bg-[#171c22] border border-slate-200/80 dark:border-zinc-800 text-[11px] text-slate-700 dark:text-zinc-300 font-medium shadow-sm">
                    {msg.content}
                  </span>
                </div>
              );
            }

            const resolvedUrl = resolveMediaUrl(msg.mediaUrl);
            const replyData =
              msg.replyPreview ||
              (msg.replyTo && typeof msg.replyTo === "object"
                ? {
                    _id: msg.replyTo._id,
                    senderUsername: msg.replyTo.sender?.username || "user",
                    content: msg.replyTo.isDeletedForEveryone
                      ? "This message was deleted"
                      : msg.replyTo.content,
                    mediaType: msg.replyTo.mediaType,
                    fileName: msg.replyTo.fileName,
                  }
                : null);

            return (
              <div
                key={msg._id || index}
                ref={(el) => {
                  if (el && msg._id) messageRefs.current[msg._id] = el;
                  else if (msg._id) delete messageRefs.current[msg._id];
                }}
                onClick={() => {
                  if (isSelectionMode || selectedIds.length > 0) toggleSelectMessage(msg._id);
                }}
                className={`flex items-center gap-2 sm:gap-3 relative transition-colors duration-200 rounded-xl ${
                  isSelectionMode ? "cursor-pointer select-none py-0.5" : ""
                } ${isSelected ? "bg-blue-500/15 dark:bg-emerald-500/15 -mx-3 sm:-mx-6 px-3 sm:px-6 py-1" : ""} ${
                  isHighlighted ? "bg-amber-400/20 -mx-2 sm:-mx-4 px-2 sm:px-4 py-1.5 ring-2 ring-amber-400/70" : ""
                }`}
              >
                {isSelectionMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelectMessage(msg._id);
                    }}
                    aria-label={isSelected ? "Deselect message" : "Select message"}
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition ${
                      isSelected
                        ? "bg-blue-600 dark:bg-emerald-500 border-blue-600 dark:border-emerald-500 text-white shadow-sm"
                        : "border-slate-400/80 dark:border-zinc-500 bg-white/85 dark:bg-[#14181e]/90 hover:border-blue-500 dark:hover:border-emerald-400"
                    }`}
                  >
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </button>
                )}

                <div
                  className={`flex-1 flex flex-col min-w-0 ${
                    isMe ? "items-end" : "items-start"
                  }`}
                >
                  {!isMe && isGroup && (
                    <span className="text-[10px] text-slate-600 dark:text-zinc-400 mb-0.5 ml-3 font-medium">
                      @{msg.sender?.username || "user"}
                    </span>
                  )}

                  <div
                    onContextMenu={(e) => handleOpenContextMenu(e, msg)}
                    className={`relative min-w-[128px] max-w-[85%] sm:max-w-[75%] md:max-w-lg px-4 py-2 rounded-[22px] text-xs leading-relaxed transition cursor-context-menu ${
                      isMe
                        ? "bg-[#c8d8fa] text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)] dark:bg-[#1f3b2c] dark:text-zinc-100 dark:shadow-[0_1px_2px_rgba(0,0,0,0.45)] rounded-br-[4px] mr-2"
                        : "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)] dark:bg-[#20272e] dark:text-zinc-100 dark:shadow-[0_1px_2px_rgba(0,0,0,0.45)] rounded-bl-[4px] ml-2"
                    } ${isSelected ? "ring-2 ring-blue-500 dark:ring-emerald-400" : ""}`}
                  >
                    <BubbleTail isMe={isMe} />

                    {replyData && (
                      <div
                        onClick={(e) => {
                          if (!isSelectionMode && selectedIds.length === 0 && replyData._id) {
                            e.stopPropagation();
                            scrollToMessage(replyData._id);
                          }
                        }}
                      className={`mb-2 p-2 rounded-xl border-l-2 text-[11px] space-y-0.5 cursor-pointer transition ${
                        isMe
                          ? "bg-black/[0.06] hover:bg-black/[0.1] dark:bg-black/25 dark:hover:bg-black/35 border-blue-600 dark:border-emerald-400"
                          : "bg-slate-100/90 hover:bg-slate-200/70 dark:bg-black/25 dark:hover:bg-black/35 border-blue-500 dark:border-emerald-400"
                      }`}
                    >
                      <span className="font-semibold text-blue-700 dark:text-emerald-300 block">
                        @{replyData.senderUsername}
                      </span>
                      <p className="truncate text-slate-600 dark:text-zinc-300/85 italic">
                        {replyData.content ||
                          replyData.fileName ||
                          (replyData.mediaType === "image"
                            ? "📷 Photo"
                            : replyData.mediaType === "audio"
                            ? "🎤 Voice message"
                            : "Media")}
                      </p>
                    </div>
                  )}

                  {resolvedUrl && !msg.isDeletedForEveryone && (
                    <div className="mb-1.5">
                      {msg.mediaType === "image" && (
                        <a
                          href={resolvedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            if (isSelectionMode) e.preventDefault();
                          }}
                        >
                          <img
                            src={resolvedUrl}
                            alt={msg.fileName || "Image"}
                            loading="lazy"
                            className="rounded-2xl max-h-64 max-w-full object-cover border border-black/10 dark:border-white/10 hover:opacity-95 transition"
                          />
                        </a>
                      )}

                      {msg.mediaType === "video" && (
                        <video
                          src={resolvedUrl}
                          controls
                          preload="metadata"
                          className="rounded-2xl max-h-64 w-full border border-black/10 dark:border-white/10"
                        />
                      )}

                      {msg.mediaType === "audio" && (
                        <div className="p-1 bg-black/5 dark:bg-black/25 rounded-2xl">
                          <audio
                            src={resolvedUrl}
                            controls
                            preload="metadata"
                            className="w-56 sm:w-64 max-w-full h-8"
                          />
                        </div>
                      )}

                      {msg.mediaType === "document" && (
                        <a
                          href={resolvedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={msg.fileName}
                          onClick={(e) => {
                            if (isSelectionMode) e.preventDefault();
                          }}
                          className="flex items-center space-x-2.5 p-2.5 bg-black/5 hover:bg-black/10 dark:bg-black/25 dark:hover:bg-black/35 rounded-2xl transition"
                        >
                          <FileText size={20} className="text-blue-600 dark:text-emerald-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">
                              {msg.fileName || "Document"}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                              {msg.fileSize
                                ? `${(msg.fileSize / 1024).toFixed(1)} KB`
                                : "Click to download"}
                            </p>
                          </div>
                          <Download size={14} className="shrink-0 text-slate-500 dark:text-zinc-300" />
                        </a>
                      )}
                    </div>
                  )}

                  {msg.content && (
                    <p
                      className={`whitespace-pre-wrap break-words ${
                        msg.isDeletedForEveryone
                          ? "italic text-slate-500 dark:text-zinc-400"
                          : ""
                      }`}
                    >
                      {msg.content}
                    </p>
                  )}

                  {/* Footer: Disappearing Timer, Pin, Star, Edited, Timestamp, 3-State WhatsApp Ticks */}
                  <div className="flex items-center justify-end space-x-1.5 mt-0.5 text-[10px]">
                    {msg.disappearAt && !msg.isDeletedForEveryone && (
                      <Timer
                        size={10}
                        className="opacity-65 shrink-0"
                        title={`Disappears ${new Date(msg.disappearAt).toLocaleString()}`}
                      />
                    )}
                    {msg.isPinned && !msg.isDeletedForEveryone && (
                      <Pin
                        size={10}
                        className="rotate-45 text-amber-500 shrink-0"
                        title="Pinned message"
                      />
                    )}
                    {isStarred && (
                      <Star
                        size={10}
                        className="fill-amber-400 text-amber-400 shrink-0"
                        title="Starred"
                      />
                    )}
                    {msg.isEdited && !msg.isDeletedForEveryone && (
                      <span className="italic text-slate-500 dark:text-zinc-400">edited</span>
                    )}
                    <span className="text-slate-500 dark:text-zinc-400">
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {isMe && !msg.isDeletedForEveryone && (
                      msg.deliveryStatus === "seen" ? (
                        <CheckCheck
                          size={13}
                          className="text-blue-600 dark:text-sky-400 shrink-0"
                          title="Seen"
                        />
                      ) : msg.deliveryStatus === "delivered" ? (
                        <CheckCheck
                          size={12}
                          className="text-slate-500 dark:text-zinc-400 shrink-0"
                          title="Delivered to device"
                        />
                      ) : (
                        <Check
                          size={12}
                          className="text-slate-500 dark:text-zinc-400 shrink-0"
                          title="Sent (queued for delivery)"
                        />
                      )
                    )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 w-48 bg-white dark:bg-[#14181e] border border-slate-200 dark:border-zinc-700 rounded-xl shadow-2xl py-1.5 text-xs text-slate-700 dark:text-zinc-200 select-none"
        >
          {!contextMenu.msg.isDeletedForEveryone && (
            <>
              <button
                onClick={() => {
                  setEditingMsg(null);
                  setReplyingTo(contextMenu.msg);
                  setContextMenu(null);
                  inputRef.current?.focus();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2.5 transition"
              >
                <CornerUpLeft size={14} className="text-blue-600 dark:text-emerald-400" />
                <span>Reply</span>
              </button>

              {(contextMenu.msg.sender?._id || contextMenu.msg.sender?.id || contextMenu.msg.sender)?.toString() ===
                currentUserId && (
                <button
                  onClick={() => {
                    setReplyingTo(null);
                    setEditingMsg(contextMenu.msg);
                    setInputText(contextMenu.msg.content || "");
                    setContextMenu(null);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2.5 transition"
                >
                  <Edit3 size={14} className="text-amber-500" />
                  <span>Edit</span>
                </button>
              )}

              {(contextMenu.msg.content || contextMenu.msg.fileName) && (
                <button
                  onClick={() => {
                    handleCopyMessage(contextMenu.msg);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2.5 transition"
                >
                  <Copy size={14} className="text-slate-400" />
                  <span>Copy</span>
                </button>
              )}

              <button
                onClick={() => {
                  setMessageToForward(contextMenu.msg);
                  setForwardTargets([]);
                  setForwardSearch("");
                  setShowForwardModal(true);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2.5 transition"
              >
                <Forward size={14} className="text-slate-400" />
                <span>Forward</span>
              </button>

              <button
                onClick={() => {
                  handleTogglePin(contextMenu.msg._id);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2.5 transition"
              >
                <Pin size={14} className={contextMenu.msg.isPinned ? "text-amber-500" : "text-slate-400"} />
                <span>{contextMenu.msg.isPinned ? "Unpin" : "Pin to top"}</span>
              </button>

              <button
                onClick={() => {
                  handleToggleStar(contextMenu.msg._id);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2.5 transition"
              >
                <Star
                  size={14}
                  className={
                    (contextMenu.msg.starredBy || []).some((id) => id.toString() === currentUserId)
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-400"
                  }
                />
                <span>
                  {(contextMenu.msg.starredBy || []).some((id) => id.toString() === currentUserId)
                    ? "Unstar"
                    : "Star"}
                </span>
              </button>

              <button
                onClick={() => {
                  setIsSelectionMode(true);
                  toggleSelectMessage(contextMenu.msg._id);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2.5 transition"
              >
                <CheckSquare size={14} className="text-slate-400" />
                <span>Select</span>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-zinc-800" />
            </>
          )}

          <button
            onClick={() => {
              const targetId = contextMenu.msg._id;
              setContextMenu(null);
              openDeleteModal([targetId]);
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center space-x-2.5 transition"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Pending Timed / Scheduled Messages Drawer Strip */}
      {activeChatScheduled.length > 0 && (
        <div className="bg-white/95 dark:bg-[#111418]/95 border-t border-slate-200 dark:border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setShowScheduledPanel((prev) => !prev)}
            className="w-full px-4 sm:px-6 py-1.5 flex items-center justify-between text-blue-700 dark:text-emerald-400 hover:bg-slate-100/80 dark:hover:bg-zinc-800/60 transition"
          >
            <span className="flex items-center space-x-2 font-medium">
              <CalendarClock size={14} />
              <span>
                {activeChatScheduled.length} Timed Message{activeChatScheduled.length > 1 ? "s" : ""} Queued
              </span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400">
              {showScheduledPanel ? "Hide" : "View / Cancel"}
            </span>
          </button>

          {showScheduledPanel && (
            <div className="px-4 sm:px-6 pb-2.5 pt-1 max-h-36 overflow-y-auto space-y-1.5">
              {activeChatScheduled.map((item) => (
                <div
                  key={item._id}
                  className="p-2 rounded-xl bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 flex items-center justify-between space-x-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{item.content}</p>
                    <p className="text-[10px] text-blue-600 dark:text-emerald-400 mt-0.5">
                      Sends {new Date(item.scheduledFor).toLocaleString()}
                      {item.targets?.length > 1 ? ` • ${item.targets.length} chats` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancelScheduled(item._id)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-full transition shrink-0"
                    title="Cancel scheduled message"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reply Banner Above Input */}
      {replyingTo && (
        <div className="px-4 sm:px-6 py-2 bg-white/95 dark:bg-[#111418] border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 min-w-0">
            <CornerUpLeft size={14} className="text-blue-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-blue-700 dark:text-emerald-300 block">
                Replying to @{replyingTo.sender?.username || "user"}
              </span>
              <p className="truncate text-slate-500 dark:text-zinc-400 text-[11px]">
                {replyingTo.content || replyingTo.fileName || "Media message"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Editing Banner Above Input */}
      {editingMsg && (
        <div className="px-4 sm:px-6 py-2 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800/40 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 min-w-0">
            <Edit3 size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-amber-700 dark:text-amber-300 block">Editing message</span>
              <p className="truncate text-slate-600 dark:text-zinc-400 text-[11px]">{editingMsg.content}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingMsg(null);
              setInputText(
                activeChat?.data?._id
                  ? draftsRef.current[`${activeChat.type}:${activeChat.data._id}`] || ""
                  : ""
              );
            }}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
            title="Cancel Edit"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Voice Recording Live Bar */}
      {isRecording && (
        <div className="px-4 sm:px-6 py-3 bg-white/95 dark:bg-[#111418]/95 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-rose-500">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="font-mono font-semibold">
              Recording Voice: {Math.floor(recordingSeconds / 60)}:
              {String(recordingSeconds % 60).padStart(2, "0")}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={cancelRecording}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition"
              title="Cancel Recording"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={stopAndSendRecording}
              className="py-1.5 px-3 bg-blue-600 dark:bg-emerald-700 hover:bg-blue-500 dark:hover:bg-emerald-600 text-white rounded-full text-xs font-medium flex items-center space-x-1.5 shadow-md transition"
            >
              <Send size={13} />
              <span>Send Voice</span>
            </button>
          </div>
        </div>
      )}

      {/* Lock Banners OR Pill Composer */}
      {isDirectBlockedByMe ? (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/35 border-t border-rose-200 dark:border-rose-900/50 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-rose-600 dark:text-rose-300 flex items-center space-x-1.5">
            <Ban size={15} />
            <span>You blocked @{directRecipient?.username}. Unblock to resume messaging.</span>
          </span>
          <button
            onClick={() =>
              onToggleBlockUser && onToggleBlockUser(directRecipient._id, true)
            }
            className="px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 rounded-full font-medium transition"
          >
            Unblock
          </button>
        </div>
      ) : isGroup && isSessionGroup && isNotStarted ? (
        <div className="p-4 bg-sky-50 dark:bg-sky-950/40 border-t border-sky-200 dark:border-sky-900/50 flex items-center justify-center space-x-2 text-sky-700 dark:text-sky-300 text-xs font-medium text-center">
          <CalendarClock size={16} />
          <span>
            Session scheduled to open at{" "}
            {new Date(groupData.startsAt).toLocaleString()}.
          </span>
        </div>
      ) : isGroup && isSessionGroup && isExpired ? (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border-t border-rose-200 dark:border-rose-900/50 flex items-center justify-center space-x-2 text-rose-600 dark:text-rose-300 text-xs font-medium text-center">
          <AlertCircle size={16} />
          <span>This session group has expired. Messages are locked.</span>
        </div>
      ) : (
        !isRecording && (
          <form
            onSubmit={handleSendMessage}
            className="px-2.5 sm:px-4 py-2.5 bg-white/95 dark:bg-[#111418]/95 backdrop-blur-sm border-t border-slate-200 dark:border-zinc-800/80 flex items-center space-x-1.5 sm:space-x-2"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
            />

            {!editingMsg && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="p-2 sm:p-2.5 text-slate-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition disabled:opacity-50 shrink-0"
                  title="Attach Images, Videos, Audio, or Documents"
                >
                  <Paperclip size={16} className={isUploading ? "animate-spin" : ""} />
                </button>

                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isUploading}
                  className="p-2 sm:p-2.5 text-slate-500 dark:text-zinc-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition disabled:opacity-50 shrink-0"
                  title="Record Voice Note"
                >
                  <Mic size={16} />
                </button>
              </>
            )}

            <div className="flex-1 min-w-0 relative">
              <input
                ref={inputRef}
                type="text"
                placeholder={
                  isUploading
                    ? "Compressing & uploading media..."
                    : editingMsg
                    ? "Edit your message..."
                    : "Type a message..."
                }
                value={inputText}
                disabled={isUploading}
                onChange={handleTypingChange}
                className="w-full bg-[#f0f2f5] dark:bg-[#1a1f25] border border-transparent dark:border-zinc-800 rounded-full px-4 py-2 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-500 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-600 transition"
              />
            </div>

            {!editingMsg && (
              <button
                type="button"
                onClick={openScheduleModal}
                disabled={isUploading}
                className="p-2 sm:p-2.5 text-slate-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition disabled:opacity-50 shrink-0"
                title="Schedule timed message (sends even if offline)"
              >
                <CalendarClock size={16} />
              </button>
            )}

            <button
              type="submit"
              disabled={!inputText.trim() || isUploading}
              className="p-2.5 bg-blue-600 dark:bg-emerald-700 hover:bg-blue-500 dark:hover:bg-emerald-600 disabled:opacity-45 text-white rounded-full shadow-sm transition shrink-0"
              title={editingMsg ? "Save Edit" : "Send Message"}
            >
              {editingMsg ? <Check size={15} /> : <Send size={15} />}
            </button>
          </form>
        )
      )}

      {/* Disappearing Messages Customize Modal */}
      {showDisappearModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#111418] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-zinc-800">
              <h3 className="font-semibold text-sm flex items-center space-x-2">
                <Timer size={16} className="text-blue-600 dark:text-emerald-400" />
                <span>Disappearing Messages</span>
              </h3>
              <button
                onClick={() => setShowDisappearModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              For extra privacy, new messages in this chat will automatically disappear from both devices after the selected duration:
            </p>

            <div className="space-y-2">
              {DISAPPEAR_OPTIONS.map((opt) => {
                const active = disappearingDuration === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleSetDisappearingTimer(opt.value)}
                    className={`w-full text-left px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition ${
                      active
                        ? "bg-blue-50 dark:bg-[#1f3b2c]/50 border-blue-500 dark:border-emerald-600 text-blue-700 dark:text-emerald-300"
                        : "bg-slate-50 dark:bg-[#0b0d10] border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {active && <Check size={14} className="text-blue-600 dark:text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Multi-Recipient Forward Modal */}
      {showForwardModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#111418] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-zinc-800">
              <h3 className="font-semibold text-sm flex items-center space-x-2">
                <Forward size={16} className="text-blue-600 dark:text-emerald-400" />
                <span>Forward to Contacts / Groups</span>
              </h3>
              <button
                onClick={() => {
                  setShowForwardModal(false);
                  setMessageToForward(null);
                  setForwardTargets([]);
                }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <ChatTargetChecklist
              directChats={directChats}
              groups={groups}
              currentUserId={currentUserId}
              selectedTargets={forwardTargets}
              searchTerm={forwardSearch}
              onSearchChange={setForwardSearch}
              onToggleTarget={toggleForwardTarget}
            />

            <button
              onClick={handleConfirmMultiForward}
              disabled={forwardTargets.length === 0}
              className="w-full py-2 px-4 bg-blue-600 dark:bg-emerald-700 hover:bg-blue-500 dark:hover:bg-emerald-600 disabled:opacity-45 text-white text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 transition"
            >
              <Send size={13} />
              <span>
                {forwardTargets.length === 0
                  ? "Select chats to forward"
                  : `Forward to ${forwardTargets.length} chat${forwardTargets.length > 1 ? "s" : ""}`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Timed / Scheduled Message Modal (Offline-Capable) */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleConfirmSchedule}
            className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-white dark:bg-[#111418] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3.5"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-zinc-800">
              <h3 className="font-semibold text-sm flex items-center space-x-2">
                <CalendarClock size={16} className="text-blue-600 dark:text-emerald-400" />
                <span>Schedule Timed Message</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            {schedError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
                {schedError}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                Message Content
              </label>
              <textarea
                rows={3}
                placeholder="Type the message you want delivered later..."
                value={schedContent}
                onChange={(e) => setSchedContent(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Delivery Date & Time
                </label>
                <div className="flex space-x-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => applySchedulePreset(15)}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-blue-600 dark:text-emerald-300 transition"
                  >
                    +15m
                  </button>
                  <button
                    type="button"
                    onClick={() => applySchedulePreset(60)}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-blue-600 dark:text-emerald-300 transition"
                  >
                    +1h
                  </button>
                  <button
                    type="button"
                    onClick={() => applySchedulePreset(0, 9)}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-blue-600 dark:text-emerald-300 transition"
                  >
                    Tomorrow 9 AM
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="date"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block">
                Select Recipients ({schedTargets.length} selected)
              </label>
              <ChatTargetChecklist
                directChats={directChats}
                groups={groups}
                currentUserId={currentUserId}
                selectedTargets={schedTargets}
                searchTerm={schedSearch}
                onSearchChange={setSchedSearch}
                onToggleTarget={(t, id) =>
                  setSchedTargets((prev) => toggleTargetInList(prev, t, id))
                }
              />
            </div>

            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Stored safely in queue — will be delivered automatically on time even if you go offline.
            </p>

            <button
              type="submit"
              disabled={isScheduling || !schedContent.trim() || schedTargets.length === 0}
              className="w-full py-2 px-4 bg-blue-600 dark:bg-emerald-700 hover:bg-blue-500 dark:hover:bg-emerald-600 disabled:opacity-45 text-white text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 transition"
            >
              <CalendarClock size={14} />
              <span>
                {isScheduling
                  ? "Scheduling..."
                  : `Schedule for ${schedTargets.length} recipient${schedTargets.length > 1 ? "s" : ""}`}
              </span>
            </button>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#111418] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="font-semibold text-sm flex items-center space-x-2 text-rose-500">
              <Trash2 size={18} />
              <span>Delete {deleteTargets.length} Message(s)?</span>
            </h3>

            <div className="space-y-2 pt-2">
              {canDeleteForEveryone && (
                <button
                  onClick={() => handleConfirmDelete("for_everyone")}
                  className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-medium transition"
                >
                  Delete for Everyone
                </button>
              )}
              <button
                onClick={() => handleConfirmDelete("for_me")}
                className="w-full py-2 px-3 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 rounded-xl text-xs font-medium transition"
              >
                Delete for Me
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTargets([]);
                }}
                className="w-full py-1.5 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 text-xs transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatBox;
