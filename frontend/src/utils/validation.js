import { useState, useEffect } from "react";
import axiosInstance from "../api/axiosInstance";

export const normalizeUsernameInput = (raw = "") =>
  raw.replace(/^@/, "").toLowerCase().trim();

export const validateUsernameClient = (raw = "") => {
  const normalized = normalizeUsernameInput(raw);
  if (!normalized) return { valid: false, normalized, message: "" };
  if (normalized.length < 3 || normalized.length > 24) {
    return {
      valid: false,
      normalized,
      message: "Must be 3–24 characters.",
    };
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      message: "Use only lowercase letters, numbers, and underscores.",
    };
  }
  return { valid: true, normalized, message: "" };
};

export const evaluatePasswordStrength = (password = "") => {
  const rules = {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const passedCount = Object.values(rules).filter(Boolean).length;
  const isStrong = passedCount === 5;

  let label = "Very Weak";
  let barColor = "bg-rose-500";
  let textColor = "text-rose-400";

  if (passedCount === 2) {
    label = "Weak";
    barColor = "bg-rose-500";
    textColor = "text-rose-400";
  } else if (passedCount === 3) {
    label = "Fair";
    barColor = "bg-amber-500";
    textColor = "text-amber-400";
  } else if (passedCount === 4) {
    label = "Good";
    barColor = "bg-sky-500";
    textColor = "text-sky-400";
  } else if (passedCount === 5) {
    label = "Strong";
    barColor = "bg-emerald-500";
    textColor = "text-emerald-400";
  }

  return { rules, passedCount, isStrong, label, barColor, textColor };
};

/**
 * Custom hook: Client-side format validation + 350ms debounced backend availability check
 * (Backed on server by Bloom Filter -> In-Memory Cache -> Indexed MongoDB).
 */
export const useUsernameAvailability = (rawUsername, currentOwnUsername = "") => {
  const [status, setStatus] = useState("idle"); // 'idle' | 'invalid' | 'unchanged' | 'checking' | 'available' | 'taken' | 'error'
  const [message, setMessage] = useState("");

  const normalized = normalizeUsernameInput(rawUsername);
  const currentOwn = normalizeUsernameInput(currentOwnUsername);

  useEffect(() => {
    if (!normalized) {
      setStatus("idle");
      setMessage("");
      return;
    }

    if (currentOwn && normalized === currentOwn) {
      setStatus("unchanged");
      setMessage("This is your current username.");
      return;
    }

    const format = validateUsernameClient(normalized);
    if (!format.valid) {
      setStatus("invalid");
      setMessage(format.message);
      return;
    }

    setStatus("checking");
    setMessage("Checking availability...");

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await axiosInstance.get(
          `/auth/check-username?username=${encodeURIComponent(normalized)}`,
          { signal: controller.signal }
        );
        if (res.data?.success) {
          setStatus(res.data.available ? "available" : "taken");
          setMessage(res.data.message);
        }
      } catch (err) {
        if (err.name === "CanceledError" || err.code === "ERR_CANCELED") return;
        setStatus("error");
        setMessage("Unable to verify username right now.");
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, currentOwn]);

  return { status, message, normalized };
};
