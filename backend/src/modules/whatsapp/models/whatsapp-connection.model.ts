import mongoose, { Schema } from "mongoose";

/**
 * WHATSAPP_CONNECTIONS — maps one verified WhatsApp number to one user account.
 */
const whatsappConnectionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true, unique: true },
    whatsappPhoneNumber: { type: String, required: true, index: true, unique: true },
    isVerified: { type: Boolean, required: true, default: false, index: true },
    verifiedAt: { type: Date },
    verificationCodeHash: { type: String },
    verificationExpiresAt: { type: Date },
    verificationAttempts: { type: Number, default: 0 }
  },
  {
    timestamps: true,
    collection: "whatsapp_connections"
  }
);

export const WhatsAppConnectionModel = mongoose.model("WhatsAppConnection", whatsappConnectionSchema);
