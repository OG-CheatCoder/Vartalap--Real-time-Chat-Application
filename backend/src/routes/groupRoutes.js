import express from "express";
import {
  createGroup,
  getMyGroups,
  searchGroupByTag,
  joinGroup,
  handleJoinRequest,
  updateGroupSettings,
  togglePinMessage,
  removeMember,
} from "../controllers/groupController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post("/", createGroup);
router.get("/my-groups", getMyGroups);
router.get("/search", searchGroupByTag);
router.post("/:groupId/join", joinGroup);
router.post("/:groupId/requests/:userId", handleJoinRequest);
router.patch("/:groupId/settings", updateGroupSettings);
router.post("/:groupId/pin/:messageId", togglePinMessage);
router.delete("/:groupId/members/:userId", removeMember);

export default router;
