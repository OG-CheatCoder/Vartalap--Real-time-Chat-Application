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
  },
  {
    timestamps: true,
  }
);

// Ensure index on participants for fast lookups
directChatSchema.index({ participants: 1 });

const DirectChat = mongoose.model("DirectChat", directChatSchema);

export default DirectChat;
