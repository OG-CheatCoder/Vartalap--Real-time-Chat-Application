import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import {
  Send,
  Pin,
  Clock,
  Shield,
  AlertCircle,
  Hash,
  Smile,
} from "lucide-react";

const ChatBox = ({ activeChat, onOpenAdmin }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const messagesEndRef = useRef(null);

  const isGroup = activeChat?.type === "group";
  const groupData = isGroup ? activeChat.data : null;
  const isSessionGroup = groupData?.isSessionGroup;

  // Countdown timer logic for session groups
  useEffect(() => {
    if (!isSessionGroup || !groupData?.expiresAt) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const expiry = new Date(groupData.expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft("00:00:00");
        setIsExpired(true);
        return;
      }

      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      const formatted = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0"
      )}:${String(seconds).padStart(2, "0")}`;
      setTimeLeft(formatted);
      setIsExpired(false);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isSessionGroup, groupData?.expiresAt]);

  // Socket room join & listeners
  useEffect(() => {
    if (!socket || !activeChat) return;

    const roomType = activeChat.type;
    const roomId = activeChat.data?._id;

    socket.emit("room:join", { roomType, roomId });

    const handleNewMessage = (newMsg) => {
      setMessages((prev) => [...prev, newMsg]);
    };

    const handleTyping = (data) => {
      if (data.roomId === roomId) {
        if (data.isTyping) {
          setTypingUser(data.username);
        } else {
          setTypingUser(null);
        }
      }
    };

    const handleGroupExpired = (data) => {
      if (data.groupId === roomId) {
        setIsExpired(true);
      }
    };

    socket.on("message:new", handleNewMessage);
    socket.on("typing:update", handleTyping);
    socket.on("group:expired", handleGroupExpired);

    return () => {
      socket.emit("room:leave", { roomType, roomId });
      socket.off("message:new", handleNewMessage);
      socket.off("typing:update", handleTyping);
      socket.off("group:expired", handleGroupExpired);
    };
  }, [socket, activeChat]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || isExpired) return;

    const messagePayload = {
      _id: Date.now().toString(),
      chatType: activeChat.type,
      chatId: activeChat.data?._id,
      sender: user,
      content: inputText.trim(),
      createdAt: new Date().toISOString(),
    };

    // Broadcast over socket and append locally
    if (socket) {
      socket.emit("message:send", {
        roomType: activeChat.type,
        roomId: activeChat.data?._id,
        message: messagePayload,
      });
      socket.emit("typing:stop", {
        roomType: activeChat.type,
        roomId: activeChat.data?._id,
        username: user?.username,
      });
    }

    setMessages((prev) => [...prev, messagePayload]);
    setInputText("");
    setIsTyping(false);
  };

  const handleTypingChange = (e) => {
    setInputText(e.target.value);

    if (!socket || !activeChat) return;

    if (!isTyping && e.target.value.length > 0) {
      setIsTyping(true);
      socket.emit("typing:start", {
        roomType: activeChat.type,
        roomId: activeChat.data?._id,
        username: user?.username,
      });
    } else if (isTyping && e.target.value.length === 0) {
      setIsTyping(false);
      socket.emit("typing:stop", {
        roomType: activeChat.type,
        roomId: activeChat.data?._id,
        username: user?.username,
      });
    }
  };

  if (!activeChat) {
    return (
      <div className="flex-1 h-full bg-slate-950 flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
          <Hash size={32} />
        </div>
        <h2 className="text-lg font-semibold text-slate-200">Select a conversation</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Pick a group or 1:1 direct chat from the sidebar, or search by unique Group ID (#VRT-XXXX).
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full bg-slate-950 flex flex-col overflow-hidden">
      {/* Chat Header */}
      <div className="px-6 py-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center text-indigo-400 font-bold">
            {isGroup ? <Hash size={18} /> : "@"}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-semibold text-slate-100 text-sm">
                {isGroup ? groupData.name : `@${activeChat.data?.username}`}
              </h2>
              {isGroup && (
                <span className="font-mono text-xs px-2 py-0.5 bg-slate-800 text-indigo-300 rounded border border-slate-700/60 font-semibold">
                  {groupData.groupTag}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {isGroup
                ? `${groupData.members?.length || 1} members • Mode: ${groupData.joinMode || "public"}`
                : "Zero-Contact Private Chat"}
            </p>
          </div>
        </div>

        {/* Right Header Actions: Countdown & Admin Drawer */}
        <div className="flex items-center space-x-3">
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
              title="Group Settings & Admin"
            >
              <Shield size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Pinned Messages Banner */}
      {groupData?.pinnedMessages?.length > 0 && (
        <div className="bg-indigo-950/40 border-b border-indigo-900/40 px-6 py-2 flex items-center justify-between text-xs text-indigo-200">
          <div className="flex items-center space-x-2">
            <Pin size={13} className="text-indigo-400" />
            <span className="font-medium">Pinned Announcement:</span>
            <span className="truncate max-w-md text-slate-300">
              Important group notice pinned by admin.
            </span>
          </div>
        </div>
      )}

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-xs">
            <p>No messages yet.</p>
            <p className="text-[11px] mt-1 text-slate-600">Start the conversation below!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe =
              msg.sender?._id === user?._id ||
              msg.sender?.id === user?.id ||
              msg.sender === user?._id;

            if (msg.isSystemMessage) {
              return (
                <div key={msg._id || index} className="text-center my-2">
                  <span className="px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
                    {msg.content}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={msg._id || index}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                {!isMe && (
                  <span className="text-[10px] text-slate-400 mb-0.5 ml-1 font-medium">
                    @{msg.sender?.username || "user"}
                  </span>
                )}
                <div
                  className={`max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                    isMe
                      ? "bg-indigo-600 text-white rounded-br-none"
                      : "bg-slate-800/90 text-slate-100 rounded-bl-none border border-slate-700/50"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {typingUser && (
        <div className="px-6 py-1 text-[11px] text-slate-400 italic">
          @{typingUser} is typing...
        </div>
      )}

      {/* Input or Expired Banner */}
      {isExpired ? (
        <div className="p-4 bg-rose-950/40 border-t border-rose-900/50 flex items-center justify-center space-x-2 text-rose-300 text-xs font-medium">
          <AlertCircle size={16} />
          <span>This session group has expired. Messages are locked.</span>
        </div>
      ) : (
        <form
          onSubmit={handleSendMessage}
          className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center space-x-2"
        >
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Type your message..."
              value={inputText}
              onChange={handleTypingChange}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl shadow-md transition"
          >
            <Send size={15} />
          </button>
        </form>
      )}
    </div>
  );
};

export default ChatBox;
