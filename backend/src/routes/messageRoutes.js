import express from "express";
import {
  getMessages,
  sendMessage,
  editMessage,
  togglePinMessage,
  toggleStarMessage,
  deleteMessages,
  clearChat,
} from "../controllers/chatController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post("/delete", deleteMessages);
router.post("/clear-chat", clearChat);
router.post("/:messageId/pin", togglePinMessage);
router.post("/:messageId/star", toggleStarMessage);
router.patch("/:messageId", editMessage);
router.get("/:chatType/:chatId", getMessages);
router.post("/", sendMessage);

export default router;
