import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import axiosInstance from "../api/axiosInstance";
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
} from "lucide-react";

const ChatDashboard = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [showAdminDrawer, setShowAdminDrawer] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Create Group Form
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    joinMode: "public",
    isSessionGroup: false,
    durationMinutes: 2, // Default 2 minutes for presentation demo
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Join by Tag State
  const [searchTag, setSearchTag] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [joinActionStatus, setJoinActionStatus] = useState("");

  // Fetch groups on mount
  const fetchMyGroups = async () => {
    try {
      const res = await axiosInstance.get("/groups/my-groups");
      if (res.data?.success) {
        setGroups(res.data.data);
      }
    } catch (err) {
      console.error("Error fetching groups:", err);
    }
  };

  useEffect(() => {
    fetchMyGroups();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;

    setCreateLoading(true);
    try {
      const res = await axiosInstance.post("/groups", createForm);
      if (res.data?.success) {
        const newGroup = res.data.data;
        setGroups((prev) => [newGroup, ...prev]);
        setActiveChat({ type: "group", data: newGroup });
        setShowCreateModal(false);
        setCreateForm({
          name: "",
          description: "",
          joinMode: "public",
          isSessionGroup: false,
          durationMinutes: 2,
        });
      }
    } catch (err) {
      console.error("Error creating group:", err);
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
      const res = await axiosInstance.get(`/groups/search?tag=${encodeURIComponent(searchTag.trim())}`);
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
    <div className="h-screen w-screen overflow-hidden flex bg-slate-950 text-slate-100 font-sans">
      {/* Left Sidebar */}
      <Sidebar
        activeChat={activeChat}
        setActiveChat={setActiveChat}
        groups={groups}
        onOpenCreateGroup={() => setShowCreateModal(true)}
        onOpenJoinGroup={() => {
          setSearchTag("");
          setSearchResult(null);
          setSearchError("");
          setJoinActionStatus("");
          setShowJoinModal(true);
        }}
      />

      {/* Main Center Chat Pane */}
      <ChatBox
        activeChat={activeChat}
        onOpenAdmin={
          activeChat?.type === "group" ? () => setShowAdminDrawer((prev) => !prev) : null
        }
      />

      {/* Right Group Admin Drawer */}
      {showAdminDrawer && activeChat?.type === "group" && (
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
        />
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-semibold text-slate-100 flex items-center space-x-2">
                <PlusCircle size={18} className="text-indigo-400" />
                <span>Create New Group</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Group focus, topics, or announcements..."
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, description: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Join Mode Selector */}
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
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
                            ? "bg-indigo-950/60 border-indigo-500 text-indigo-300"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <Icon size={16} />
                        <span className="text-[11px] font-medium">{mode.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lifecycle: Permanent vs Session */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-slate-200 block">
                      Session-Based Group
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Auto-expires when the countdown timer hits zero
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
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800"
                  />
                </div>

                {createForm.isSessionGroup && (
                  <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <label className="text-[11px] font-medium text-indigo-300 block mb-2 flex items-center space-x-1">
                      <Clock size={13} />
                      <span>Countdown Presets:</span>
                    </label>
                    <div className="flex space-x-2">
                      {[
                        { label: "2 Mins (Demo)", value: 2 },
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
                          className={`flex-1 py-1 px-2 text-[11px] rounded-lg border font-mono transition ${
                            createForm.durationMinutes === preset.value
                              ? "bg-indigo-600 border-indigo-500 text-white font-semibold"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg transition disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-semibold text-slate-100 flex items-center space-x-2">
                <Hash size={18} className="text-indigo-400" />
                <span>Join Group by Unique ID</span>
              </h3>
              <button
                onClick={() => setShowJoinModal(false)}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSearchGroup} className="mt-4 space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Enter #VRT-XXXX (e.g. #VRT-8K2P)"
                  value={searchTag}
                  onChange={(e) => setSearchTag(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-20 py-2.5 text-xs font-mono uppercase text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="absolute right-1.5 top-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition"
                >
                  {searchLoading ? "..." : "Search"}
                </button>
              </div>
            </form>

            {searchError && (
              <div className="mt-3 p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-xl">
                {searchError}
              </div>
            )}

            {searchResult && (
              <div className="mt-4 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-200 text-sm">
                    {searchResult.group?.name}
                  </h4>
                  <span className="font-mono text-xs text-indigo-400 font-bold">
                    {searchResult.group?.groupTag}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {searchResult.group?.description || "No description provided."}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                  <span>{searchResult.group?.members?.length || 1} members</span>
                  <span className="capitalize">
                    Mode: {searchResult.group?.joinMode}
                  </span>
                </div>

                {joinActionStatus ? (
                  <div className="p-2.5 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs text-center rounded-lg flex items-center justify-center space-x-1.5">
                    <Check size={14} />
                    <span>{joinActionStatus}</span>
                  </div>
                ) : searchResult.isMember ? (
                  <div className="text-center text-xs text-slate-400 py-1 font-medium">
                    You are already a member of this group.
                  </div>
                ) : searchResult.hasPendingRequest ? (
                  <div className="text-center text-xs text-amber-400 py-1 font-medium">
                    Request Pending: Waiting for admin approval.
                  </div>
                ) : searchResult.group?.joinMode === "closed" ? (
                  <div className="text-center text-xs text-rose-400 py-1 font-medium">
                    This group is currently closed to new members.
                  </div>
                ) : (
                  <button
                    onClick={handleJoinGroup}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow transition"
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
