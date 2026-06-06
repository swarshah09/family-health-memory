/**
 * Voice Note Transcription & Conversational Memory Pipeline
 *
 * Transforms WhatsApp voice notes and audio attachments into normalized
 * text that feeds into the health memory pipeline.
 *
 * Flow: download → store → transcribe (Whisper) → normalize → pipeline
 *
 * Safety:
 * - Preserves original meaning during transcription
 * - No AI interpretation during transcription
 * - No medical conclusions
 * - Audio access restricted by family permissions
 *
 * Future-proofed for: multilingual, speaker ID, emotional tone, summaries
 */

export {
  voiceProcessingService,
  VoiceProcessingService
} from "./voice-processing.service.js";

export {
  transcribeAudio,
  normalizeTranscript
} from "./transcription.service.js";

export {
  downloadWhatsAppAudio,
  extractAudioDuration
} from "./audio-storage.service.js";

export {
  VoiceRecordingSchema,
  VoiceTranscriptSchema,
  TranscriptionStatusSchema,
  MAX_AUDIO_DURATION_SECONDS,
  MAX_TRANSCRIPTION_RETRIES,
  DEFAULT_VOICE_MIME_TYPE,
  type VoiceRecording,
  type VoiceTranscript,
  type VoiceProcessingInput,
  type VoiceProcessingResult,
  type TranscriptionStatus
} from "./voice.types.js";

export { VoiceRecordingModel } from "./models/voice-recording.model.js";
export { VoiceTranscriptModel } from "./models/voice-transcript.model.js";
