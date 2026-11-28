import express from "express";
import {
  getOrCreateDirectChat,
  getMyDirectChats,
  updateDirectDisappearingTimer,
  deleteDirectChat,
} from "../controllers/directChatController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post("/", getOrCreateDirectChat);
router.get("/", getMyDirectChats);
router.patch("/:chatId/disappearing", updateDirectDisappearingTimer);
router.delete("/:chatId", deleteDirectChat);

export default router;
