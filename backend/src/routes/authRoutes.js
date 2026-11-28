import express from "express";
import {
  register,
  verifyOtp,
  resendOtp,
  login,
  getMe,
  checkUsername,
  updateUsername,
  updateDefaultDisappearing,
  deleteAccount,
} from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/check-username", checkUsername);
router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/login", login);
router.get("/me", protect, getMe);
router.patch("/username", protect, updateUsername);
router.patch("/disappearing-default", protect, updateDefaultDisappearing);
router.delete("/account", protect, deleteAccount);

export default router;
