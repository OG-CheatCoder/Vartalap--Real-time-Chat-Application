import cron from "node-cron";
import Group from "../models/Group.js";
import Message from "../models/Message.js";

export const initSessionExpiryCron = (io) => {
  // Run every 30 seconds to support live demo timers (e.g. 2-minute session groups)
  cron.schedule("*/30 * * * * *", async () => {
    try {
      const now = new Date();
      const expiredGroups = await Group.find({
        isSessionGroup: true,
        status: "active",
        expiresAt: { $lte: now },
      });

      for (const group of expiredGroups) {
        group.status = "expired";
        await group.save();

        // Insert system closing message
        const systemMsg = await Message.create({
          chatType: "group",
          chatId: group._id,
          sender: group.admin,
          content: "Session timer has ended. This group is now closed.",
          isSystemMessage: true,
        });

        // Broadcast expiry event and system message to room
        if (io) {
          const roomName = `group:${group._id}`;
          io.to(roomName).emit("group:expired", { groupId: group._id });
          io.to(roomName).emit("message:new", systemMsg);
        }

        console.log(`[Session Cron] Group ${group.name} (${group.groupTag}) expired at ${now.toISOString()}`);
      }
    } catch (error) {
      console.error("[Session Cron Error]", error.message);
    }
  });

  console.log("[Jobs] Session expiry cron job scheduled (every 30s).");
};

export default initSessionExpiryCron;
