import {
  acknowledgeMessagesForUser,
  processSeenReceipts,
} from "../controllers/chatController.js";

const onlineUsers = new Map(); // userId -> Set(socketId)

export const isUserOnline = (userId) =>
  Boolean(userId && onlineUsers.has(userId.toString()));

export const initSocketHandler = (io) => {
  io.on("connection", (socket) => {
    const userId = socket.handshake.query?.userId;

    if (userId) {
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId).add(socket.id);

      // Personal notification & direct-routing room
      socket.join(`user:${userId}`);
      io.emit("presence:online_list", Array.from(onlineUsers.keys()));
      console.log(`[Socket] User connected: ${userId} (Socket ID: ${socket.id})`);
    }

    socket.on("room:join", ({ roomType, roomId }) => {
      if (roomType && roomId) {
        socket.join(`${roomType}:${roomId}`);
      }
    });

    socket.on("room:leave", ({ roomType, roomId }) => {
      if (roomType && roomId) {
        socket.leave(`${roomType}:${roomId}`);
      }
    });

    // Direct WebSocket routing for typing indicators (zero DB persistence)
    socket.on("typing:start", ({ roomType, roomId, username }) => {
      socket.to(`${roomType}:${roomId}`).emit("typing:update", {
        roomId,
        username,
        isTyping: true,
      });
    });

    socket.on("typing:stop", ({ roomType, roomId, username }) => {
      socket.to(`${roomType}:${roomId}`).emit("typing:update", {
        roomId,
        username,
        isTyping: false,
      });
    });

    // Device-level delivery ACK -> deletes delivered messages from server & sends delivered ticks
    socket.on("message:ack", async ({ messageIds = [], eventIds = [] }) => {
      if (!userId) return;
      try {
        await acknowledgeMessagesForUser(io, userId, messageIds, eventIds);
      } catch (err) {
        console.error("[Socket ACK Error]", err.message);
      }
    });

    // Read/Seen receipt -> sets sender's tick to bright blue (or queues PendingEvent if sender offline)
    socket.on("message:seen", async ({ items = [] }) => {
      if (!userId) return;
      try {
        await processSeenReceipts(io, userId, items);
      } catch (err) {
        console.error("[Socket SEEN Error]", err.message);
      }
    });

    socket.on("disconnect", () => {
      if (userId && onlineUsers.has(userId)) {
        const userSockets = onlineUsers.get(userId);
        userSockets.delete(socket.id);

        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
        }

        io.emit("presence:online_list", Array.from(onlineUsers.keys()));
        console.log(`[Socket] User disconnected: ${userId}`);
      }
    });
  });
};

export default initSocketHandler;
