import mongoose, { Schema } from "mongoose";

/**
 * VOICE_TRANSCRIPTS — transcription results from voice recordings.
 * Links back to voice_recordings for full traceability.
 */
const voiceTranscriptSchema = new Schema(
  {
    recordingId: { type: String, required: true, unique: true, index: true },
    transcriptText: { type: String, required: true },
    language: { type: String, default: null },
    confidence: { type: Number, required: true, min: 0, max: 1 }
  },
  {
    timestamps: true,
    collection: "voice_transcripts"
  }
);

export const VoiceTranscriptModel = mongoose.model("VoiceTranscript", voiceTranscriptSchema);
