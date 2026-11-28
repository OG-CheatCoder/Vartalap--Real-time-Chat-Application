import express from "express";
import {
  searchUsers,
  getBlockedUsers,
  blockUser,
  unblockUser,
} from "../controllers/chatController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/search", searchUsers);
router.get("/blocked", getBlockedUsers);
router.post("/:targetUserId/block", blockUser);
router.delete("/:targetUserId/block", unblockUser);

export default router;
