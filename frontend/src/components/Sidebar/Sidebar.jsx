import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import axiosInstance from "../../api/axiosInstance";
import SettingsModal from "../SettingsModal";
import {
  MessageSquare,
  Users,
  Search,
  PlusCircle,
  Hash,
  Clock,
  X,
  Settings,
  Ban,
  Trash2,
  ShieldCheck,
} from "lucide-react";

const Sidebar = ({
  activeChat,
  setActiveChat,
  groups = [],
  directChats = [],
  drafts = {},
  unreadCounts = {},
  onSelectUser,
  onToggleBlockUser,
  onDeleteDirectChat,
  onOpenCreateGroup,
  onOpenJoinGroup,
  onBackupRestored,
}) => {
  const { user } = useAuth();
  const { onlineUsers = [] } = useSocket();
  const [filter, setFilter] = useState("all"); // 'all' | 'direct' | 'groups'
  const [searchQuery, setSearchQuery] = useState("");
  const [searchedUsers, setSearchedUsers] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userContextMenu, setUserContextMenu] = useState(null);

  const trimmedQuery = searchQuery.trim();
  const isSearchActive = trimmedQuery.length > 0;
  const hasMinSearchChars = trimmedQuery.length >= 3;
  const blockedIds = new Set((user?.blockedUsers || []).map((id) => id.toString()));

  // Close right-click sidebar menu on outside click or Escape
  useEffect(() => {
    const closeMenu = () => setUserContextMenu(null);
    const onKey = (e) => {
      if (e.key === "Escape") setUserContextMenu(null);
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Debounced user search — strictly requires at least 3 characters
  useEffect(() => {
    if (trimmedQuery.length < 3) {
      setSearchedUsers([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axiosInstance.get(
          `/users/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal }
        );
        if (res.data?.success) {
          setSearchedUsers(res.data.data);
        }
      } catch (err) {
        if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
          console.error("Error searching users:", err);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  const filteredGroups = hasMinSearchChars
    ? groups.filter((g) => {
        const q = trimmedQuery.toLowerCase();
        return (
          g.name.toLowerCase().includes(q) ||
          g.groupTag.toLowerCase().includes(q)
        );
      })
    : [];

  const handleUserClick = (targetUser) => {
    if (onSelectUser) onSelectUser(targetUser);
    setSearchQuery("");
    setSearchedUsers([]);
  };

  const isUserOnline = (userId) =>
    onlineUsers.some((id) => id.toString() === userId?.toString());

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

  const handleOpenUserMenu = (e, chatItem, otherUser) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 130);
    setUserContextMenu({ chat: chatItem, otherUser, x: Math.max(8, x), y: Math.max(8, y) });
  };

  return (
    <aside
      className={`w-full md:w-80 lg:w-[340px] shrink-0 h-full bg-white dark:bg-[#0b0d10] border-r border-slate-200 dark:border-zinc-800/80 flex-col select-none text-slate-900 dark:text-zinc-100 ${
        activeChat ? "hidden md:flex" : "flex"
      }`}
    >
      {/* Header Profile (Circular Name Card + Logged-in Username) */}
      <div className="p-4 border-b border-slate-100 dark:border-zinc-800/80 flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-sky-500 dark:from-emerald-700 dark:to-teal-600 flex items-center justify-center font-bold text-white shadow-sm shrink-0">
          {user?.username?.slice(0, 1).toUpperCase() || "V"}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-sm tracking-wide truncate">
            {user?.fullName || "Vartalap"}
          </h1>
          <p className="text-xs text-blue-600 dark:text-emerald-400 font-mono truncate">
            @{user?.username || "user"}
          </p>
        </div>
      </div>

      {/* Action Buttons: Join ID / New Group */}
      <div className="p-3 grid grid-cols-2 gap-2 border-b border-slate-100 dark:border-zinc-800/70">
        <button
          onClick={onOpenJoinGroup}
          className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-slate-100 dark:bg-[#171a1f] hover:bg-slate-200 dark:hover:bg-[#22262e] text-xs font-medium text-slate-700 dark:text-zinc-200 rounded-full border border-slate-200 dark:border-zinc-800 transition"
        >
          <Hash size={14} className="text-blue-600 dark:text-emerald-400" />
          <span>Join by ID</span>
        </button>
        <button
          onClick={onOpenCreateGroup}
          className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-blue-600 dark:bg-emerald-700 hover:bg-blue-500 dark:hover:bg-emerald-600 text-xs font-medium text-white rounded-full shadow-sm transition"
        >
          <PlusCircle size={14} />
          <span>New Group</span>
        </button>
      </div>

      {/* Search Input (WhatsApp-style pill) */}
      <div className="p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-2.5 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Search name or @username (min 3 chars)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#f0f2f5] dark:bg-[#181b20] border border-transparent dark:border-zinc-800/90 rounded-full pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-500 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-600 transition"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchedUsers([]);
              }}
              className="absolute right-3 top-2 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Search Active OR Conversations List */}
      {isSearchActive ? (
        <div className="flex-1 overflow-y-auto px-2 space-y-3 py-1">
          {!hasMinSearchChars ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500 dark:text-zinc-500">
              Type at least <span className="text-blue-600 dark:text-emerald-400 font-semibold">3 characters</span> to search users by name or @username.
            </div>
          ) : (
            <>
              <div>
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-emerald-400 flex items-center justify-between">
                  <span>Users ({searchedUsers.length})</span>
                  {isSearching && (
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 animate-pulse">
                      Searching...
                    </span>
                  )}
                </div>

                {searchedUsers.length === 0 && !isSearching ? (
                  <p className="px-2 py-2 text-xs text-slate-500 dark:text-zinc-500">
                    No users found for "{trimmedQuery}"
                  </p>
                ) : (
                  searchedUsers.map((u) => {
                    const online = isUserOnline(u._id);
                    const isBlocked = blockedIds.has(u._id.toString());
                    return (
                      <div
                        key={u._id}
                        className="w-full text-left p-2 rounded-xl hover:bg-[#f5f6f6] dark:hover:bg-[#1f242b] transition flex items-center space-x-3 group"
                      >
                        <button
                          onClick={() => handleUserClick(u)}
                          className="flex-1 min-w-0 flex items-center space-x-3 text-left"
                        >
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-zinc-800 border border-blue-200 dark:border-zinc-700 flex items-center justify-center text-blue-700 dark:text-emerald-300 font-bold text-xs uppercase">
                              {u.username?.slice(0, 2) || "U"}
                            </div>
                            {online && !isBlocked && (
                              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0b0d10]"></span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold truncate block">
                              {u.fullName}
                            </span>
                            <p className="text-[11px] font-mono text-blue-600 dark:text-emerald-400 truncate">
                              @{u.username}
                            </p>
                          </div>
                        </button>

                        {isBlocked ? (
                          <button
                            onClick={() => onToggleBlockUser && onToggleBlockUser(u._id, true)}
                            className="text-[10px] px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/70 text-rose-600 dark:text-rose-300 hover:text-emerald-700 dark:hover:text-emerald-300 border border-rose-200 dark:border-rose-800/60 transition shrink-0"
                            title="Click to Unblock"
                          >
                            Unblock
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUserClick(u)}
                            className="text-[10px] px-2.5 py-1 rounded-full bg-blue-50 dark:bg-emerald-950/60 text-blue-700 dark:text-emerald-300 border border-blue-200 dark:border-emerald-800/60 group-hover:bg-blue-600 dark:group-hover:bg-emerald-700 group-hover:text-white transition shrink-0"
                          >
                            Chat
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {filteredGroups.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
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
                          ? "bg-[#eaf2ff] dark:bg-[#242a33]"
                          : "hover:bg-[#f5f6f6] dark:hover:bg-[#1f242b]"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center border border-slate-200 dark:border-zinc-700/70 shrink-0">
                        <Users size={16} className="text-blue-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold truncate">
                            {group.name}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="px-3 pb-2 flex space-x-1.5">
            {["all", "direct", "groups"].map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`flex-1 py-1 text-xs rounded-full capitalize font-medium transition ${
                  filter === tab
                    ? "bg-blue-50 dark:bg-[#1f3b2c]/60 text-blue-700 dark:text-emerald-300 border border-blue-200 dark:border-emerald-700/60"
                    : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#1f242b]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div
            onScroll={() => setUserContextMenu(null)}
            className="flex-1 overflow-y-auto px-2 space-y-1 py-1"
          >
            {groups.length === 0 && directChats.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageSquare size={32} className="mx-auto text-slate-300 dark:text-zinc-700 mb-2" />
                <p className="text-xs font-medium text-slate-600 dark:text-zinc-400">
                  No conversations yet
                </p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                  Search a <span className="text-blue-600 dark:text-emerald-400">name or @username</span> above to start chatting!
                </p>
              </div>
            ) : (
              (() => {
                const getSortTime = (item) =>
                  Math.max(
                    new Date(item.lastMessage?.createdAt || 0).getTime() || 0,
                    new Date(item.updatedAt || 0).getTime() || 0,
                    new Date(item.createdAt || 0).getTime() || 0
                  );

                const listToRender = (
                  filter === "direct"
                    ? directChats.map((c) => ({ ...c, _itemType: "direct" }))
                    : filter === "groups"
                    ? groups.map((g) => ({ ...g, _itemType: "group" }))
                    : [
                        ...directChats.map((c) => ({ ...c, _itemType: "direct" })),
                        ...groups.map((g) => ({ ...g, _itemType: "group" })),
                      ]
                ).sort((a, b) => getSortTime(b) - getSortTime(a));

                const renderPreviewRow = (item, fallbackText, isBlocked = false) => {
                  const key = `${item._itemType}:${item._id}`;
                  const unread = Number(unreadCounts[key]) || 0;
                  const draftText = drafts[key]?.trim();

                  if (isBlocked) {
                    return (
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">
                        Blocked contact
                      </p>
                    );
                  }

                  if (draftText) {
                    return (
                      <p className="text-[11px] truncate mt-0.5 text-slate-700 dark:text-zinc-300">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Draft: </span>
                        <span>{draftText}</span>
                      </p>
                    );
                  }

                  if (unread > 4) {
                    return (
                      <p className="text-[11px] font-semibold text-blue-600 dark:text-emerald-400 truncate mt-0.5">
                        4+ messages
                      </p>
                    );
                  }

                  if (unread >= 2) {
                    return (
                      <p className="text-[11px] font-semibold text-blue-600 dark:text-emerald-400 truncate mt-0.5">
                        {unread} new messages
                      </p>
                    );
                  }

                  return (
                    <p
                      className={`text-[11px] truncate mt-0.5 ${
                        unread === 1
                          ? "font-semibold text-slate-900 dark:text-zinc-100"
                          : "text-slate-500 dark:text-zinc-400"
                      }`}
                    >
                      {formatLastMessagePreview(item.lastMessage, fallbackText)}
                    </p>
                  );
                };

                const renderUnreadBadge = (item, isBlocked = false) => {
                  if (isBlocked) return null;
                  const unread = Number(unreadCounts[`${item._itemType}:${item._id}`]) || 0;
                  if (unread <= 0) return null;
                  return (
                    <span className="ml-2 px-1.5 py-0.5 min-w-[18px] text-center rounded-full bg-blue-600 dark:bg-emerald-600 text-white text-[10px] font-bold leading-none shrink-0">
                      {unread > 4 ? "4+" : unread}
                    </span>
                  );
                };

                return listToRender.map((item) => {
                  if (item._itemType === "direct") {
                    const otherUser = item.participants?.find(
                      (p) => (p?._id || p)?.toString() !== (user?._id || user?.id)?.toString()
                    );
                    const online = isUserOnline(otherUser?._id);
                    const isBlocked = blockedIds.has(otherUser?._id?.toString());
                    const isSelected =
                      activeChat?.type === "direct" &&
                      activeChat?.data?._id?.toString() === item._id?.toString();

                    return (
                      <button
                        key={item._id}
                        onContextMenu={(e) => handleOpenUserMenu(e, item, otherUser)}
                        onClick={() =>
                          setActiveChat({
                            type: "direct",
                            data: item,
                            recipient: otherUser,
                          })
                        }
                        className={`w-full text-left p-2.5 rounded-xl transition flex items-center space-x-3 cursor-pointer ${
                          isSelected
                            ? "bg-[#edf3ff] dark:bg-[#242a33] border border-blue-200/80 dark:border-zinc-700/70"
                            : "hover:bg-[#f5f6f6] dark:hover:bg-[#1f242b]"
                        }`}
                      >
                        <div className="relative shrink-0">
                          <div className="w-11 h-11 rounded-full bg-blue-100 dark:bg-zinc-800 border border-blue-200/70 dark:border-zinc-700/70 flex items-center justify-center text-blue-700 dark:text-emerald-300 font-bold text-xs uppercase">
                            {otherUser?.username?.slice(0, 2) || "DM"}
                          </div>
                          {online && !isBlocked && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0b0d10]"></span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold truncate flex items-center space-x-1">
                              <span>{otherUser?.fullName || "User"}</span>
                              {isBlocked && (
                                <Ban size={11} className="text-rose-500 shrink-0" title="Blocked" />
                              )}
                            </span>
                            {renderUnreadBadge(item, isBlocked)}
                          </div>
                          {renderPreviewRow(item, "Click to start chatting", isBlocked)}
                        </div>
                      </button>
                    );
                  }

                  const isSelected =
                    activeChat?.type === "group" &&
                    activeChat?.data?._id?.toString() === item._id?.toString();

                  return (
                    <button
                      key={item._id}
                      onClick={() => setActiveChat({ type: "group", data: item })}
                      className={`w-full text-left p-2.5 rounded-xl transition flex items-center space-x-3 ${
                        isSelected
                          ? "bg-[#edf3ff] dark:bg-[#242a33] border border-blue-200/80 dark:border-zinc-700/70"
                          : "hover:bg-[#f5f6f6] dark:hover:bg-[#1f242b]"
                      }`}
                    >
                      <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center border border-slate-200 dark:border-zinc-700/70 shrink-0">
                        <Users size={18} className="text-blue-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold truncate">{item.name}</span>
                          {renderUnreadBadge(item)}
                        </div>
                        <div className="flex items-center space-x-2">
                          {item.isSessionGroup && (
                            <span className="inline-flex items-center text-[10px] text-amber-600 dark:text-amber-400 font-medium shrink-0 mt-0.5">
                              <Clock size={10} className="mr-0.5" /> Session
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            {renderPreviewRow(item, "Click to open chat")}
                          </div>
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

      {/* Right-Click Sidebar User Menu */}
      {userContextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ left: userContextMenu.x, top: userContextMenu.y }}
          className="fixed z-50 w-48 bg-white dark:bg-[#14181e] border border-slate-200 dark:border-zinc-700 rounded-xl shadow-2xl py-1.5 text-xs text-slate-700 dark:text-zinc-200 select-none"
        >
          {(() => {
            const peerId = userContextMenu.otherUser?._id?.toString();
            const isBlocked = blockedIds.has(peerId);
            return (
              <>
                <button
                  onClick={() => {
                    onToggleBlockUser && onToggleBlockUser(peerId, isBlocked);
                    setUserContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-2.5 transition"
                >
                  {isBlocked ? (
                    <ShieldCheck size={14} className="text-emerald-500" />
                  ) : (
                    <Ban size={14} className="text-amber-500" />
                  )}
                  <span>
                    {isBlocked ? "Unblock" : "Block"} {userContextMenu.otherUser?.fullName || "User"}
                  </span>
                </button>
                <div className="my-1 border-t border-slate-100 dark:border-zinc-800" />
                <button
                  onClick={() => {
                    const cId = userContextMenu.chat._id;
                    const displayName = userContextMenu.otherUser?.fullName || "this user";
                    setUserContextMenu(null);
                    if (
                      window.confirm(
                        `Delete entire chat with ${displayName} and remove from sidebar?`
                      )
                    ) {
                      onDeleteDirectChat && onDeleteDirectChat(cId);
                    }
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center space-x-2.5 transition"
                >
                  <Trash2 size={14} />
                  <span>Delete Chat</span>
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* Bottom Settings Button Bar */}
      <div className="p-2.5 bg-slate-50/90 dark:bg-[#080a0c] border-t border-slate-200 dark:border-zinc-800/80">
        <button
          onClick={() => setShowSettingsModal(true)}
          className="w-full py-2 px-3 rounded-xl hover:bg-slate-200/70 dark:hover:bg-[#1a1e24] text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-between text-xs font-medium transition"
          title="Open Account & Theme Settings"
        >
          <span className="flex items-center space-x-2">
            <Settings size={16} className="text-blue-600 dark:text-emerald-400" />
            <span>Settings</span>
          </span>
        </button>
      </div>

      {/* Account Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          onBackupRestored={onBackupRestored}
          onToggleBlockUser={onToggleBlockUser}
        />
      )}
    </aside>
  );
};

export default Sidebar;
