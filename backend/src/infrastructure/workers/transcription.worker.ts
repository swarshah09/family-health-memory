import type { Job } from "bullmq";
import { voiceProcessingService } from "../../modules/voice-processing/index.js";
import { processingStateService } from "../processing-state/index.js";

/**
 * Transcription Worker — dedicated worker for voice transcription jobs.
 *
 * Separated from the main pipeline worker to allow:
 * - Independent retry policies (Whisper API has different failure modes)
 * - Independent concurrency limits (Whisper is expensive)
 * - Queue-based backpressure for audio processing
 */

export type TranscriptionJobData = {
  messageId: string;
  familyId: string;
  senderUserId: string;
  mediaUrl: string;
  messageType: string;
  rawPayload?: Record<string, unknown>;
};

export async function processTranscriptionJob(
  job: Job<TranscriptionJobData>
): Promise<{ status: string; transcriptText?: string }> {
  const { messageId, familyId, senderUserId, mediaUrl, messageType, rawPayload } = job.data;

  await processingStateService.transition(
    "VOICE_TRANSCRIPTION", messageId, "PROCESSING"
  );

  try {
    const result = await voiceProcessingService.processVoiceMessage(
      { messageId, familyId, senderUserId, mediaUrl, messageType },
      rawPayload
    );

    await processingStateService.transition(
      "VOICE_TRANSCRIPTION", messageId, "COMPLETED"
    );

    return {
      status: result.status,
      transcriptText: result.transcriptText ?? undefined
    };
  } catch (err) {
    await processingStateService.transition(
      "VOICE_TRANSCRIPTION", messageId, "FAILED",
      err instanceof Error ? err.message : "unknown"
    );
    throw err; // Re-throw for BullMQ retry
  }
}
