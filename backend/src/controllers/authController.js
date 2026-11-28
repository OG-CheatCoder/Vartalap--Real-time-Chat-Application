import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import PendingRegistration from "../models/PendingRegistration.js";
import Group from "../models/Group.js";
import DirectChat from "../models/DirectChat.js";
import Message from "../models/Message.js";
import { validateRealEmail, sendOtpEmail } from "../utils/emailService.js";
import { validatePasswordStrength } from "../utils/passwordValidator.js";
import {
  validateUsernameFormat,
  checkUsernameAvailability,
  registerUsernameInIndex,
  swapUsernameInIndex,
  removeUsernameFromIndex,
} from "../utils/usernameService.js";

const generateToken = (userId) =>
  jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || "vartalap_super_secret_jwt_key_2026",
    { expiresIn: "7d" }
  );

const formatUser = (user) => ({
  _id: user._id,
  id: user._id,
  fullName: user.fullName,
  username: user.username,
  email: user.email,
  avatarUrl: user.avatarUrl || "",
  blockedUsers: (user.blockedUsers || []).map((id) => toId(id)),
  defaultDisappearingDuration: user.defaultDisappearingDuration || 0,
});

const toId = (v) => (v?._id || v)?.toString();

// @desc    Check real-time username availability (Bloom Filter -> Cache -> Indexed DB)
// @route   GET /api/auth/check-username?username=...
export const checkUsername = async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || !username.trim()) {
      return res.status(400).json({
        success: false,
        available: false,
        message: "Please enter a username.",
      });
    }

    const result = await checkUsernameAvailability(username);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      available: false,
      message: error.message || "Error checking username availability.",
    });
  }
};

// @desc    Register a new user (stores temporarily in PendingRegistration until OTP verified)
// @route   POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { fullName, username, email, password } = req.body;

    if (!fullName?.trim() || !username?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide full name, username, email, and password.",
      });
    }

    const usernameCheck = validateUsernameFormat(username);
    if (!usernameCheck.valid) {
      return res.status(400).json({
        success: false,
        field: "username",
        message: usernameCheck.message,
      });
    }
    const normalizedUsername = usernameCheck.normalized;

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        field: "password",
        message: passwordCheck.message,
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailValidation = await validateRealEmail(normalizedEmail);
    if (!emailValidation.valid) {
      return res.status(400).json({
        success: false,
        field: "email",
        message: emailValidation.reason,
      });
    }

    // Check only verified accounts in User collection so unverified attempts never block names/emails
    const emailExists = await User.exists({ email: normalizedEmail });
    if (emailExists) {
      return res.status(400).json({
        success: false,
        field: "email",
        message: "An account with this email is already registered.",
      });
    }

    const usernameExists = await User.exists({ username: normalizedUsername });
    if (usernameExists) {
      return res.status(400).json({
        success: false,
        field: "username",
        message: "This username is already taken.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    try {
      await sendOtpEmail(normalizedEmail, otpCode, fullName.trim());
    } catch (mailErr) {
      console.error("[Mail Error]", mailErr.message);
      return res.status(400).json({
        success: false,
        field: "email",
        message: "Could not deliver OTP email to that address. Please check your email and try again.",
      });
    }

    // Upsert ephemeral pending registration (auto-expires if user abandons OTP step)
    await PendingRegistration.findOneAndUpdate(
      { email: normalizedEmail },
      {
        fullName: fullName.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        otpCode,
        otpExpiresAt,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      message: "Verification OTP sent to your email address.",
      data: {
        email: normalizedEmail,
        username: normalizedUsername,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error during registration.",
    });
  }
};

// @desc    Verify 6-digit OTP and ONLY THEN create the verified User & claim username
// @route   POST /api/auth/verify-otp
export const verifyOtp = async (req, res) => {
  try {
    const { email, otpCode } = req.body;

    if (!email || !otpCode) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and otpCode.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const alreadyVerified = await User.exists({ email: normalizedEmail });
    if (alreadyVerified) {
      return res.status(400).json({
        success: false,
        message: "Account is already verified. Please login.",
      });
    }

    const pending = await PendingRegistration.findOne({ email: normalizedEmail });
    if (!pending) {
      return res.status(404).json({
        success: false,
        message: "Registration session expired or not found. Please register again.",
      });
    }

    if (pending.otpCode !== otpCode.trim()) {
      return res.status(400).json({ success: false, message: "Invalid OTP code." });
    }

    if (new Date() > new Date(pending.otpExpiresAt)) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    const usernameClaimed = await User.exists({ username: pending.username });
    if (usernameClaimed) {
      return res.status(409).json({
        success: false,
        message: `Username @${pending.username} was claimed while your OTP was pending. Please register again with another username.`,
      });
    }

    const user = await User.create({
      fullName: pending.fullName,
      username: pending.username,
      email: pending.email,
      passwordHash: pending.passwordHash,
      isVerified: true,
    });

    await PendingRegistration.deleteOne({ _id: pending._id });
    registerUsernameInIndex(user.username);

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Account verified successfully.",
      data: {
        token,
        user: formatUser(user),
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email or username was already registered.",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Server error during OTP verification.",
    });
  }
};

// @desc    Resend OTP via Nodemailer for pending registration
// @route   POST /api/auth/resend-otp
export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Please provide your registered email." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (await User.exists({ email: normalizedEmail })) {
      return res.status(400).json({ success: false, message: "Account is already verified. Please login." });
    }

    const pending = await PendingRegistration.findOne({ email: normalizedEmail });
    if (!pending) {
      return res.status(404).json({
        success: false,
        message: "Pending registration not found or expired. Please register again.",
      });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await sendOtpEmail(pending.email, otpCode, pending.fullName);

    pending.otpCode = otpCode;
    pending.otpExpiresAt = otpExpiresAt;
    pending.expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await pending.save();

    res.status(200).json({
      success: true,
      message: "A new OTP has been sent to your email address.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error while resending OTP.",
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide username/email and password.",
      });
    }

    const normalized = identifier.replace(/^@/, "").toLowerCase().trim();
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase().trim() }, { username: normalized }],
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email OTP before logging in.",
        data: { email: user.email },
      });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token,
        user: formatUser(user),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error during login.",
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: { user: formatUser(req.user) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error fetching user profile.",
    });
  }
};

// @desc    Change unique username for authenticated user
// @route   PATCH /api/auth/username
export const updateUsername = async (req, res) => {
  try {
    const { username } = req.body;
    const formatCheck = validateUsernameFormat(username);

    if (!formatCheck.valid) {
      return res.status(400).json({
        success: false,
        message: formatCheck.message,
      });
    }

    const nextUsername = formatCheck.normalized;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (user.username === nextUsername) {
      return res.status(200).json({
        success: true,
        message: "Username is unchanged.",
        data: { user: formatUser(user) },
      });
    }

    const taken = await User.exists({
      username: nextUsername,
      _id: { $ne: user._id },
    });
    if (taken) {
      return res.status(409).json({
        success: false,
        message: "This username is already taken.",
      });
    }

    const oldUsername = user.username;
    user.username = nextUsername;
    await user.save();

    swapUsernameInIndex(oldUsername, nextUsername);

    if (req.io) {
      req.io.emit("user:updated", {
        userId: user._id,
        username: user.username,
        fullName: user.fullName,
      });
    }

    res.status(200).json({
      success: true,
      message: `Username changed to @${nextUsername}.`,
      data: { user: formatUser(user) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error updating username.",
    });
  }
};

// @desc    Update default disappearing message timer for new chats
// @route   PATCH /api/auth/disappearing-default
export const updateDefaultDisappearing = async (req, res) => {
  try {
    const duration = Number(req.body.duration);
    if (![0, 86400, 604800, 2592000].includes(duration)) {
      return res.status(400).json({
        success: false,
        message: "Duration must be 0 (off), 86400 (24h), 604800 (7d), or 2592000 (30d).",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { defaultDisappearingDuration: duration },
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: { user: formatUser(user) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error updating disappearing default.",
    });
  }
};

// @desc    Permanently delete user account (verifies password, cleans groups, DMs & username index)
// @route   DELETE /api/auth/account
export const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Please enter your password to confirm account deletion.",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password. Account was not deleted.",
      });
    }

    const userId = user._id.toString();
    const oldUsername = user.username;

    // 1. Clean up or transfer group memberships & ownership
    const memberGroups = await Group.find({ members: user._id });
    for (const group of memberGroups) {
      const otherMembers = group.members.filter((m) => toId(m) !== userId);
      if (otherMembers.length === 0) {
        await Message.deleteMany({ chatId: group._id });
        await Group.findByIdAndDelete(group._id);
        if (req.io) {
          req.io.to(`group:${group._id}`).emit("group:deleted", { groupId: group._id });
        }
        continue;
      }

      group.members = otherMembers;
      group.admins = (group.admins || []).filter((a) => toId(a) !== userId);
      if (group.admins.length === 0) {
        group.admins = [otherMembers[0]];
      }
      group.admin = group.admins[0];
      group.pendingRequests = (group.pendingRequests || []).filter(
        (p) => toId(p.user) !== userId
      );

      const sysMsg = await Message.create({
        chatType: "group",
        chatId: group._id,
        sender: user._id,
        content: `@${oldUsername} deleted their account.`,
        isSystemMessage: true,
      });
      group.lastMessage = sysMsg._id;
      await group.save();

      if (req.io) {
        const populatedGroup = await Group.findById(group._id)
          .populate("admin", "fullName username avatarUrl")
          .populate("admins", "fullName username avatarUrl")
          .populate("members", "fullName username avatarUrl lastSeen")
          .populate("pendingRequests.user", "fullName username avatarUrl")
          .populate("lastMessage");

        req.io.to(`group:${group._id}`).emit("group:updated", populatedGroup);
        otherMembers.forEach((m) =>
          req.io.to(`user:${toId(m)}`).emit("group:updated", populatedGroup)
        );
        req.io.to(`group:${group._id}`).emit("message:new", sysMsg);
        req.io.emit("sidebar:update", sysMsg);
      }
    }

    // 2. Clean up 1:1 Direct Chats & Messages involving this user
    const directChats = await DirectChat.find({ participants: user._id });
    for (const chat of directChats) {
      await Message.deleteMany({ chatType: "direct", chatId: chat._id });
      await DirectChat.findByIdAndDelete(chat._id);
      if (req.io) {
        chat.participants.forEach((pId) => {
          if (toId(pId) !== userId) {
            req.io.to(`user:${toId(pId)}`).emit("direct_chat:deleted", { chatId: chat._id });
          }
        });
      }
    }

    // 3. Free username in Bloom Filter + Cache and remove user
    removeUsernameFromIndex(oldUsername);
    await User.findByIdAndDelete(user._id);

    res.status(200).json({
      success: true,
      message: "Your account has been permanently deleted.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error deleting account.",
    });
  }
};
