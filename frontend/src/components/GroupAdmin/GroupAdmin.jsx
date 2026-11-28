import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import axiosInstance from "../../api/axiosInstance";
import {
  X,
  Copy,
  Check,
  ShieldCheck,
  UserCheck,
  UserX,
  UserMinus,
  Lock,
  Globe,
  UserPlus,
  Edit2,
  Save,
  LogOut,
  Trash2,
  Shield,
  ShieldOff,
  ShieldAlert,
  Crown,
} from "lucide-react";

const MODES = [
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
];

const GroupAdmin = ({
  group,
  onClose,
  onUpdateGroup,
  onLeaveGroup,
  onDeleteGroup,
}) => {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [selectedMode, setSelectedMode] = useState(group?.joinMode || "public");
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [processingUser, setProcessingUser] = useState(null);
  const [actionError, setActionError] = useState("");

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedNewAdmin, setSelectedNewAdmin] = useState("");
  const [leaveError, setLeaveError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    setSelectedMode(group?.joinMode || "public");
    setActionError("");
  }, [group?._id, group?.joinMode]);

  const currentUserId = (user?._id || user?.id)?.toString();
  const rawAdminList = (group?.admins || []).map((a) => (a?._id || a)?.toString()).filter(Boolean);
  const adminList =
    rawAdminList.length > 0
      ? rawAdminList
      : [(group?.admin?._id || group?.admin)?.toString()].filter(Boolean);

  const primaryAdminId = adminList[0] || (group?.admin?._id || group?.admin)?.toString();
  const isGroupAdmin = adminList.includes(currentUserId);
  const isPrimaryAdmin = primaryAdminId === currentUserId;

  const otherMembers = (group?.members || []).filter(
    (m) => (m?._id || m)?.toString() !== currentUserId
  );
  const otherAdmins = adminList.filter((aId) => aId !== currentUserId);
  const isSoleAdmin = isGroupAdmin && otherAdmins.length === 0 && otherMembers.length > 0;

  const handleCopyTag = () => {
    if (group?.groupTag) {
      navigator.clipboard.writeText(group.groupTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveMode = async () => {
    setIsSavingMode(true);
    setActionError("");
    try {
      const res = await axiosInstance.patch(`/groups/${group._id}/settings`, {
        joinMode: selectedMode,
      });
      if (res.data?.success) {
        if (onUpdateGroup) onUpdateGroup(res.data.data);
        setIsEditingMode(false);
      }
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to update admission controls.");
    } finally {
      setIsSavingMode(false);
    }
  };

  const handleRequestAction = async (targetUserId, action) => {
    if (!targetUserId) return;
    setProcessingUser(targetUserId);
    setActionError("");
    try {
      const res = await axiosInstance.post(
        `/groups/${group._id}/requests/${targetUserId}`,
        { action }
      );
      if (res.data?.success && onUpdateGroup) {
        onUpdateGroup(res.data.data);
      }
    } catch (err) {
      setActionError(err.response?.data?.message || `Error ${action}ing join request.`);
    } finally {
      setProcessingUser(null);
    }
  };

  const handleToggleAdminRole = async (targetUserId, isCurrentlyAdmin) => {
    const action = isCurrentlyAdmin ? "demote" : "promote";
    setProcessingUser(targetUserId);
    setActionError("");
    try {
      const res = await axiosInstance.post(
        `/groups/${group._id}/admins/${targetUserId}`,
        { action }
      );
      if (res.data?.success && onUpdateGroup) {
        onUpdateGroup(res.data.data);
      }
    } catch (err) {
      setActionError(err.response?.data?.message || `Failed to ${action} user.`);
    } finally {
      setProcessingUser(null);
    }
  };

  const handleRemoveMember = async (targetUserId, username) => {
    if (!window.confirm(`Remove @${username} from ${group.name}?`)) return;
    setProcessingUser(targetUserId);
    setActionError("");
    try {
      const res = await axiosInstance.delete(`/groups/${group._id}/members/${targetUserId}`);
      if (res.data?.success && onUpdateGroup) {
        onUpdateGroup(res.data.data);
      }
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to remove member.");
    } finally {
      setProcessingUser(null);
    }
  };

  const handleConfirmLeave = async () => {
    setLeaveError("");
    if (isSoleAdmin && !selectedNewAdmin) {
      setLeaveError("Please select a member to transfer admin rights to before leaving.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await axiosInstance.post(`/groups/${group._id}/leave`, {
        newAdminId: selectedNewAdmin || undefined,
      });
      if (res.data?.success) {
        setShowLeaveModal(false);
        if (onLeaveGroup) onLeaveGroup(group._id);
        else if (onClose) onClose();
      }
    } catch (err) {
      setLeaveError(err.response?.data?.message || "Failed to leave group.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setActionLoading(true);
    try {
      const res = await axiosInstance.delete(`/groups/${group._id}`);
      if (res.data?.success) {
        setShowDeleteModal(false);
        if (onDeleteGroup) onDeleteGroup(group._id);
        else if (onClose) onClose();
      }
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to delete group.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!group) return null;

  const currentModeInfo = MODES.find((m) => m.id === (group.joinMode || "public")) || MODES[0];
  const CurrentModeIcon = currentModeInfo.icon;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-80 lg:static lg:inset-auto lg:w-80 shrink-0 h-full bg-white dark:bg-[#0b0d10] border-l border-slate-200 dark:border-zinc-800/80 flex flex-col select-none overflow-y-auto shadow-2xl lg:shadow-none text-slate-900 dark:text-zinc-100">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldCheck size={18} className="text-blue-600 dark:text-emerald-400" />
          <h3 className="font-semibold text-sm">Group Details</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {actionError && (
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 rounded-xl text-[11px] text-rose-700 dark:text-rose-300 flex items-start justify-between gap-2">
            <span>{actionError}</span>
            <button onClick={() => setActionError("")} className="text-rose-500 hover:text-rose-700">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Group Tag & Copy */}
        <div className="p-3 bg-slate-50 dark:bg-[#11151b] border border-slate-200 dark:border-zinc-800 rounded-xl space-y-2">
          <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 block uppercase tracking-wider">
            Unique Group ID (Shareable)
          </label>
          <div className="flex items-center justify-between">
            <span className="font-mono text-base font-bold text-blue-600 dark:text-emerald-400 tracking-wider">
              {group.groupTag}
            </span>
            <button
              onClick={handleCopyTag}
              className="flex items-center space-x-1.5 py-1 px-2.5 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-xs rounded-lg transition"
            >
              {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              <span>{copied ? "Copied" : "Copy ID"}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-500">
            Share this tag to let others search and join this group.
          </p>
        </div>

        {/* Group Info */}
        <div>
          <h4 className="text-xs font-semibold mb-1">{group.name}</h4>
          <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
            {group.description || "No description provided."}
          </p>
        </div>

        {/* Admission Controls */}
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-300 uppercase tracking-wider">
              Admission Controls
            </label>
            {isGroupAdmin && !isEditingMode && (
              <button
                onClick={() => {
                  setSelectedMode(group.joinMode || "public");
                  setIsEditingMode(true);
                }}
                className="flex items-center space-x-1 text-[11px] text-blue-600 dark:text-emerald-400 hover:underline font-medium"
              >
                <Edit2 size={12} />
                <span>Edit</span>
              </button>
            )}
          </div>

          {!isEditingMode ? (
            <div className="p-3 bg-slate-50 dark:bg-[#11151b] border border-slate-200 dark:border-zinc-800 rounded-xl flex items-start space-x-2.5">
              <CurrentModeIcon size={16} className="mt-0.5 text-blue-600 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-medium">{currentModeInfo.title}</div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5">{currentModeInfo.desc}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {MODES.map((mode) => {
                const Icon = mode.icon;
                const isSelected = selectedMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedMode(mode.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition flex items-start space-x-2.5 ${
                      isSelected
                        ? "bg-blue-50 dark:bg-[#1f3b2c]/40 border-blue-500 dark:border-emerald-600 text-blue-800 dark:text-emerald-200"
                        : "bg-slate-50 dark:bg-[#11151b] border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400"
                    }`}
                  >
                    <Icon size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-emerald-400" />
                    <div>
                      <div className="text-xs font-medium text-slate-900 dark:text-zinc-200">{mode.title}</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-500">{mode.desc}</div>
                    </div>
                  </button>
                );
              })}

              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={handleSaveMode}
                  disabled={isSavingMode}
                  className="flex-1 py-1.5 px-3 bg-blue-600 dark:bg-emerald-700 hover:bg-blue-500 dark:hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center justify-center space-x-1.5 transition"
                >
                  <Save size={13} />
                  <span>{isSavingMode ? "Saving..." : "Save Mode"}</span>
                </button>
                <button
                  onClick={() => setIsEditingMode(false)}
                  disabled={isSavingMode}
                  className="py-1.5 px-3 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pending Requests Queue */}
        {isGroupAdmin && group.pendingRequests?.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-300 uppercase tracking-wider block">
              Pending Requests ({group.pendingRequests.length})
            </label>
            <div className="space-y-2">
              {group.pendingRequests.map((req) => {
                const targetUser = req.user;
                const targetUserId = targetUser?._id || targetUser;
                const username = targetUser?.username || "unknown";
                const fullName = targetUser?.fullName || username;
                const isProcessing = processingUser === targetUserId?.toString();

                return (
                  <div
                    key={req._id || targetUserId}
                    className="p-2.5 bg-slate-50 dark:bg-[#11151b] border border-slate-200 dark:border-zinc-800 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2 min-w-0 mr-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-zinc-800 text-blue-700 dark:text-emerald-300 flex items-center justify-center font-bold text-[11px] uppercase shrink-0">
                        {username.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{fullName}</p>
                        <p className="text-[11px] font-mono text-blue-600 dark:text-emerald-400 truncate">@{username}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleRequestAction(targetUserId, "approve")}
                        disabled={isProcessing}
                        className="p-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 rounded-lg transition disabled:opacity-50"
                        title="Approve & Add to Group"
                      >
                        <UserCheck size={14} />
                      </button>
                      <button
                        onClick={() => handleRequestAction(targetUserId, "reject")}
                        disabled={isProcessing}
                        className="p-1.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/80 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 rounded-lg transition disabled:opacity-50"
                        title="Reject Request"
                      >
                        <UserX size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Members List (Circular Avatars) */}
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
          <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-300 uppercase tracking-wider block">
            Members ({group.members?.length || 1})
          </label>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {group.members?.map((member) => {
              const memId = (member?._id || member?.id || member)?.toString();
              const memUsername = member?.username || "member";
              const memFullName = member?.fullName || memUsername;
              const isMemAdmin = adminList.includes(memId);
              const isMemPrimaryAdmin = memId === primaryAdminId;
              const isSelf = memId === currentUserId;
              const isProcessing = processingUser === memId;

              const canPromote = isGroupAdmin && !isSelf && !isMemAdmin;
              const canDemoteOther = isPrimaryAdmin && !isSelf && isMemAdmin;
              const canVoluntaryStepDown = isSelf && isMemAdmin && adminList.length > 1;
              const canRemove =
                isGroupAdmin &&
                !isSelf &&
                !isMemPrimaryAdmin &&
                (!isMemAdmin || isPrimaryAdmin);

              return (
                <div
                  key={memId}
                  className="py-2 px-2.5 flex items-center justify-between rounded-xl bg-slate-50 dark:bg-[#11151b] border border-slate-200 dark:border-zinc-800/80 text-xs"
                >
                  <div className="flex items-center space-x-2.5 min-w-0 mr-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-zinc-800 text-blue-700 dark:text-emerald-300 flex items-center justify-center font-bold text-[11px] uppercase shrink-0">
                      {memUsername.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-medium truncate">{memFullName}</span>
                        {isSelf && (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">(You)</span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-blue-600 dark:text-emerald-400 block truncate">
                        @{memUsername}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    {isMemPrimaryAdmin ? (
                      <span
                        className="inline-flex items-center space-x-1 text-[10px] bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-700/60 font-medium"
                        title="Primary Admin"
                      >
                        <Crown size={10} />
                        <span>Primary</span>
                      </span>
                    ) : isMemAdmin ? (
                      <span className="text-[10px] bg-blue-50 dark:bg-emerald-950 text-blue-700 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-blue-200 dark:border-emerald-800/60 font-medium">
                        Admin
                      </span>
                    ) : null}

                    {canVoluntaryStepDown && (
                      <button
                        onClick={() => handleToggleAdminRole(memId, true)}
                        disabled={isProcessing}
                        className="p-1.5 rounded-lg border bg-white dark:bg-zinc-800 hover:bg-amber-50 dark:hover:bg-amber-950/60 text-slate-600 dark:text-zinc-300 hover:text-amber-600 border-slate-200 dark:border-zinc-700 transition disabled:opacity-50"
                        title="Step down as Admin"
                      >
                        <ShieldOff size={13} />
                      </button>
                    )}

                    {canPromote && (
                      <button
                        onClick={() => handleToggleAdminRole(memId, false)}
                        disabled={isProcessing}
                        className="p-1.5 rounded-lg border bg-blue-50 dark:bg-emerald-950/40 hover:bg-blue-100 dark:hover:bg-emerald-900/60 text-blue-600 dark:text-emerald-400 border-blue-200 dark:border-emerald-800/60 transition disabled:opacity-50"
                        title="Make Admin"
                      >
                        <Shield size={13} />
                      </button>
                    )}

                    {canDemoteOther && (
                      <button
                        onClick={() => handleToggleAdminRole(memId, true)}
                        disabled={isProcessing}
                        className="p-1.5 rounded-lg border bg-white dark:bg-zinc-800 hover:bg-amber-50 dark:hover:bg-amber-950/60 text-slate-600 dark:text-zinc-400 hover:text-amber-600 border-slate-200 dark:border-zinc-700 transition disabled:opacity-50"
                        title="Dismiss Admin"
                      >
                        <ShieldOff size={13} />
                      </button>
                    )}

                    {canRemove && (
                      <button
                        onClick={() => handleRemoveMember(memId, memUsername)}
                        disabled={isProcessing}
                        className="p-1.5 rounded-lg border bg-white dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-slate-500 dark:text-zinc-400 hover:text-rose-600 border-slate-200 dark:border-zinc-700 transition disabled:opacity-50"
                        title="Remove from Group"
                      >
                        <UserMinus size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Exit & Delete Group */}
        <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => {
              setLeaveError("");
              setSelectedNewAdmin(otherMembers[0]?._id || otherMembers[0] || "");
              setShowLeaveModal(true);
            }}
            className="w-full py-2 px-3 bg-slate-50 dark:bg-[#11151b] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 rounded-xl text-xs font-medium flex items-center justify-center space-x-2 transition"
          >
            <LogOut size={14} />
            <span>Exit Group</span>
          </button>

          {isGroupAdmin && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full py-2 px-3 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 rounded-xl text-xs font-medium flex items-center justify-center space-x-2 transition"
            >
              <Trash2 size={14} />
              <span>Delete Group</span>
            </button>
          )}
        </div>
      </div>

      {/* Leave Group Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#111418] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2.5 text-rose-500">
              <ShieldAlert size={20} />
              <h3 className="font-semibold text-slate-900 dark:text-zinc-100 text-sm">Leave Group</h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
              Are you sure you want to leave <span className="font-semibold">{group.name}</span>?
            </p>

            {isSoleAdmin && (
              <div className="space-y-1.5 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl">
                <label className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 block">
                  Assign New Admin Before Leaving
                </label>
                <select
                  value={selectedNewAdmin}
                  onChange={(e) => setSelectedNewAdmin(e.target.value)}
                  className="w-full bg-white dark:bg-[#0b0d10] border border-slate-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                >
                  {otherMembers.map((m) => {
                    const mId = (m?._id || m)?.toString();
                    const name = m?.fullName || m?.username || mId;
                    return (
                      <option key={mId} value={mId}>
                        {name} (@{m?.username || "user"})
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-amber-600 dark:text-amber-400/80">
                  As the sole admin, you must designate a successor.
                </p>
              </div>
            )}

            {leaveError && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{leaveError}</p>
            )}

            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={handleConfirmLeave}
                disabled={actionLoading}
                className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition"
              >
                {actionLoading ? "Leaving..." : "Confirm & Leave"}
              </button>
              <button
                onClick={() => setShowLeaveModal(false)}
                disabled={actionLoading}
                className="py-2 px-4 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Group Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#111418] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2.5 text-rose-500">
              <Trash2 size={20} />
              <h3 className="font-semibold text-slate-900 dark:text-zinc-100 text-sm">Delete Group Permanently</h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
              This will permanently delete <span className="font-semibold">{group.name}</span> and erase all its messages for all members. This action cannot be undone.
            </p>

            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={handleConfirmDelete}
                disabled={actionLoading}
                className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition"
              >
                {actionLoading ? "Deleting..." : "Delete Permanently"}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={actionLoading}
                className="py-2 px-4 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs rounded-xl transition"
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

export default GroupAdmin;
