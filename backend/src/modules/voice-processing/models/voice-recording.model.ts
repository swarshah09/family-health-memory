import mongoose, { Schema } from "mongoose";

/**
 * VOICE_RECORDINGS — metadata for WhatsApp voice notes/audio attachments.
 * Stores the audio reference, sender info, and transcription status.
 */
const voiceRecordingSchema = new Schema(
  {
    sourceMessageId: { type: String, required: true, unique: true, index: true },
    senderUserId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    audioUrl: { type: String, required: true },
    duration: { type: Number, default: null },
    mimeType: { type: String, required: true },
    transcriptionStatus: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      required: true,
      default: "PENDING",
      index: true
    }
  },
  {
    timestamps: true,
    collection: "voice_recordings"
  }
);

voiceRecordingSchema.index({ familyId: 1, createdAt: -1 });
voiceRecordingSchema.index({ transcriptionStatus: 1, createdAt: 1 });

export const VoiceRecordingModel = mongoose.model("VoiceRecording", voiceRecordingSchema);
