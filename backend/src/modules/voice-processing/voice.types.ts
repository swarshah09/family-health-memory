import { z } from "zod";

// ── Transcription status ────────────────────────────────────────────────
export const TranscriptionStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED"
]);

export type TranscriptionStatus = z.infer<typeof TranscriptionStatusSchema>;

// ── Voice recording ─────────────────────────────────────────────────────
export const VoiceRecordingSchema = z.object({
  recordingId: z.string(),
  sourceMessageId: z.string(),
  senderUserId: z.string(),
  familyId: z.string(),
  audioUrl: z.string(),
  duration: z.number().nullable(),
  mimeType: z.string(),
  transcriptionStatus: TranscriptionStatusSchema,
  createdAt: z.string()
});

export type VoiceRecording = z.infer<typeof VoiceRecordingSchema>;

// ── Transcript ──────────────────────────────────────────────────────────
export const VoiceTranscriptSchema = z.object({
  transcriptId: z.string(),
  recordingId: z.string(),
  transcriptText: z.string(),
  language: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string()
});

export type VoiceTranscript = z.infer<typeof VoiceTranscriptSchema>;

// ── Processing input ────────────────────────────────────────────────────
export type VoiceProcessingInput = {
  messageId: string;
  familyId: string;
  senderUserId: string;
  mediaUrl: string;
  messageType: string;
};

// ── Processing result ───────────────────────────────────────────────────
export type VoiceProcessingResult = {
  recordingId: string | null;
  transcriptId: string | null;
  transcriptText: string | null;
  status: "COMPLETED" | "FAILED" | "SKIPPED_NO_AUDIO" | "SKIPPED_DUPLICATE";
  reason?: string;
};

// ── Constants ───────────────────────────────────────────────────────────

/** Maximum audio duration in seconds we accept for transcription. */
export const MAX_AUDIO_DURATION_SECONDS = 300; // 5 minutes

/** Maximum retry attempts for transcription. */
export const MAX_TRANSCRIPTION_RETRIES = 2;

/** Default MIME type for WhatsApp voice notes. */
export const DEFAULT_VOICE_MIME_TYPE = "audio/ogg; codecs=opus";
