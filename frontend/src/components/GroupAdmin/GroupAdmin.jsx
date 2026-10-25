import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  X,
  Copy,
  Check,
  ShieldCheck,
  UserCheck,
  UserX,
  Lock,
  Globe,
  UserPlus,
} from "lucide-react";

const GroupAdmin = ({ group, onClose, onUpdateGroup }) => {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [selectedMode, setSelectedMode] = useState(group?.joinMode || "public");

  const isAdmin =
    group?.admin?._id === user?._id ||
    group?.admin?.id === user?.id ||
    group?.admin === user?._id;

  const handleCopyTag = () => {
    if (group?.groupTag) {
      navigator.clipboard.writeText(group.groupTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleModeChange = (mode) => {
    setSelectedMode(mode);
    if (onUpdateGroup) {
      onUpdateGroup({ joinMode: mode });
    }
  };

  if (!group) return null;

  return (
    <div className="w-80 h-full bg-slate-900 border-l border-slate-800 flex flex-col select-none overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldCheck size={18} className="text-indigo-400" />
          <h3 className="font-semibold text-slate-100 text-sm">Group Details</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Group Tag & Copy */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
          <label className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">
            Unique Group ID
          </label>
          <div className="flex items-center justify-between">
            <span className="font-mono text-base font-bold text-indigo-400 tracking-wider">
              {group.groupTag}
            </span>
            <button
              onClick={handleCopyTag}
              className="flex items-center space-x-1 py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Share this tag to let others find and join this group directly.
          </p>
        </div>

        {/* Group Info */}
        <div>
          <h4 className="text-xs font-semibold text-slate-200 mb-1">{group.name}</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            {group.description || "No description provided."}
          </p>
        </div>

        {/* Join Mode Control (Admin Only) */}
        {isAdmin && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="text-[11px] font-semibold text-slate-300 block uppercase tracking-wider">
              Admission Controls
            </label>
            <div className="space-y-2">
              {[
                {
                  id: "public",
                  title: "Anyone Can Join",
                  desc: "Instant entry via tag search",
                  icon: Globe,
                },
                {
                  id: "invite_only",
                  title: "Invite Only",
                  desc: "Requires admin approval",
                  icon: UserPlus,
                },
                {
                  id: "closed",
                  title: "Closed",
                  desc: "No new members can join",
                  icon: Lock,
                },
              ].map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    onClick={() => handleModeChange(mode.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition flex items-start space-x-2.5 ${
                      selectedMode === mode.id
                        ? "bg-indigo-950/40 border-indigo-600 text-indigo-200"
                        : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <Icon size={16} className="mt-0.5 shrink-0 text-indigo-400" />
                    <div>
                      <div className="text-xs font-medium text-slate-200">
                        {mode.title}
                      </div>
                      <div className="text-[11px] text-slate-500">{mode.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Pending Requests Queue (Admin Only) */}
        {isAdmin && group.pendingRequests?.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Pending Requests ({group.pendingRequests.length})
              </label>
            </div>
            <div className="space-y-1.5">
              {group.pendingRequests.map((req) => (
                <div
                  key={req._id || req.user?._id}
                  className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between"
                >
                  <span className="text-xs text-slate-300 font-medium truncate">
                    @{req.user?.username || "user"}
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      className="p-1.5 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/60 rounded-lg transition"
                      title="Approve"
                    >
                      <UserCheck size={14} />
                    </button>
                    <button
                      className="p-1.5 bg-rose-950/50 hover:bg-rose-900/60 text-rose-400 border border-rose-800/60 rounded-lg transition"
                      title="Reject"
                    >
                      <UserX size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members List */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
            Members ({group.members?.length || 1})
          </label>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {group.members?.map((member) => (
              <div
                key={member._id || member}
                className="py-1.5 px-2 flex items-center justify-between rounded-lg hover:bg-slate-800/40 text-xs text-slate-300"
              >
                <span>@{member.username || "member"}</span>
                {member._id === group.admin?._id && (
                  <span className="text-[10px] bg-indigo-950 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-800/60">
                    Admin
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupAdmin;
