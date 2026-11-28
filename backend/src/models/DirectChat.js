import mongoose from "mongoose";

const directChatSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    disappearingDuration: {
      type: Number,
      enum: [0, 86400, 604800, 2592000], // off, 24h, 7d, 30d
      default: 0,
    },
    disappearingConfigured: {
      type: Boolean,
      default: false,
    },
    // Tracks per-user "Delete Chat" without deleting the peer's own copy
    hiddenFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

directChatSchema.index({ participants: 1 });

const DirectChat = mongoose.model("DirectChat", directChatSchema);

export default DirectChat;
