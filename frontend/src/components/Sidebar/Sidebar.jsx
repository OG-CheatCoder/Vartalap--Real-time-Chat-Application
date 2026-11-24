import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import axiosInstance from "../../api/axiosInstance";
import {
  MessageSquare,
  Users,
  Search,
  PlusCircle,
  Hash,
  LogOut,
  Radio,
  Clock,
  UserCheck,
  X,
  User,
} from "lucide-react";

const Sidebar = ({
  activeChat,
  setActiveChat,
  groups = [],
  directChats = [],
  onSelectUser,
  onOpenCreateGroup,
  onOpenJoinGroup,
}) => {
  const { user, logout } = useAuth();
  const { onlineUsers = [] } = useSocket();
  const [filter, setFilter] = useState("all"); // 'all' | 'direct' | 'groups'
  const [searchQuery, setSearchQuery] = useState("");
  const [searchedUsers, setSearchedUsers] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced search for users
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchedUsers([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axiosInstance.get(
          `/users/search?q=${encodeURIComponent(q)}`
        );
        if (res.data?.success) {
          setSearchedUsers(res.data.data);
        }
      } catch (err) {
        console.error("Error searching users:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter groups in memory by search query
  const filteredGroups = groups.filter((g) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      g.groupTag.toLowerCase().includes(q)
    );
  });

  const handleUserClick = (targetUser) => {
    if (onSelectUser) {
      onSelectUser(targetUser);
    }
    setSearchQuery("");
    setSearchedUsers([]);
  };

  const isUserOnline = (userId) => {
    return onlineUsers.some((id) => id.toString() === userId?.toString());
  };

  const formatLastMessagePreview = (lastMsg, fallback) => {
    if (!lastMsg) return fallback;
    if (lastMsg.isDeletedForEveryone) return "🚫 This message was deleted";
    if (lastMsg.content) return lastMsg.content;
    if (lastMsg.mediaType === "image") return "📷 Photo";
    if (lastMsg.mediaType === "video") return "🎥 Video";
    if (lastMsg.mediaType === "audio") return "🎤 Voice message";
    if (lastMsg.fileName) return `📄 ${lastMsg.fileName}`;
    return fallback;
  };

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <aside className="w-80 h-full bg-slate-900 border-r border-slate-800 flex flex-col select-none">
      {/* Header Profile & Branding */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            V
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-slate-100 text-sm tracking-wide truncate">
              {user?.fullName || "Vartalap"}
            </h1>
            <p className="text-xs text-indigo-400 font-mono truncate">
              @{user?.username || "user"}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* Action Buttons: Join Tag / New Group */}
      <div className="p-3 grid grid-cols-2 gap-2 border-b border-slate-800/60">
        <button
          onClick={onOpenJoinGroup}
          className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-slate-800/90 hover:bg-slate-700/80 text-xs font-medium text-slate-200 rounded-lg border border-slate-700/60 transition"
        >
          <Hash size={14} className="text-indigo-400" />
          <span>Join by ID</span>
        </button>
        <button
          onClick={onOpenCreateGroup}
          className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white rounded-lg shadow-sm transition"
        >
          <PlusCircle size={14} />
          <span>New Group</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search @username or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchedUsers([]);
              }}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* When Search is Active */}
      {isSearchActive ? (
        <div className="flex-1 overflow-y-auto px-2 space-y-3 py-1">
          {/* Searched Users */}
          <div>
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-400 flex items-center justify-between">
              <span>Users ({searchedUsers.length})</span>
              {isSearching && (
                <span className="text-[10px] text-slate-500 animate-pulse">Searching...</span>
              )}
            </div>

            {searchedUsers.length === 0 && !isSearching ? (
              <p className="px-2 py-2 text-xs text-slate-500">
                No users found for "{searchQuery}"
              </p>
            ) : (
              searchedUsers.map((u) => {
                const online = isUserOnline(u._id);
                return (
                  <button
                    key={u._id}
                    onClick={() => handleUserClick(u)}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-800/70 transition flex items-center space-x-3 group"
                  >
                    <div className="relative">
                      <div className="w-9 h-9 rounded-lg bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-indigo-300 font-bold text-xs uppercase">
                        {u.username?.slice(0, 2) || "U"}
                      </div>
                      {online && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900"></span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200 truncate">
                          {u.fullName}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 group-hover:bg-indigo-600 group-hover:text-white transition">
                          Chat
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-indigo-400 truncate">
                        @{u.username}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Searched Groups */}
          {filteredGroups.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Groups ({filteredGroups.length})</span>
              </div>
              {filteredGroups.map((group) => (
                <button
                  key={group._id}
                  onClick={() => {
                    setActiveChat({ type: "group", data: group });
                    setSearchQuery("");
                  }}
                  className={`w-full text-left p-2 rounded-xl transition flex items-center space-x-3 ${
                    activeChat?.data?._id === group._id
                      ? "bg-indigo-950/40 border border-indigo-800/50"
                      : "hover:bg-slate-800/60"
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-200 font-semibold border border-slate-700/50">
                    <Users size={16} className="text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {group.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {group.groupTag}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Regular Conversations View */
        <>
          {/* Filter Tabs */}
          <div className="px-3 pb-2 flex space-x-1">
            {["all", "direct", "groups"].map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`flex-1 py-1 text-xs rounded-md capitalize font-medium transition ${
                  filter === tab
                    ? "bg-slate-800 text-indigo-400 border border-slate-700/50"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto px-2 space-y-1 py-1">
            {groups.length === 0 && directChats.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageSquare size={32} className="mx-auto text-slate-600 mb-2" />
                <p className="text-xs font-medium text-slate-400">No conversations yet</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Type a <span className="text-indigo-400">@username</span> above to start a conversation!
                </p>
              </div>
            ) : (
              (() => {
                const combinedList = [
                  ...directChats.map((c) => ({ ...c, _itemType: "direct" })),
                  ...groups.map((g) => ({ ...g, _itemType: "group" })),
                ].sort((a, b) => {
                  const timeA = new Date(
                    a.lastMessage?.createdAt || a.updatedAt || a.createdAt || 0
                  ).getTime();
                  const timeB = new Date(
                    b.lastMessage?.createdAt || b.updatedAt || b.createdAt || 0
                  ).getTime();
                  return timeB - timeA;
                });

                const listToRender =
                  filter === "direct"
                    ? directChats.map((c) => ({ ...c, _itemType: "direct" }))
                    : filter === "groups"
                    ? groups.map((g) => ({ ...g, _itemType: "group" }))
                    : combinedList;

                return listToRender.map((item) => {
                  if (item._itemType === "direct") {
                    const otherUser = item.participants?.find(
                      (p) => p._id?.toString() !== user?._id?.toString()
                    );
                    const online = isUserOnline(otherUser?._id);
                    const isSelected =
                      activeChat?.type === "direct" &&
                      activeChat?.data?._id?.toString() === item._id?.toString();

                    return (
                      <button
                        key={item._id}
                        onClick={() =>
                          setActiveChat({
                            type: "direct",
                            data: item,
                            recipient: otherUser,
                          })
                        }
                        className={`w-full text-left p-2.5 rounded-xl transition flex items-center space-x-3 ${
                          isSelected
                            ? "bg-indigo-950/40 border border-indigo-800/50"
                            : "hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-lg bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-300 font-bold text-xs uppercase">
                            {otherUser?.username?.slice(0, 2) || "DM"}
                          </div>
                          {online && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900"></span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {otherUser?.fullName || "User"}
                            </span>
                            <span className="text-[10px] font-mono text-indigo-400 truncate">
                              @{otherUser?.username}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {formatLastMessagePreview(item.lastMessage, "Click to start chatting")}
                          </p>
                        </div>
                      </button>
                    );
                  }

                  // Group item
                  const isSelected =
                    activeChat?.type === "group" &&
                    activeChat?.data?._id?.toString() === item._id?.toString();

                  return (
                    <button
                      key={item._id}
                      onClick={() =>
                        setActiveChat({ type: "group", data: item })
                      }
                      className={`w-full text-left p-2.5 rounded-xl transition flex items-center space-x-3 ${
                        isSelected
                          ? "bg-indigo-950/40 border border-indigo-800/50"
                          : "hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-200 font-semibold border border-slate-700/50 shrink-0">
                        <Users size={18} className="text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-200 truncate">
                            {item.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {item.groupTag}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 mt-0.5">
                          {item.isSessionGroup && (
                            <span className="inline-flex items-center text-[10px] text-amber-400 font-medium">
                              <Clock size={10} className="mr-0.5" /> Session
                            </span>
                          )}
                          <p className="text-[11px] text-slate-400 truncate">
                            {formatLastMessagePreview(item.lastMessage, "Click to open chat")}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                });
              })()
            )}
          </div>
        </>
      )}

      {/* Online Status Bar */}
      <div className="p-3 bg-slate-950/70 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Online & Ready</span>
        </span>
        <Radio size={14} className="text-emerald-500" />
      </div>
    </aside>
  );
};

export default Sidebar;
