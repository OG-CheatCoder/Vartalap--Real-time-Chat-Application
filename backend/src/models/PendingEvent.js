import mongoose from "mongoose";

/**
 * Ephemeral control signal queue for offline recipients (edits, pins, deletes for everyone)
 * when the original message has already been wiped from MongoDB upon delivery.
 * Automatically purged after 30 days or deleted immediately once ACKed.
 */
const pendingEventSchema = new mongoose.Schema(
  {
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    chatType: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    eventType: {
      type: String,
      enum: ["edit", "delete_for_everyone", "pin", "delivered", "seen", "scheduled_sent"],
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  }
);

const PendingEvent = mongoose.model("PendingEvent", pendingEventSchema);

export default PendingEvent;
