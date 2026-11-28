import express from "express";
import {
  getPendingSync,
  ackMessages,
  markMessagesSeen,
  getMessages,
  sendMessage,
  editMessage,
  togglePinMessage,
  toggleStarMessage,
  deleteMessages,
  clearChat,
  scheduleMessage,
  getScheduledMessages,
  cancelScheduledMessage,
} from "../controllers/chatController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/pending", getPendingSync);
router.post("/ack", ackMessages);
router.post("/seen", markMessagesSeen);
router.get("/scheduled", getScheduledMessages);
router.post("/scheduled", scheduleMessage);
router.delete("/scheduled/:scheduledId", cancelScheduledMessage);
router.post("/delete", deleteMessages);
router.post("/clear-chat", clearChat);
router.post("/:messageId/pin", togglePinMessage);
router.post("/:messageId/star", toggleStarMessage);
router.patch("/:messageId", editMessage);
router.get("/:chatType/:chatId", getMessages);
router.post("/", sendMessage);

export default router;
