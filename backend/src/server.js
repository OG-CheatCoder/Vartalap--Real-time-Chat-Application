import http from "http";
import express from "express";
import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import path from "path";
import { Server } from "socket.io";
import msgpackParser from "socket.io-msgpack-parser";

import connectDB from "./config/db.js";
import { warmupUsernameIndex } from "./utils/usernameService.js";
import authRoutes from "./routes/authRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import directChatRoutes from "./routes/directChatRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import initSocketHandler from "./socket/socketHandler.js";
import initSessionExpiryCron from "./jobs/sessionCron.js";

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Normalize CLIENT_URL(s) and strip trailing slashes to avoid production CORS mismatches
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const corsOriginValidator = (origin, callback) => {
  if (!origin) return callback(null, true);
  const normalized = origin.replace(/\/+$/, "");
  if (allowedOrigins.includes("*") || allowedOrigins.includes(normalized)) {
    return callback(null, true);
  }
  return callback(new Error(`CORS policy blocked origin: ${origin}`));
};

// Configure Socket.io with binary MessagePack wire protocol + perMessageDeflate compression
const io = new Server(server, {
  parser: msgpackParser,
  perMessageDeflate: {
    threshold: 256,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  cors: {
    origin: corsOriginValidator,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  },
});

// Attach io instance to req for controllers if needed
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Middleware (including gzip/deflate HTTP compression)
app.use(compression());
app.use(
  cors({
    origin: corsOriginValidator,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/direct-chats", directChatRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);

// Health check endpoints
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "Vartalap Backend API",
    health: "/api/health",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "Vartalap Backend API",
    timestamp: new Date().toISOString(),
  });
});

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.originalUrl} not found.`,
  });
});

// Initialize Socket.io and background Cron
initSocketHandler(io);
initSessionExpiryCron(io);

// Start Server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  await warmupUsernameIndex();
  server.listen(PORT, () => {
    console.log(`[Server] Vartalap Backend running on port ${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
  });
};

startServer();

export { app, server, io };
