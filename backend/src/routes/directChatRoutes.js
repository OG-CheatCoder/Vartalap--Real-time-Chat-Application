import express from "express";
import {
  getOrCreateDirectChat,
  getMyDirectChats,
} from "../controllers/directChatController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post("/", getOrCreateDirectChat);
router.get("/", getMyDirectChats);

export default router;
