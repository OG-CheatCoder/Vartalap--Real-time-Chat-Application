import express from "express";
import {
  getMessages,
  sendMessage,
  searchUsers,
} from "../controllers/chatController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/users/search", searchUsers);
router.get("/:chatType/:chatId", getMessages);
router.post("/", sendMessage);

export default router;
