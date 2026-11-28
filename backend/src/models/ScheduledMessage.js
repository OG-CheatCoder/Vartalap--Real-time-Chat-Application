import mongoose from "mongoose";

/**
 * Stores timed / scheduled messages on the server so they dispatch reliably
 * at `scheduledFor` even when the sender is offline at delivery time.
 */
const scheduledTargetSchema = new mongoose.Schema(
  {
    chatType: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { _id: false }
);

const scheduledMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targets: {
      type: [scheduledTargetSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one target chat is required.",
      },
      required: true,
    },
    content: {
      type: String,
      trim: true,
      default: "",
    },
    mediaUrl: {
      type: String,
      trim: true,
      default: "",
    },
    mediaType: {
      type: String,
      enum: ["text", "image", "video", "audio", "document"],
      default: "text",
    },
    fileName: {
      type: String,
      trim: true,
      default: "",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    replyPreview: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    scheduledFor: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "sent", "partial", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    dispatchedAt: {
      type: Date,
      default: null,
    },
    results: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

scheduledMessageSchema.index({ status: 1, scheduledFor: 1 });

const ScheduledMessage = mongoose.model("ScheduledMessage", scheduledMessageSchema);

export default ScheduledMessage;
