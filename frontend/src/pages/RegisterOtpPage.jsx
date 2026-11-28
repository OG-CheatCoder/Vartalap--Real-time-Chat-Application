import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import axiosInstance from "../api/axiosInstance";
import {
  evaluatePasswordStrength,
  useUsernameAvailability,
} from "../utils/validation";
import {
  User,
  AtSign,
  Mail,
  Lock,
  ArrowRight,
  KeyRound,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Check,
  X,
  Sun,
  Moon,
} from "lucide-react";

const PASSWORD_CHECKS = [
  { key: "minLength", label: "8+ characters" },
  { key: "hasUpper", label: "1 uppercase (A-Z)" },
  { key: "hasLower", label: "1 lowercase (a-z)" },
  { key: "hasNumber", label: "1 number (0-9)" },
  { key: "hasSpecial", label: "1 special char (!@#...)" },
];

const RegisterOtpPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [step, setStep] = useState(location.state?.email ? 2 : 1);
  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    email: location.state?.email || "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [resendTimer, setResendTimer] = useState(60);

  const usernameCheck = useUsernameAvailability(formData.username);
  const pwStrength = evaluatePasswordStrength(formData.password);

  useEffect(() => {
    let interval;
    if (step === 2 && resendTimer > 0) {
      interval = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!formData.fullName.trim() || !formData.username.trim() || !formData.email.trim() || !formData.password) {
      setError("All fields are required.");
      return;
    }

    if (usernameCheck.status === "invalid" || usernameCheck.status === "taken") {
      setError(usernameCheck.message || "Please choose a valid, available username.");
      return;
    }

    if (!pwStrength.isStrong) {
      setError("Please satisfy all password strength requirements before continuing.");
      return;
    }

    setLoading(true);
    try {
      const res = await axiosInstance.post("/auth/register", {
        fullName: formData.fullName.trim(),
        username: usernameCheck.normalized,
        email: formData.email.trim(),
        password: formData.password,
      });
      if (res.data?.success) {
        setSuccessMsg(res.data.message || "OTP sent to your email!");
        setStep(2);
        setResendTimer(60);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");

    if (!otpCode || otpCode.trim().length !== 6) {
      setError("Please enter the 6-digit OTP.");
      return;
    }

    setLoading(true);
    try {
      const res = await axiosInstance.post("/auth/verify-otp", {
        email: formData.email.trim(),
        otpCode: otpCode.trim(),
      });
      if (res.data?.success) {
        login(res.data.data.user, res.data.data.token);
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Invalid or expired OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setError("");
    setLoading(true);
    try {
      const res = await axiosInstance.post("/auth/resend-otp", {
        email: formData.email.trim(),
      });
      if (res.data?.success) {
        setSuccessMsg("A new 6-digit OTP has been sent to your email.");
        setResendTimer(60);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Could not resend OTP.");
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
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 mx-auto flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-blue-500/25 mb-3">
            V
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
            {step === 1 ? "Create Vartalap Account" : "Verify Email OTP"}
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {step === 1
              ? "Zero phone number requirement. 1 account per email."
              : `Enter the 6-digit code sent to ${formData.email}`}
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
            {error}
          </div>
        )}
        {successMsg && !error && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center space-x-1.5">
            <CheckCircle size={14} />
            <span>{successMsg}</span>
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleRegister} className="space-y-3.5">
            {/* Full Name */}
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                Full Name
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-2.5 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  placeholder="Aditya Prakash"
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            {/* Unique Username with Live Availability Check */}
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                Unique @username
              </label>
              <div className="relative">
                <AtSign size={15} className="absolute left-3.5 top-2.5 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  placeholder="aditya_p"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value.replace(/\s+/g, "") })
                  }
                  className={`w-full bg-slate-50 dark:bg-[#0b0d10] border rounded-xl pl-10 pr-9 py-2 text-xs text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition ${
                    usernameCheck.status === "available"
                      ? "border-emerald-500/70 focus:border-emerald-500"
                      : usernameCheck.status === "taken" || usernameCheck.status === "invalid"
                      ? "border-rose-500/70 focus:border-rose-500"
                      : "border-slate-200 dark:border-zinc-800 focus:border-blue-500"
                  }`}
                />
                <div className="absolute right-3 top-2.5">
                  {usernameCheck.status === "checking" && (
                    <Loader2 size={14} className="text-blue-500 animate-spin" />
                  )}
                  {usernameCheck.status === "available" && (
                    <CheckCircle size={14} className="text-emerald-500" />
                  )}
                  {(usernameCheck.status === "taken" || usernameCheck.status === "invalid") && (
                    <XCircle size={14} className="text-rose-500" />
                  )}
                </div>
              </div>
              {usernameCheck.message && (
                <p
                  className={`text-[11px] mt-1 ${
                    usernameCheck.status === "available"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : usernameCheck.status === "checking"
                      ? "text-slate-500 dark:text-zinc-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {usernameCheck.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                Real Email Address (OTP Verification Required)
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-2.5 text-slate-400 dark:text-zinc-500" />
                <input
                  type="email"
                  placeholder="you@gmail.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            {/* Password with Live Strength Meter & Policy Checklist */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Password
                </label>
                {formData.password && (
                  <span className={`text-[11px] font-semibold ${pwStrength.textColor}`}>
                    {pwStrength.label}
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-2.5 text-slate-400 dark:text-zinc-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl pl-10 pr-9 py-2 text-xs text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2.5 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {formData.password && (
                <div className="mt-2 space-y-2 p-2.5 bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl">
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={`h-1 rounded-full transition-colors ${
                          pwStrength.passedCount >= level
                            ? pwStrength.barColor
                            : "bg-slate-200 dark:bg-zinc-800"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    {PASSWORD_CHECKS.map((rule) => {
                      const passed = pwStrength.rules[rule.key];
                      return (
                        <div
                          key={rule.key}
                          className={`flex items-center space-x-1 ${
                            passed
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-400 dark:text-zinc-500"
                          }`}
                        >
                          {passed ? <Check size={11} /> : <X size={11} />}
                          <span>{rule.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={
                loading ||
                usernameCheck.status === "checking" ||
                usernameCheck.status === "taken" ||
                usernameCheck.status === "invalid"
              }
              className="w-full mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/25 transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <span>{loading ? "Sending Email OTP..." : "Send Verification OTP"}</span>
              <ArrowRight size={14} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-2 text-center">
                6-Digit Security OTP
              </label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3.5 top-3 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#0b0d10] border border-slate-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-center text-lg font-mono tracking-widest text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 text-center mt-2">
                Check your email inbox (and Spam folder) for the 6-digit verification code.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/25 transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <span>{loading ? "Verifying..." : "Verify & Launch Vartalap"}</span>
              <CheckCircle size={14} />
            </button>

            <div className="flex items-center justify-between text-xs pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition"
              >
                Change Email
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendTimer > 0 || loading}
                className="text-blue-600 dark:text-indigo-400 hover:underline disabled:text-slate-400 dark:disabled:text-zinc-600 font-medium flex items-center space-x-1 transition"
              >
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                <span>
                  {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : "Resend OTP"}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Footer Link */}
        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-zinc-800/80 text-center">
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-blue-600 dark:text-indigo-400 hover:underline font-medium transition"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterOtpPage;
