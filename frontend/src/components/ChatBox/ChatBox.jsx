import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import axiosInstance, { resolveMediaUrl } from "../../api/axiosInstance";
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
  Edit3,
} from "lucide-react";

const ChatBox = ({
  activeChat,
  onOpenAdmin,
  onMessageSent,
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

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messageRefs = useRef({});
  const prevMsgCountRef = useRef(0);

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
  const [contextMenu, setContextMenu] = useState(null); // { msg, x, y }
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);
  const [deleteTargets, setDeleteTargets] = useState([]); // Array of msg IDs to delete
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [pinnedCursor, setPinnedCursor] = useState(0);
  const [toast, setToast] = useState(null);

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

  const isDirectOnline = directRecipient?._id
    ? onlineUsers.some((id) => id.toString() === directRecipient._id.toString())
    : false;

  const showToast = (text, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 2500);
  };

  // Close right-click context menu & header menu on outside click or Escape
  useEffect(() => {
    const closeMenus = () => {
      setContextMenu(null);
    };
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

  // Reset states & fetch message history on active chat change
  useEffect(() => {
    setIsExpired(false);
    setTimeLeft("");
    setReplyingTo(null);
    setEditingMsg(null);
    setInputText("");
    setSelectedIds([]);
    setContextMenu(null);
    setShowHeaderMenu(false);
    setHighlightedMsgId(null);
    setPinnedCursor(0);
    prevMsgCountRef.current = 0;

    if (!activeChat?.data?._id) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    const fetchChatMessages = async () => {
      try {
        const res = await axiosInstance.get(
          `/messages/${activeChat.type}/${activeChat.data._id}`
        );
        if (res.data?.success && isMounted) {
          setMessages(res.data.data);
        }
      } catch (err) {
        console.error("Error fetching message history:", err);
      }
    };

    fetchChatMessages();
    return () => {
      isMounted = false;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setTypingUser(null);
      setIsTyping(false);
    };
  }, [activeChat?.type, activeChat?.data?._id]);

  // Countdown timer logic for session groups
  useEffect(() => {
    if (!isGroup || !isSessionGroup || !groupData?.expiresAt) {
      setIsExpired(false);
      setTimeLeft("");
      return;
    }

    const updateTimer = () => {
      const diff = new Date(groupData.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("00:00:00");
        setIsExpired(true);
        return;
      }

      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setTimeLeft(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
          2,
          "0"
        )}:${String(seconds).padStart(2, "0")}`
      );
      setIsExpired(false);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isGroup, isSessionGroup, groupData?.expiresAt]);

  // Socket room join & real-time message listeners
  useEffect(() => {
    if (!socket || !activeChat?.data?._id) return;

    const roomType = activeChat.type;
    const roomId = activeChat.data._id;
    socket.emit("room:join", { roomType, roomId });

    const handleNewMessage = (newMsg) => {
      if (newMsg.chatId?.toString() !== roomId.toString()) return;
      setMessages((prev) =>
        prev.some((m) => m._id === newMsg._id) ? prev : [...prev, newMsg]
      );
    };

    const handleMessageUpdated = (updatedMsg) => {
      if (updatedMsg.chatId?.toString() !== roomId.toString()) return;
      setMessages((prev) =>
        prev.map((m) => (m._id === updatedMsg._id ? updatedMsg : m))
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

    const handleTyping = (data) => {
      if (data.roomId === roomId && data.username !== user?.username) {
        setTypingUser(data.isTyping ? data.username : null);
      }
    };

    const handleGroupExpired = (data) => {
      if (data.groupId === roomId) setIsExpired(true);
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:updated", handleMessageUpdated);
    socket.on("message:deleted_for_everyone", handleDeletedForEveryone);
    socket.on("typing:update", handleTyping);
    socket.on("group:expired", handleGroupExpired);

    return () => {
      socket.emit("room:leave", { roomType, roomId });
      socket.off("message:new", handleNewMessage);
      socket.off("message:updated", handleMessageUpdated);
      socket.off("message:deleted_for_everyone", handleDeletedForEveryone);
      socket.off("typing:update", handleTyping);
      socket.off("group:expired", handleGroupExpired);
    };
  }, [socket, activeChat?.type, activeChat?.data?._id, user?.username]);

  // Only scroll to bottom when new messages are added (not when pinning/starring/editing)
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && selectedIds.length === 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, selectedIds.length]);

  // Shared helper to commit a sent message returned from API
  const appendSentMessage = (savedMsg) => {
    setMessages((prev) =>
      prev.some((m) => m._id === savedMsg._id) ? prev : [...prev, savedMsg]
    );
    if (onMessageSent) onMessageSent(savedMsg);
  };

  // Send New Message OR Save Edited Message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (
      !inputText.trim() ||
      (isGroup && isSessionGroup && isExpired) ||
      !activeChat?.data?._id
    ) {
      return;
    }

    const trimmed = inputText.trim();

    // Edit Mode
    if (editingMsg) {
      try {
        const res = await axiosInstance.patch(`/messages/${editingMsg._id}`, {
          content: trimmed,
        });
        if (res.data?.success) {
          const updated = res.data.data;
          setMessages((prev) =>
            prev.map((m) => (m._id === updated._id ? updated : m))
          );
          setEditingMsg(null);
          setInputText("");
          showToast("Message updated");
        }
      } catch (err) {
        showToast(err.response?.data?.message || "Failed to edit message", true);
      }
      return;
    }

    // Normal Send Mode
    const replyTargetId = replyingTo?._id || null;
    setInputText("");
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
      });

      if (res.data?.success) {
        appendSentMessage(res.data.data);
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to send message", true);
    }
  };

  // Typing Input Change with 500ms Debounce
  const handleTypingChange = (e) => {
    const val = e.target.value;
    setInputText(val);

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

  // Upload helper used by both file picker and voice note recorder
  const uploadAndSendMedia = async (file, mediaCaption = "", forcedMediaType = null) => {
    if (!file || !activeChat?.data?._id) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
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
        });

        if (msgRes.data?.success) {
          setReplyingTo(null);
          appendSentMessage(msgRes.data.data);
        }
      }
    } catch (err) {
      console.error("Media upload failed:", err);
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

  // Voice Note Recording
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
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);

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
    } catch (err) {
      console.error("Microphone access error:", err);
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

  // Message Interaction Handlers
  const handleCopyMessage = (msg) => {
    const text = msg.content || msg.fileName || "";
    if (text) {
      navigator.clipboard.writeText(text);
      showToast("Copied to clipboard");
    }
  };

  const handleToggleStar = async (msgId) => {
    try {
      const res = await axiosInstance.post(`/messages/${msgId}/star`);
      if (res.data?.success) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m._id !== msgId) return m;
            const isStarred = (m.starredBy || []).some(
              (id) => id.toString() === currentUserId
            );
            const starredBy = isStarred
              ? m.starredBy.filter((id) => id.toString() !== currentUserId)
              : [...(m.starredBy || []), currentUserId];
            return { ...m, starredBy };
          })
        );
      }
    } catch (err) {
      showToast("Failed to update star status", true);
    }
  };

  const handleTogglePin = async (msgId) => {
    try {
      const res = await axiosInstance.post(`/messages/${msgId}/pin`);
      if (res.data?.success) {
        const updated = res.data.data;
        setMessages((prev) => prev.map((m) => (m._id === msgId ? updated : m)));
        showToast(updated.isPinned ? "Message pinned to top" : "Message unpinned");
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to toggle pin", true);
    }
  };

  const handleForwardMessage = async (targetChat) => {
    if (!messageToForward) return;
    try {
      const targetType = targetChat.groupTag ? "group" : "direct";
      const res = await axiosInstance.post("/messages", {
        chatType: targetType,
        chatId: targetChat._id,
        content: messageToForward.content,
        mediaUrl: messageToForward.mediaUrl,
        mediaType: messageToForward.mediaType,
        fileName: messageToForward.fileName,
        fileSize: messageToForward.fileSize,
      });

      if (res.data?.success) {
        setShowForwardModal(false);
        setMessageToForward(null);
        showToast("Message forwarded");
      }
    } catch (err) {
      showToast("Failed to forward message", true);
    }
  };

  const toggleSelectMessage = (msgId) => {
    setSelectedIds((prev) =>
      prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === messages.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(messages.map((m) => m._id));
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
      });

      if (res.data?.success) {
        if (deleteType === "for_me") {
          setMessages((prev) => prev.filter((m) => !deleteTargets.includes(m._id)));
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              deleteTargets.includes(m._id)
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
        setSelectedIds((prev) => prev.filter((id) => !deleteTargets.includes(id)));
        setDeleteTargets([]);
        setShowDeleteModal(false);
      }
    } catch (err) {
      showToast("Failed to delete messages", true);
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm("Clear all messages in this chat for you?")) return;
    try {
      const res = await axiosInstance.post("/messages/clear-chat", {
        chatType: activeChat.type,
        chatId: activeChat.data._id,
      });
      if (res.data?.success) {
        setMessages([]);
        setShowHeaderMenu(false);
        showToast("Chat history cleared");
      }
    } catch (err) {
      showToast("Failed to clear chat", true);
    }
  };

  // Instant jump to pinned or replied message anywhere in chat
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

  // Right-click menu positioning clamped within screen
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
      <div className="flex-1 h-full bg-slate-950 flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
          <Hash size={32} />
        </div>
        <h2 className="text-lg font-semibold text-slate-200">Select a conversation</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Pick a direct chat or group from the sidebar, or search by{" "}
          <span className="text-indigo-400">@username</span> to start a new chat.
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
      if (!m || m.isDeletedForEveryone) return false;
      const senderId = (m.sender?._id || m.sender?.id || m.sender)?.toString();
      return senderId === currentUserId || isCurrentUserGroupAdmin;
    });

  return (
    <div className="flex-1 h-full bg-slate-950 flex flex-col overflow-hidden relative">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-medium shadow-xl border ${
            toast.isError
              ? "bg-rose-950/95 border-rose-700 text-rose-200"
              : "bg-slate-900/95 border-indigo-700 text-indigo-200"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Selection Mode Header OR Regular Header */}
      {selectedIds.length > 0 ? (
        <div className="px-6 py-3 bg-indigo-950/90 border-b border-indigo-800 flex items-center justify-between z-20 shadow-md">
          <div className="flex items-center space-x-3 text-indigo-200 font-semibold text-xs">
            <button
              onClick={() => setSelectedIds([])}
              className="p-1.5 hover:bg-indigo-900/60 rounded-lg text-slate-300 transition"
              title="Cancel Selection"
            >
              <X size={16} />
            </button>
            <span>{selectedIds.length} Selected</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSelectAll}
              className="px-2.5 py-1.5 bg-indigo-900/60 hover:bg-indigo-800/80 text-xs text-indigo-200 rounded-lg border border-indigo-700/60 transition"
            >
              {selectedIds.length === messages.length ? "Deselect All" : "Select All"}
            </button>
            <button
              onClick={() => openDeleteModal(selectedIds)}
              className="p-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 rounded-lg border border-rose-800/60 transition"
              title="Delete Selected"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-6 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center text-indigo-400 font-bold">
                {isGroup ? (
                  <Hash size={18} />
                ) : (
                  <span className="text-xs uppercase font-mono text-indigo-300">
                    {directRecipient?.username?.slice(0, 2) || "DM"}
                  </span>
                )}
              </div>
              {!isGroup && isDirectOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900"></span>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-semibold text-slate-100 text-sm">
                  {isGroup
                    ? groupData?.name
                    : directRecipient?.fullName || `@${directRecipient?.username}`}
                </h2>
                {!isGroup && (
                  <span className="font-mono text-xs text-indigo-400">
                    @{directRecipient?.username}
                  </span>
                )}
              </div>

              {isGroup ? (
                <p className="text-[11px] text-slate-400 flex items-center space-x-1 mt-0.5">
                  <span>{groupData?.members?.length || 1} members</span>
                  {typingUser && (
                    <>
                      <span className="text-slate-600">•</span>
                      <span className="text-indigo-400 italic font-medium animate-pulse">
                        @{typingUser} is typing...
                      </span>
                    </>
                  )}
                </p>
              ) : (
                <p className="text-[11px] flex items-center space-x-1.5 mt-0.5">
                  {isDirectOnline ? (
                    <span className="text-emerald-400 font-medium">online</span>
                  ) : (
                    <span className="text-slate-500">offline</span>
                  )}
                  {typingUser && (
                    <>
                      <span className="text-slate-600">•</span>
                      <span className="text-indigo-400 italic font-medium animate-pulse">
                        typing...
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 relative">
            {isSessionGroup && (
              <div
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border ${
                  isExpired
                    ? "bg-rose-950/60 border-rose-800 text-rose-300"
                    : "bg-amber-950/50 border-amber-800/80 text-amber-300 animate-pulse"
                }`}
              >
                <Clock size={13} />
                <span>{isExpired ? "Session Ended" : timeLeft}</span>
              </div>
            )}

            {isGroup && onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition"
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
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition"
              title="Chat Options"
            >
              <MoreVertical size={18} />
            </button>

            {showHeaderMenu && (
              <div className="absolute right-0 top-11 z-30 w-44 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 text-xs text-slate-300">
                <button
                  onClick={() => {
                    handleSelectAll();
                    setShowHeaderMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center space-x-2"
                >
                  <CheckSquare size={14} />
                  <span>Select Messages</span>
                </button>
                <button
                  onClick={handleClearChat}
                  className="w-full text-left px-3 py-2 hover:bg-rose-950/50 text-rose-400 flex items-center space-x-2"
                >
                  <Trash2 size={14} />
                  <span>Clear Chat History</span>
                </button>
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
          className="bg-indigo-950/50 hover:bg-indigo-950/75 cursor-pointer border-b border-indigo-900/50 px-6 py-2 flex items-center justify-between text-xs text-indigo-200 transition select-none"
          title="Click to jump instantly to pinned message"
        >
          <div className="flex items-center space-x-2 min-w-0">
            <Pin size={13} className="text-amber-400 rotate-45 shrink-0" />
            <span className="font-semibold shrink-0">
              Pinned{pinnedMessages.length > 1 ? ` (${safeCursor + 1}/${pinnedMessages.length})` : ""}:
            </span>
            <span className="truncate text-slate-300 font-normal">
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
            className="text-[11px] text-indigo-400 hover:text-indigo-200 ml-3 shrink-0 px-2 py-0.5 rounded hover:bg-indigo-900/40"
          >
            Unpin
          </button>
        </div>
      )}

      {/* Message Feed */}
      <div
        onScroll={() => setContextMenu(null)}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-xs">
            <p>No messages yet.</p>
            <p className="text-[11px] mt-1 text-slate-600">Start the conversation below!</p>
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
                  <span className="px-3.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 font-medium shadow-sm">
                    {msg.content}
                  </span>
                </div>
              );
            }

            const resolvedUrl = resolveMediaUrl(msg.mediaUrl);

            return (
              <div
                key={msg._id || index}
                ref={(el) => {
                  if (el && msg._id) messageRefs.current[msg._id] = el;
                  else if (msg._id) delete messageRefs.current[msg._id];
                }}
                onClick={() => {
                  if (selectedIds.length > 0) toggleSelectMessage(msg._id);
                }}
                className={`flex flex-col relative transition-colors duration-300 rounded-xl ${
                  isMe ? "items-end" : "items-start"
                } ${isSelected ? "bg-indigo-950/25 -mx-6 px-6 py-1" : ""} ${
                  isHighlighted ? "bg-amber-500/15 -mx-4 px-4 py-1.5 ring-2 ring-amber-400/70" : ""
                }`}
              >
                {!isMe && (
                  <span className="text-[10px] text-slate-400 mb-0.5 ml-1 font-medium">
                    @{msg.sender?.username || "user"}
                  </span>
                )}

                <div
                  onContextMenu={(e) => handleOpenContextMenu(e, msg)}
                  className={`relative max-w-lg px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm transition cursor-context-menu ${
                    isMe
                      ? "bg-indigo-600 text-white rounded-br-none"
                      : "bg-slate-800/90 text-slate-100 rounded-bl-none border border-slate-700/50"
                  } ${isSelected ? "ring-2 ring-indigo-400" : ""}`}
                >
                  {/* Quoted / Reply Preview Box (click jumps to original message) */}
                  {msg.replyTo && (
                    <div
                      onClick={(e) => {
                        if (selectedIds.length === 0 && msg.replyTo._id) {
                          e.stopPropagation();
                          scrollToMessage(msg.replyTo._id);
                        }
                      }}
                      className="mb-2 p-2 rounded-lg bg-black/25 border-l-2 border-indigo-300 text-[11px] space-y-0.5 cursor-pointer hover:bg-black/35 transition"
                    >
                      <span className="font-semibold text-indigo-200 block">
                        @{msg.replyTo.sender?.username || "user"}
                      </span>
                      <p className="truncate text-slate-200/80 italic">
                        {msg.replyTo.isDeletedForEveryone
                          ? "This message was deleted"
                          : msg.replyTo.content ||
                            msg.replyTo.fileName ||
                            (msg.replyTo.mediaType === "image"
                              ? "📷 Photo"
                              : msg.replyTo.mediaType === "audio"
                              ? "🎤 Voice message"
                              : "Media")}
                      </p>
                    </div>
                  )}

                  {/* Rich Media Renderers */}
                  {resolvedUrl && !msg.isDeletedForEveryone && (
                    <div className="mb-1.5">
                      {msg.mediaType === "image" && (
                        <a href={resolvedUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={resolvedUrl}
                            alt={msg.fileName || "Image"}
                            className="rounded-xl max-h-64 max-w-full object-cover border border-black/20 hover:opacity-95 transition"
                          />
                        </a>
                      )}

                      {msg.mediaType === "video" && (
                        <video
                          src={resolvedUrl}
                          controls
                          className="rounded-xl max-h-64 w-full border border-black/20"
                        />
                      )}

                      {msg.mediaType === "audio" && (
                        <div className="p-1.5 bg-black/20 rounded-xl">
                          <audio
                            src={resolvedUrl}
                            controls
                            className="w-64 max-w-full h-8"
                          />
                        </div>
                      )}

                      {msg.mediaType === "document" && (
                        <a
                          href={resolvedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={msg.fileName}
                          className="flex items-center space-x-2.5 p-2.5 bg-black/25 hover:bg-black/35 rounded-xl transition text-slate-100"
                        >
                          <FileText size={20} className="text-indigo-300 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">
                              {msg.fileName || "Document"}
                            </p>
                            <p className="text-[10px] text-slate-300/80">
                              {msg.fileSize
                                ? `${(msg.fileSize / 1024).toFixed(1)} KB`
                                : "Click to download"}
                            </p>
                          </div>
                          <Download size={14} className="shrink-0 text-slate-300" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Text Content */}
                  {msg.content && (
                    <p
                      className={`whitespace-pre-wrap break-words ${
                        msg.isDeletedForEveryone ? "italic text-slate-300/75" : ""
                      }`}
                    >
                      {msg.content}
                    </p>
                  )}

                  {/* Footer Metadata: Pin Icon, Star Icon, Edited label, Timestamp */}
                  <div className="flex items-center justify-end space-x-1.5 mt-1 text-[10px] opacity-80">
                    {msg.isPinned && !msg.isDeletedForEveryone && (
                      <Pin
                        size={10}
                        className="rotate-45 text-amber-300 shrink-0"
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
                      <span className="italic opacity-80">edited</span>
                    )}
                    <span>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
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
          className="fixed z-50 w-48 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl py-1.5 text-xs text-slate-200 select-none"
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
                className="w-full text-left px-3.5 py-2 hover:bg-slate-800 flex items-center space-x-2.5 transition"
              >
                <CornerUpLeft size={14} className="text-indigo-400" />
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
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-800 flex items-center space-x-2.5 transition"
                >
                  <Edit3 size={14} className="text-amber-400" />
                  <span>Edit</span>
                </button>
              )}

              {(contextMenu.msg.content || contextMenu.msg.fileName) && (
                <button
                  onClick={() => {
                    handleCopyMessage(contextMenu.msg);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-800 flex items-center space-x-2.5 transition"
                >
                  <Copy size={14} className="text-slate-400" />
                  <span>Copy</span>
                </button>
              )}

              <button
                onClick={() => {
                  setMessageToForward(contextMenu.msg);
                  setShowForwardModal(true);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-800 flex items-center space-x-2.5 transition"
              >
                <Forward size={14} className="text-slate-400" />
                <span>Forward</span>
              </button>

              <button
                onClick={() => {
                  handleTogglePin(contextMenu.msg._id);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-800 flex items-center space-x-2.5 transition"
              >
                <Pin size={14} className={contextMenu.msg.isPinned ? "text-amber-400" : "text-slate-400"} />
                <span>{contextMenu.msg.isPinned ? "Unpin" : "Pin to top"}</span>
              </button>

              <button
                onClick={() => {
                  handleToggleStar(contextMenu.msg._id);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-800 flex items-center space-x-2.5 transition"
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
                  toggleSelectMessage(contextMenu.msg._id);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-800 flex items-center space-x-2.5 transition"
              >
                <CheckSquare size={14} className="text-slate-400" />
                <span>Select</span>
              </button>

              <div className="my-1 border-t border-slate-800" />
            </>
          )}

          <button
            onClick={() => {
              const targetId = contextMenu.msg._id;
              setContextMenu(null);
              openDeleteModal([targetId]);
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-rose-950/60 text-rose-400 flex items-center space-x-2.5 transition"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Reply Banner Above Input */}
      {replyingTo && (
        <div className="px-6 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 min-w-0">
            <CornerUpLeft size={14} className="text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-indigo-300 block">
                Replying to @{replyingTo.sender?.username || "user"}
              </span>
              <p className="truncate text-slate-400 text-[11px]">
                {replyingTo.content || replyingTo.fileName || "Media message"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 text-slate-400 hover:text-slate-200"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Editing Banner Above Input */}
      {editingMsg && (
        <div className="px-6 py-2 bg-amber-950/30 border-t border-amber-800/40 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 min-w-0">
            <Edit3 size={14} className="text-amber-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-amber-300 block">Editing message</span>
              <p className="truncate text-slate-400 text-[11px]">{editingMsg.content}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingMsg(null);
              setInputText("");
            }}
            className="p-1 text-slate-400 hover:text-slate-200"
            title="Cancel Edit"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Voice Recording Live Bar */}
      {isRecording && (
        <div className="px-6 py-3 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-rose-400">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="font-mono font-semibold">
              Recording Voice: {Math.floor(recordingSeconds / 60)}:
              {String(recordingSeconds % 60).padStart(2, "0")}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={cancelRecording}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition"
              title="Cancel Recording"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={stopAndSendRecording}
              className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center space-x-1.5 shadow-md transition"
            >
              <Send size={13} />
              <span>Send Voice</span>
            </button>
          </div>
        </div>
      )}

      {/* Session Expired Lock or Composer */}
      {isGroup && isSessionGroup && isExpired ? (
        <div className="p-4 bg-rose-950/40 border-t border-rose-900/50 flex items-center justify-center space-x-2 text-rose-300 text-xs font-medium">
          <AlertCircle size={16} />
          <span>This session group has expired. Messages are locked.</span>
        </div>
      ) : (
        !isRecording && (
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center space-x-2"
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
                  className="p-2.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-xl transition disabled:opacity-50"
                  title="Attach Images, Videos, Audio, or Documents"
                >
                  <Paperclip size={16} className={isUploading ? "animate-spin" : ""} />
                </button>

                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isUploading}
                  className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition disabled:opacity-50"
                  title="Record Voice Note"
                >
                  <Mic size={16} />
                </button>
              </>
            )}

            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                placeholder={
                  isUploading
                    ? "Uploading media..."
                    : editingMsg
                    ? "Edit your message..."
                    : "Type your message..."
                }
                value={inputText}
                disabled={isUploading}
                onChange={handleTypingChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={!inputText.trim() || isUploading}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl shadow-md transition"
              title={editingMsg ? "Save Edit" : "Send Message"}
            >
              {editingMsg ? <Check size={15} /> : <Send size={15} />}
            </button>
          </form>
        )
      )}

      {/* Forward Modal */}
      {showForwardModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-semibold text-slate-100 text-sm flex items-center space-x-2">
                <Forward size={16} className="text-indigo-400" />
                <span>Forward Message</span>
              </h3>
              <button
                onClick={() => {
                  setShowForwardModal(false);
                  setMessageToForward(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-400">Select a contact or group to send to:</p>

            <div className="max-h-60 overflow-y-auto space-y-1">
              {directChats.map((chat) => {
                const other = chat.participants?.find(
                  (p) => (p._id || p)?.toString() !== currentUserId
                );
                return (
                  <button
                    key={chat._id}
                    onClick={() => handleForwardMessage(chat)}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-800 text-xs flex items-center justify-between transition"
                  >
                    <span className="font-medium text-slate-200">
                      {other?.fullName || `@${other?.username}`}
                    </span>
                    <span className="text-[10px] text-indigo-400">Direct Chat</span>
                  </button>
                );
              })}

              {groups.map((group) => (
                <button
                  key={group._id}
                  onClick={() => handleForwardMessage(group)}
                  className="w-full text-left p-2 rounded-xl hover:bg-slate-800 text-xs flex items-center justify-between transition"
                >
                  <span className="font-medium text-slate-200">{group.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {group.groupTag}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="font-semibold text-sm flex items-center space-x-2 text-rose-400">
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
                className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition"
              >
                Delete for Me
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTargets([]);
                }}
                className="w-full py-1.5 text-slate-400 hover:text-slate-200 text-xs transition"
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
