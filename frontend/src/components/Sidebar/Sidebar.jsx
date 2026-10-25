import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  MessageSquare,
  Users,
  Search,
  PlusCircle,
  Hash,
  LogOut,
  Radio,
  Clock,
} from "lucide-react";

const Sidebar = ({
  activeChat,
  setActiveChat,
  groups = [],
  directChats = [],
  onOpenCreateGroup,
  onOpenJoinGroup,
}) => {
  const { user, logout } = useAuth();
  const [filter, setFilter] = useState("all"); // 'all' | 'direct' | 'groups'
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <aside className="w-80 h-full bg-slate-900 border-r border-slate-800 flex flex-col select-none">
      {/* Header Profile & Branding */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            V
          </div>
          <div>
            <h1 className="font-semibold text-slate-100 text-sm tracking-wide">Vartalap</h1>
            <p className="text-xs text-slate-400">@{user?.username || "user"}</p>
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
            placeholder="Search @user or #group..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

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
              Search a <span className="text-indigo-400">@username</span> or join a group with <span className="text-indigo-400">#VRT-ID</span>
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <button
              key={group._id}
              onClick={() => setActiveChat({ type: "group", data: group })}
              className={`w-full text-left p-2.5 rounded-xl transition flex items-center space-x-3 ${
                activeChat?.data?._id === group._id
                  ? "bg-indigo-950/40 border border-indigo-800/50"
                  : "hover:bg-slate-800/60"
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-200 font-semibold border border-slate-700/50">
                <Users size={18} className="text-indigo-400" />
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
                <div className="flex items-center space-x-2 mt-0.5">
                  {group.isSessionGroup && (
                    <span className="inline-flex items-center text-[10px] text-amber-400 font-medium">
                      <Clock size={10} className="mr-0.5" /> Session
                    </span>
                  )}
                  <p className="text-[11px] text-slate-400 truncate">
                    {group.lastMessage?.content || "Click to open chat"}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

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
