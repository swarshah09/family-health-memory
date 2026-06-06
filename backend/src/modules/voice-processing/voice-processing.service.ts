import { VoiceRecordingModel } from "./models/voice-recording.model.js";
import { VoiceTranscriptModel } from "./models/voice-transcript.model.js";
import { downloadWhatsAppAudio, extractAudioDuration } from "./audio-storage.service.js";
import { transcribeAudio, normalizeTranscript } from "./transcription.service.js";
import type {
  VoiceRecording,
  VoiceTranscript,
  VoiceProcessingInput,
  VoiceProcessingResult
} from "./voice.types.js";
import { DEFAULT_VOICE_MIME_TYPE } from "./voice.types.js";

function logVoice(msg: string, fields: Record<string, unknown>): void {
  console.info(`[voice-processing] ${msg}`, { scope: "voice-processing", ...fields });
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

/**
 * Voice Processing Service — transforms WhatsApp voice notes and audio
 * attachments into normalized text for the health memory pipeline.
 *
 * Pipeline: download audio → store recording → transcribe → normalize → return text
 *
 * The normalized transcript replaces rawText in the processing pipeline,
 * feeding into the existing extraction → resolution → memory chain.
 *
 * Safety:
 * - Preserves original meaning during transcription
 * - No AI interpretation during transcription
 * - No medical conclusions
 * - Audio access restricted by family permissions
 */
export class VoiceProcessingService {
  /**
   * Full voice processing pipeline for a single message.
   *
   * 1. Guard: skip if no mediaUrl or already processed
   * 2. Download audio from WhatsApp Graph API
   * 3. Store recording metadata
   * 4. Transcribe via Whisper
   * 5. Normalize conversational text
   * 6. Store transcript
   * 7. Return normalized text for downstream pipeline
   */
  async processVoiceMessage(
    input: VoiceProcessingInput,
    rawPayload?: Record<string, unknown>
  ): Promise<VoiceProcessingResult> {
    const { messageId, familyId, senderUserId, mediaUrl } = input;

    if (!mediaUrl) {
      return { recordingId: null, transcriptId: null, transcriptText: null, status: "SKIPPED_NO_AUDIO" };
    }

    // Duplicate check
    const existing = await VoiceRecordingModel.findOne({ sourceMessageId: messageId })
      .select("_id transcriptionStatus")
      .lean();

    if (existing) {
      // If already completed, fetch the transcript
      if (existing.transcriptionStatus === "COMPLETED") {
        const transcript = await VoiceTranscriptModel.findOne({
          recordingId: existing._id.toString()
        })
          .select("transcriptText")
          .lean();

        return {
          recordingId: existing._id.toString(),
          transcriptId: null,
          transcriptText: transcript?.transcriptText || null,
          status: "SKIPPED_DUPLICATE"
        };
      }
      // If still pending/processing, skip to avoid double-processing
      return {
        recordingId: existing._id.toString(),
        transcriptId: null,
        transcriptText: null,
        status: "SKIPPED_DUPLICATE"
      };
    }

    // Step 1: Download audio from WhatsApp
    const audio = await downloadWhatsAppAudio(mediaUrl);
    if (!audio) {
      logVoice("audio download failed", { messageId, mediaUrl });
      return {
        recordingId: null,
        transcriptId: null,
        transcriptText: null,
        status: "FAILED",
        reason: "Audio download failed"
      };
    }

    // Step 2: Store recording metadata
    const duration = rawPayload ? extractAudioDuration(rawPayload) : null;
    let recordingDoc;
    try {
      recordingDoc = await VoiceRecordingModel.create({
        sourceMessageId: messageId,
        senderUserId,
        familyId,
        audioUrl: mediaUrl,
        duration,
        mimeType: audio.mimeType || DEFAULT_VOICE_MIME_TYPE,
        transcriptionStatus: "PROCESSING"
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return {
          recordingId: null,
          transcriptId: null,
          transcriptText: null,
          status: "SKIPPED_DUPLICATE"
        };
      }
      throw err;
    }

    const recordingId = recordingDoc._id.toString();

    // Step 3: Transcribe
    const transcription = await transcribeAudio(audio.buffer, audio.mimeType);

    if (!transcription) {
      await VoiceRecordingModel.updateOne(
        { _id: recordingId },
        { $set: { transcriptionStatus: "FAILED" } }
      );
      logVoice("transcription failed", { messageId, recordingId });
      return {
        recordingId,
        transcriptId: null,
        transcriptText: null,
        status: "FAILED",
        reason: "Transcription failed"
      };
    }

    // Step 4: Normalize conversational text
    const normalizedText = normalizeTranscript(transcription.text);

    // Step 5: Store transcript
    const transcriptDoc = await VoiceTranscriptModel.create({
      recordingId,
      transcriptText: normalizedText,
      language: transcription.language,
      confidence: transcription.confidence
    });

    // Step 6: Mark recording complete
    await VoiceRecordingModel.updateOne(
      { _id: recordingId },
      { $set: { transcriptionStatus: "COMPLETED" } }
    );

    logVoice("processed", {
      messageId,
      recordingId,
      transcriptId: transcriptDoc._id.toString(),
      language: transcription.language,
      textLength: normalizedText.length
    });

    return {
      recordingId,
      transcriptId: transcriptDoc._id.toString(),
      transcriptText: normalizedText,
      status: "COMPLETED"
    };
  }

  /**
   * Retrieve recording by source message ID.
   */
  async getRecordingByMessageId(messageId: string): Promise<VoiceRecording | null> {
    const doc = await VoiceRecordingModel.findOne({ sourceMessageId: messageId }).lean();
    if (!doc) return null;
    return {
      recordingId: doc._id.toString(),
      sourceMessageId: doc.sourceMessageId,
      senderUserId: doc.senderUserId,
      familyId: doc.familyId,
      audioUrl: doc.audioUrl,
      duration: doc.duration ?? null,
      mimeType: doc.mimeType,
      transcriptionStatus: doc.transcriptionStatus as VoiceRecording["transcriptionStatus"],
      createdAt: doc.createdAt.toISOString()
    };
  }

  /**
   * Retrieve transcript by recording ID.
   */
  async getTranscriptByRecordingId(recordingId: string): Promise<VoiceTranscript | null> {
    const doc = await VoiceTranscriptModel.findOne({ recordingId }).lean();
    if (!doc) return null;
    return {
      transcriptId: doc._id.toString(),
      recordingId: doc.recordingId,
      transcriptText: doc.transcriptText,
      language: doc.language || null,
      confidence: doc.confidence,
      createdAt: doc.createdAt.toISOString()
    };
  }

  /**
   * List pending recordings for retry processing.
   */
  async listPendingRecordings(limit = 50): Promise<VoiceRecording[]> {
    const docs = await VoiceRecordingModel.find({
      transcriptionStatus: { $in: ["PENDING", "FAILED"] }
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return docs.map((d) => ({
      recordingId: d._id.toString(),
      sourceMessageId: d.sourceMessageId,
      senderUserId: d.senderUserId,
      familyId: d.familyId,
      audioUrl: d.audioUrl,
      duration: d.duration ?? null,
      mimeType: d.mimeType,
      transcriptionStatus: d.transcriptionStatus as VoiceRecording["transcriptionStatus"],
      createdAt: d.createdAt.toISOString()
    }));
  }
}

export const voiceProcessingService = new VoiceProcessingService();
