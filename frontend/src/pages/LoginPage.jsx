import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import axiosInstance from "../api/axiosInstance";
import { Lock, AtSign, ArrowRight, ShieldCheck, Sun, Moon } from "lucide-react";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!formData.identifier || !formData.password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await axiosInstance.post("/auth/login", formData);
      if (res.data?.success) {
        login(res.data.data.user, res.data.data.token);
        navigate("/dashboard");
      }
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.data?.email) {
        navigate("/verify-otp", { state: { email: err.response.data.data.email } });
      } else {
        setError(err.response?.data?.message || "Invalid credentials. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-[#0b0d10] flex items-center justify-center p-4 relative">
      <button
        type="button"
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-2 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 shadow-sm hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
        title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="w-full max-w-md bg-white dark:bg-[#11151b] border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl">
        {/* Logo / Header */}
        <div className="text-center mb-7">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 mx-auto flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-blue-500/25 mb-3">
            V
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
            Welcome to Vartalap
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Privacy-first real-time messaging with zero-contact discovery
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1.5">
              Username or Email
            </label>
            <div className="relative">
              <AtSign size={16} className="absolute left-3.5 top-3 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                placeholder="aditya_p or user@domain.com"
                value={formData.identifier}
                onChange={(e) =>
                  setFormData({ ...formData, identifier: e.target.value })
                }
                className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-3 text-slate-400 dark:text-zinc-500" />
              <input
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/25 transition flex items-center justify-center space-x-2 disabled:opacity-60"
          >
            <span>{loading ? "Authenticating..." : "Sign In"}</span>
            <ArrowRight size={14} />
          </button>
        </form>

        {/* Footer Link */}
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-zinc-800/80 text-center">
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Don't have an account?{" "}
            <Link
              to="/register"
              className="text-blue-600 dark:text-indigo-400 hover:underline font-medium transition"
            >
              Register with Email OTP
            </Link>
          </p>
        </div>

        {/* Security badge */}
        <div className="mt-4 flex items-center justify-center space-x-1.5 text-[11px] text-slate-500 dark:text-zinc-500">
          <ShieldCheck size={13} className="text-emerald-500" />
          <span>One-Account-Per-Email Guaranteed</span>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
