import mongoose, { Schema } from "mongoose";

/**
 * WHATSAPP_MESSAGES — inbound messages awaiting intelligence pipeline (ingestion only).
 */
const whatsappMessageSchema = new Schema(
  {
    whatsappMessageId: { type: String, required: true, unique: true, index: true },
    senderPhoneNumber: { type: String, required: true, index: true },
    senderUserId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    messageType: {
      type: String,
      enum: ["TEXT", "AUDIO", "IMAGE", "UNKNOWN"],
      required: true,
      index: true
    },
    rawPayload: { type: Schema.Types.Mixed, required: true },
    rawText: { type: String },
    mediaUrl: { type: String },
    receivedAt: { type: Date, required: true, index: true },
    processingStatus: {
      type: String,
      enum: ["PENDING", "PROCESSED", "FAILED"],
      required: true,
      default: "PENDING",
      index: true
    }
  },
  {
    timestamps: true,
    collection: "whatsapp_messages"
  }
);

whatsappMessageSchema.index({ processingStatus: 1, receivedAt: 1 });
whatsappMessageSchema.index({ familyId: 1, receivedAt: -1 });

export const WhatsAppMessageModel = mongoose.model("WhatsAppMessage", whatsappMessageSchema);
