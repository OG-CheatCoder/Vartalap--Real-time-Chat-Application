import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import axiosInstance from "../../api/axiosInstance";
import { useUsernameAvailability } from "../../utils/validation";
import {
  clearAllLocalDataForUser,
  exportLocalBackup,
  importLocalBackup,
} from "../../utils/localMessageStore";
import {
  X,
  AtSign,
  LogOut,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  Settings,
  Save,
  Download,
  Upload,
  HardDrive,
  Ban,
  Timer,
  Sun,
  Moon,
} from "lucide-react";

const DISAPPEAR_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "24 Hours", value: 86400 },
  { label: "7 Days", value: 604800 },
  { label: "30 Days", value: 2592000 },
];

const SettingsModal = ({ onClose, onBackupRestored, onToggleBlockUser }) => {
  const { user, logout, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const userId = (user?._id || user?.id)?.toString();

  const [newUsername, setNewUsername] = useState(user?.username || "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameFeedback, setUsernameFeedback] = useState(null);

  const [defaultDisappear, setDefaultDisappear] = useState(
    user?.defaultDisappearingDuration || 0
  );
  const [blockedList, setBlockedList] = useState([]);

  const [backupFeedback, setBackupFeedback] = useState(null);
  const restoreInputRef = useRef(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const availability = useUsernameAvailability(newUsername, user?.username || "");

  useEffect(() => {
    const loadBlocked = async () => {
      try {
        const res = await axiosInstance.get("/users/blocked");
        if (res.data?.success) setBlockedList(res.data.data || []);
      } catch {
        // Ignore silent fetch errors
      }
    };
    loadBlocked();
  }, [user?.blockedUsers?.length]);

  const handleSaveUsername = async (e) => {
    e.preventDefault();
    if (availability.status !== "available") return;

    setSavingUsername(true);
    setUsernameFeedback(null);
    try {
      const res = await axiosInstance.patch("/auth/username", {
        username: availability.normalized,
      });
      if (res.data?.success && res.data?.data?.user) {
        updateUser(res.data.data.user);
        setUsernameFeedback({
          isError: false,
          text: `Username updated to @${res.data.data.user.username}`,
        });
      }
    } catch (err) {
      setUsernameFeedback({
        isError: true,
        text: err.response?.data?.message || "Failed to update username.",
      });
    } finally {
      setSavingUsername(false);
    }
  };

  const handleUpdateDefaultDisappear = async (duration) => {
    setDefaultDisappear(duration);
    try {
      const res = await axiosInstance.patch("/auth/disappearing-default", { duration });
      if (res.data?.success && res.data?.data?.user) {
        updateUser(res.data.data.user);
      }
    } catch (err) {
      console.error("Error updating default disappearing timer:", err);
    }
  };

  const handleUnblockFromSettings = async (targetId) => {
    if (onToggleBlockUser) {
      await onToggleBlockUser(targetId, true);
      setBlockedList((prev) => prev.filter((u) => u._id.toString() !== targetId.toString()));
    }
  };

  const handleExportBackup = async () => {
    try {
      const payload = await exportLocalBackup(userId);
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vartalap-backup-${user?.username || "chats"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupFeedback({
        isError: false,
        text: `Exported ${payload.messages.length} local messages.`,
      });
    } catch {
      setBackupFeedback({ isError: true, text: "Failed to export backup." });
    }
  };

  const handleImportBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const count = await importLocalBackup(userId, parsed);
      if (onBackupRestored) await onBackupRestored();
      setBackupFeedback({
        isError: false,
        text: `Restored ${count} messages to device storage.`,
      });
    } catch {
      setBackupFeedback({ isError: true, text: "Invalid backup file format." });
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (!deletePassword) {
      setDeleteError("Please enter your password to confirm deletion.");
      return;
    }

    setDeletingAccount(true);
    setDeleteError("");
    try {
      const res = await axiosInstance.delete("/auth/account", {
        data: { password: deletePassword },
      });
      if (res.data?.success) {
        await clearAllLocalDataForUser(userId).catch(() => {});
        onClose();
        logout();
      }
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Failed to delete account.");
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-white dark:bg-[#111418] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-5 text-slate-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center space-x-2">
            <Settings size={18} className="text-blue-600 dark:text-emerald-400" />
            <h3 className="text-base font-semibold">Account Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Profile Summary (Circular Avatar) */}
        <div className="p-3 bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl flex items-center space-x-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 to-sky-500 dark:from-emerald-700 dark:to-teal-600 flex items-center justify-center font-bold text-white text-sm uppercase shrink-0 shadow-sm">
            {user?.username?.slice(0, 2) || "U"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{user?.fullName}</p>
            <p className="text-[11px] font-mono text-blue-600 dark:text-emerald-400 truncate">
              @{user?.username}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-500 truncate">{user?.email}</p>
          </div>
        </div>

        {/* Theme Appearance Toggle (Light / Dark Mode) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold block">Appearance</label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex items-center justify-center space-x-2 transition ${
                theme === "light"
                  ? "bg-blue-50 border-blue-500 text-blue-700 shadow-sm"
                  : "bg-slate-50 dark:bg-[#0b0d10] border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700"
              }`}
            >
              <Sun size={15} className={theme === "light" ? "text-amber-500" : ""} />
              <span>Light Mode</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex items-center justify-center space-x-2 transition ${
                theme === "dark"
                  ? "bg-[#1f3b2c]/50 border-emerald-600 text-emerald-300 shadow-sm"
                  : "bg-slate-50 dark:bg-[#0b0d10] border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700"
              }`}
            >
              <Moon size={15} className={theme === "dark" ? "text-emerald-400" : ""} />
              <span>Dark Mode</span>
            </button>
          </div>
        </div>

        {/* Change Unique Username */}
        <form onSubmit={handleSaveUsername} className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-zinc-800">
          <label className="text-xs font-semibold block">Change Unique Username</label>
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <AtSign size={14} className="absolute left-3 top-2.5 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                value={newUsername}
                onChange={(e) => {
                  setUsernameFeedback(null);
                  setNewUsername(e.target.value.replace(/\s+/g, ""));
                }}
                placeholder="new_username"
                className={`w-full bg-slate-50 dark:bg-[#0b0d10] border rounded-xl pl-8 pr-8 py-2 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none transition ${
                  availability.status === "available"
                    ? "border-emerald-500/70 focus:border-emerald-500"
                    : availability.status === "taken" || availability.status === "invalid"
                    ? "border-rose-500/70 focus:border-rose-500"
                    : "border-slate-200 dark:border-zinc-800 focus:border-blue-500"
                }`}
              />
              <div className="absolute right-2.5 top-2.5">
                {availability.status === "checking" && (
                  <Loader2 size={14} className="text-blue-500 animate-spin" />
                )}
                {availability.status === "available" && (
                  <CheckCircle size={14} className="text-emerald-500" />
                )}
                {(availability.status === "taken" || availability.status === "invalid") && (
                  <XCircle size={14} className="text-rose-500" />
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingUsername || availability.status !== "available"}
              className="py-2 px-3.5 bg-blue-600 dark:bg-emerald-700 hover:bg-blue-500 dark:hover:bg-emerald-600 disabled:opacity-45 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition shrink-0"
            >
              <Save size={13} />
              <span>{savingUsername ? "Saving..." : "Save"}</span>
            </button>
          </div>

          {availability.message && (
            <p
              className={`text-[11px] ${
                availability.status === "available"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : availability.status === "unchanged" || availability.status === "checking"
                  ? "text-slate-500 dark:text-zinc-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {availability.message}
            </p>
          )}

          {usernameFeedback && (
            <p
              className={`text-[11px] font-medium ${
                usernameFeedback.isError
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {usernameFeedback.text}
            </p>
          )}
        </form>

        {/* Default Disappearing Timer for New Chats */}
        <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-2">
          <div className="flex items-center space-x-1.5 text-xs font-semibold">
            <Timer size={14} className="text-blue-600 dark:text-emerald-400" />
            <span>Default Disappearing Timer (New Chats)</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DISAPPEAR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleUpdateDefaultDisappear(opt.value)}
                className={`py-1.5 px-2 rounded-xl border text-[11px] font-medium transition ${
                  defaultDisappear === opt.value
                    ? "bg-blue-600 dark:bg-emerald-700 border-blue-600 dark:border-emerald-600 text-white"
                    : "bg-slate-50 dark:bg-[#0b0d10] border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Blocked Users Management */}
        <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center space-x-1.5">
              <Ban size={14} className="text-rose-500" />
              <span>Blocked Users ({blockedList.length})</span>
            </span>
          </div>
          {blockedList.length === 0 ? (
            <p className="text-[11px] text-slate-500 dark:text-zinc-500">No blocked users.</p>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {blockedList.map((b) => (
                <div
                  key={b._id}
                  className="p-2 bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold text-[11px] uppercase shrink-0">
                      {b.username?.slice(0, 2) || "U"}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium block truncate">{b.fullName}</span>
                      <span className="text-[11px] font-mono text-blue-600 dark:text-emerald-400">
                        @{b.username}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnblockFromSettings(b._id)}
                    className="px-2.5 py-1 bg-white dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-slate-200 dark:border-zinc-700 hover:border-emerald-500 rounded-lg text-[11px] transition shrink-0"
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Local Device Storage & Cloud Backup */}
        <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex items-center space-x-1.5 text-xs font-semibold">
            <HardDrive size={14} className="text-blue-600 dark:text-emerald-400" />
            <span>Device Storage & Backup</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
            Your chat history is stored locally on this device (IndexedDB) and deleted from servers once delivered.
          </p>

          <input
            ref={restoreInputRef}
            type="file"
            accept=".json"
            onChange={handleImportBackup}
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleExportBackup}
              className="py-2 px-3 bg-slate-100 dark:bg-zinc-800/90 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 rounded-xl text-xs font-medium flex items-center justify-center space-x-1.5 border border-slate-200 dark:border-zinc-700/60 transition"
            >
              <Download size={13} className="text-blue-600 dark:text-emerald-400" />
              <span>Export Backup</span>
            </button>
            <button
              type="button"
              onClick={() => restoreInputRef.current?.click()}
              className="py-2 px-3 bg-slate-100 dark:bg-zinc-800/90 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 rounded-xl text-xs font-medium flex items-center justify-center space-x-1.5 border border-slate-200 dark:border-zinc-700/60 transition"
            >
              <Upload size={13} className="text-emerald-600 dark:text-emerald-400" />
              <span>Restore Backup</span>
            </button>
          </div>

          {backupFeedback && (
            <p
              className={`text-[11px] font-medium ${
                backupFeedback.isError
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {backupFeedback.text}
            </p>
          )}
        </div>

        {/* Session Actions: Logout & Delete Account */}
        <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
            }}
            className="w-full py-2.5 px-4 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition"
          >
            <LogOut size={15} />
            <span>Log Out</span>
          </button>

          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => {
                setDeleteError("");
                setDeletePassword("");
                setShowDeleteConfirm(true);
              }}
              className="w-full py-2.5 px-4 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition"
            >
              <Trash2 size={15} />
              <span>Delete Account</span>
            </button>
          ) : (
            <form
              onSubmit={handleDeleteAccount}
              className="p-3.5 bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-800/60 rounded-xl space-y-2.5"
            >
              <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                <AlertTriangle size={15} />
                <span>Permanently Delete Your Account?</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-zinc-300 leading-relaxed">
                This will erase your profile, direct chats, local device chats, and free your username forever. Enter your password to confirm:
              </p>
              <input
                type="password"
                placeholder="Enter your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full bg-white dark:bg-[#0b0d10] border border-rose-300 dark:border-rose-800/60 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-rose-500"
              />
              {deleteError && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{deleteError}</p>
              )}
              <div className="flex items-center space-x-2">
                <button
                  type="submit"
                  disabled={deletingAccount}
                  className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition"
                >
                  {deletingAccount ? "Deleting..." : "Confirm Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deletingAccount}
                  className="py-2 px-3 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs rounded-xl transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
