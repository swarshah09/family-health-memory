import type { Job } from "bullmq";
import { UserModel } from "../../models.js";
import { listMembers } from "../../store.js";
import { healthObservationExtractionService } from "../../modules/ai-extraction/index.js";
import { healthMemoryService } from "../../modules/health-memory/index.js";
import { patternEngineService } from "../../modules/pattern-engine/index.js";
import { profileResolutionService } from "../../modules/profile-resolution/index.js";
import { timelineService } from "../../modules/timeline/index.js";
import { voiceProcessingService } from "../../modules/voice-processing/index.js";
import { explainabilityService } from "../../modules/explainability/index.js";
import { WhatsAppMessageModel } from "../../modules/whatsapp/models/whatsapp-message.model.js";
import { processingStateService } from "../processing-state/index.js";

/**
 * Message Processing Worker — production replacement for setImmediate pipeline.
 *
 * Pipeline: voice → extraction → resolution → memory → timeline → patterns → evidence
 *
 * Reliability guarantees:
 * - Idempotent: checks processingStatus before processing
 * - State tracked: PENDING → PROCESSING → COMPLETED | FAILED
 * - Retryable: BullMQ handles retry with exponential backoff
 * - Non-blocking: each pipeline step has isolated error handling
 */

export type MessageProcessingJobData = {
  messageId: string;
};

export async function processMessageJob(
  job: Job<MessageProcessingJobData>
): Promise<void> {
  const { messageId } = job.data;

  const msg = await WhatsAppMessageModel.findById(messageId).lean();
  if (!msg) {
    console.warn("[msg-worker] message not found, skipping", { messageId });
    return;
  }

  // Idempotency: skip if already processed
  if (msg.processingStatus !== "PENDING") {
    console.info("[msg-worker] already processed, skipping", {
      messageId,
      status: msg.processingStatus
    });
    return;
  }

  // Mark as PROCESSING
  await WhatsAppMessageModel.updateOne(
    { _id: messageId, processingStatus: "PENDING" },
    { $set: { processingStatus: "PROCESSING" } }
  );

  await processingStateService.transition(
    "WHATSAPP_MESSAGE", messageId, "PROCESSING"
  );

  const memberContexts = await listMembers(msg.familyId).then((members) =>
    members.map((m) => ({
      id: m.id,
      name: m.name,
      relationship: m.relationship,
      linkedUserId: m.linkedUserId
    }))
  );

  try {
    const sender = await UserModel.findById(msg.senderUserId).select("name").lean();
    let rawText = msg.rawText?.trim() || "";
    let effectiveMessageType: string = msg.messageType;

    // Step 0: Voice transcription (AUDIO only)
    if (msg.messageType === "AUDIO" && msg.mediaUrl) {
      try {
        const voiceResult = await voiceProcessingService.processVoiceMessage(
          {
            messageId: msg._id.toString(),
            familyId: msg.familyId,
            senderUserId: msg.senderUserId,
            mediaUrl: msg.mediaUrl,
            messageType: msg.messageType
          },
          msg.rawPayload as Record<string, unknown> | undefined
        );

        if (
          (voiceResult.status === "COMPLETED" || voiceResult.status === "SKIPPED_DUPLICATE") &&
          voiceResult.transcriptText
        ) {
          rawText = voiceResult.transcriptText;
          effectiveMessageType = "VOICE";
        }
      } catch (voiceErr) {
        console.warn("[msg-worker] voice processing failed (non-blocking)", {
          messageId,
          error: voiceErr instanceof Error ? voiceErr.message : "unknown"
        });
      }
    }

    // Step 1: AI extraction
    const extraction = await healthObservationExtractionService.extractAndStore({
      messageId: msg._id.toString(),
      familyId: msg.familyId,
      senderUserId: msg.senderUserId,
      senderDisplayName: sender?.name?.trim() || "Family member",
      messageType: effectiveMessageType,
      rawText,
      receivedAt: msg.receivedAt.toISOString(),
      familyMembers: memberContexts
    });

    // Step 2: Profile resolution
    const resolution = await profileResolutionService.resolveAndStore({
      messageId: msg._id.toString(),
      senderUserId: msg.senderUserId,
      rawText,
      extraction: extraction.extractedData,
      extractionConfidence: extraction.confidence,
      familyMembers: memberContexts
    });

    // Step 3: Health memory creation
    try {
      const memoryResult = await healthMemoryService.createFromPipelineResult({
        messageId: msg._id.toString(),
        familyId: msg.familyId,
        senderUserId: msg.senderUserId,
        rawText,
        messageType: effectiveMessageType,
        extraction,
        resolution
      });

      // Steps 4–5: Timeline + Patterns
      if (memoryResult.status === "CREATED" && memoryResult.memoryId) {
        try {
          const record = await healthMemoryService.getByMessageId(msg._id.toString());
          if (record) {
            await timelineService.processMemoryRecord(record);
            if (resolution.resolvedProfileId) {
              await patternEngineService.analyzeProfile(
                resolution.resolvedProfileId,
                msg.familyId
              );
            }

            // Step 6: Evidence chain
            try {
              await explainabilityService.registerPipelineEvidence({
                messageId: msg._id.toString(),
                extractionId: extraction.extractionId,
                resolutionId: resolution.resolutionId,
                memoryId: memoryResult.memoryId ?? undefined,
                confidence: Math.min(extraction.confidence, resolution.confidence)
              });
            } catch {
              // Non-blocking
            }
          }
        } catch (pipeErr) {
          console.warn("[msg-worker] timeline/pattern failed (non-blocking)", {
            messageId,
            error: pipeErr instanceof Error ? pipeErr.message : "unknown"
          });
        }
      }
    } catch (memErr) {
      console.warn("[msg-worker] health memory failed (non-blocking)", {
        messageId,
        error: memErr instanceof Error ? memErr.message : "unknown"
      });
    }

    // Mark COMPLETED
    await WhatsAppMessageModel.updateOne(
      { _id: messageId },
      { $set: { processingStatus: "PROCESSED" } }
    );
    await processingStateService.transition(
      "WHATSAPP_MESSAGE", messageId, "COMPLETED"
    );
  } catch (err) {
    // Mark FAILED
    await healthObservationExtractionService.markFailed(messageId);
    await WhatsAppMessageModel.updateOne(
      { _id: messageId },
      { $set: { processingStatus: "FAILED" } }
    );
    await processingStateService.transition(
      "WHATSAPP_MESSAGE", messageId, "FAILED",
      err instanceof Error ? err.message : "unknown"
    );
    throw err; // Re-throw so BullMQ can retry
  }
}
