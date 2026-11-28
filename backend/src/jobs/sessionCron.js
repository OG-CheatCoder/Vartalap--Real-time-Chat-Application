import cron from "node-cron";
import Group from "../models/Group.js";
import Message from "../models/Message.js";
import { processDueScheduledMessages } from "../controllers/chatController.js";

const emitCronAnnouncement = async (io, group, content, eventName) => {
  const memberIds = (group.members || []).map((m) => m.toString());
  const sysMsg = await Message.create({
    chatType: "group",
    chatId: group._id,
    sender: group.admin,
    content,
    isSystemMessage: true,
    pendingRecipients: memberIds,
  });

  const populatedMsg = await Message.findById(sysMsg._id).populate(
    "sender",
    "fullName username avatarUrl"
  );

  if (io) {
    const roomName = `group:${group._id}`;
    io.to(roomName).emit(eventName, { groupId: group._id });
    io.to(roomName).emit("message:new", populatedMsg);
    memberIds.forEach((mId) => {
      io.to(`user:${mId}`).emit(eventName, { groupId: group._id });
      io.to(`user:${mId}`).emit("message:new", populatedMsg);
      io.to(`user:${mId}`).emit("sidebar:update", populatedMsg);
    });
  }
};

export const initSessionExpiryCron = (io) => {
  // Run every 30 seconds to transition scheduled -> active -> expired session groups
  cron.schedule("*/30 * * * * *", async () => {
    try {
      const now = new Date();

      const startingGroups = await Group.find({
        isSessionGroup: true,
        status: "scheduled",
        startsAt: { $lte: now },
      });

      for (const group of startingGroups) {
        group.status = group.expiresAt && group.expiresAt <= now ? "expired" : "active";
        await group.save();
        if (group.status === "active") {
          await emitCronAnnouncement(
            io,
            group,
            "Scheduled session has started! Chat is now open.",
            "group:started"
          );
        }
      }

      const expiredGroups = await Group.find({
        isSessionGroup: true,
        status: "active",
        expiresAt: { $lte: now },
      });

      for (const group of expiredGroups) {
        group.status = "expired";
        await group.save();
        await emitCronAnnouncement(
          io,
          group,
          "Session timer has ended. This group is now closed.",
          "group:expired"
        );
        console.log(
          `[Session Cron] Group ${group.name} (${group.groupTag}) expired at ${now.toISOString()}`
        );
      }
    } catch (error) {
      console.error("[Session Cron Error]", error.message);
    }
  });

  let isProcessingScheduled = false;
  cron.schedule("*/10 * * * * *", async () => {
    if (isProcessingScheduled) return;
    isProcessingScheduled = true;
    try {
      await processDueScheduledMessages(io);
    } catch (error) {
      console.error("[Scheduled Msg Cron Error]", error.message);
    } finally {
      isProcessingScheduled = false;
    }
  });

  console.log("[Jobs] Session scheduler (30s) & Scheduled message dispatcher (10s) active.");
};

export default initSessionExpiryCron;
