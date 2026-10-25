const onlineUsers = new Map(); // userId -> Set(socketId)

export const initSocketHandler = (io) => {
  io.on("connection", (socket) => {
    const userId = socket.handshake.query?.userId;

    if (userId) {
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId).add(socket.id);

      // Join user's personal notification room
      socket.join(`user:${userId}`);

      // Broadcast online status to all clients
      io.emit("presence:online_list", Array.from(onlineUsers.keys()));
      console.log(`[Socket] User connected: ${userId} (Socket ID: ${socket.id})`);
    }

    // Join chat room (direct or group)
    socket.on("room:join", ({ roomType, roomId }) => {
      const roomName = `${roomType}:${roomId}`;
      socket.join(roomName);
      console.log(`[Socket] ${socket.id} joined room ${roomName}`);
    });

    // Leave chat room
    socket.on("room:leave", ({ roomType, roomId }) => {
      const roomName = `${roomType}:${roomId}`;
      socket.leave(roomName);
    });

    // Typing indicators
    socket.on("typing:start", ({ roomType, roomId, username }) => {
      const roomName = `${roomType}:${roomId}`;
      socket.to(roomName).emit("typing:update", {
        roomId,
        username,
        isTyping: true,
      });
    });

    socket.on("typing:stop", ({ roomType, roomId, username }) => {
      const roomName = `${roomType}:${roomId}`;
      socket.to(roomName).emit("typing:update", {
        roomId,
        username,
        isTyping: false,
      });
    });

    // Send message real-time broadcast
    socket.on("message:send", ({ roomType, roomId, message }) => {
      const roomName = `${roomType}:${roomId}`;
      io.to(roomName).emit("message:new", message);
    });

    // Disconnect handling
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
