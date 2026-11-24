import express from "express";
import { searchUsers } from "../controllers/chatController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/search", searchUsers);

export default router;
