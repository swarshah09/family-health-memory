import { UserModel } from "../../../models.js";
import { listMembers } from "../../../store.js";
import { healthObservationExtractionService } from "../../ai-extraction/index.js";
import { healthMemoryService } from "../../health-memory/index.js";
import { patternEngineService } from "../../pattern-engine/index.js";
import { profileResolutionService } from "../../profile-resolution/index.js";
import { timelineService } from "../../timeline/index.js";
import { voiceProcessingService } from "../../voice-processing/index.js";
import { explainabilityService } from "../../explainability/index.js";
import { getQueue, QUEUE_NAMES } from "../../../infrastructure/queue/index.js";
import { WhatsAppMessageModel } from "../models/whatsapp-message.model.js";
import type { WhatsAppMessageDto, WhatsAppMessageProcessingStatus } from "../types/whatsapp-message.types.js";

function mapDoc(doc: {
  _id: { toString(): string };
  whatsappMessageId: string;
  senderPhoneNumber: string;
  senderUserId: string;
  familyId: string;
  messageType: string;
  rawText?: string | null;
  mediaUrl?: string | null;
  receivedAt: Date;
  processingStatus: string;
}): WhatsAppMessageDto {
  return {
    messageId: doc._id.toString(),
    whatsappMessageId: doc.whatsappMessageId,
    senderPhoneNumber: doc.senderPhoneNumber,
    senderUserId: doc.senderUserId,
    familyId: doc.familyId,
    messageType: doc.messageType as WhatsAppMessageDto["messageType"],
    rawText: doc.rawText ?? undefined,
    mediaUrl: doc.mediaUrl ?? undefined,
    receivedAt: doc.receivedAt.toISOString(),
    processingStatus: doc.processingStatus as WhatsAppMessageProcessingStatus
  };
}

/**
 * Background pipeline:
 * [AUDIO] voice transcription → extraction → resolution → memory → timeline → patterns
 * [TEXT]  extraction → resolution → memory → timeline → patterns
 */
export class WhatsAppMessageProcessingService {
  /**
   * Enqueues a message for background processing via BullMQ.
   * Falls back to setImmediate if Redis is unavailable.
   */
  enqueue(messageId: string): void {
    const queue = getQueue(QUEUE_NAMES.WHATSAPP_INGESTION);
    queue
      .add("process-message", { messageId }, { jobId: `msg-${messageId}` })
      .then(() => {
        console.info("[whatsapp-process] enqueued", { messageId });
      })
      .catch((err) => {
        console.warn("[whatsapp-process] queue unavailable, falling back to setImmediate", {
          messageId,
          error: err instanceof Error ? err.message : "unknown"
        });
        // Fallback: process in-memory if Redis is down
        setImmediate(() => {
          void this.processMessage(messageId).catch((processErr) => {
            console.error(
              "[whatsapp-process] fallback processing error",
              messageId,
              processErr instanceof Error ? processErr.message : processErr
            );
          });
        });
      });
  }

  async processMessage(messageId: string): Promise<void> {
    const msg = await WhatsAppMessageModel.findById(messageId).lean();
    if (!msg || msg.processingStatus !== "PENDING") return;

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

      // Step 0: Voice transcription (for AUDIO messages only)
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

          if (voiceResult.status === "COMPLETED" && voiceResult.transcriptText) {
            rawText = voiceResult.transcriptText;
            effectiveMessageType = "VOICE";
            console.info("[whatsapp-process] voice transcribed", {
              messageId,
              recordingId: voiceResult.recordingId,
              textLength: rawText.length
            });
          } else if (voiceResult.status === "SKIPPED_DUPLICATE" && voiceResult.transcriptText) {
            rawText = voiceResult.transcriptText;
            effectiveMessageType = "VOICE";
          } else {
            console.warn("[whatsapp-process] voice transcription did not produce text", {
              messageId,
              status: voiceResult.status,
              reason: voiceResult.reason
            });
            // Continue with empty text — extraction will handle gracefully
          }
        } catch (voiceErr) {
          console.warn("[whatsapp-process] voice processing failed (non-blocking)", {
            messageId,
            error: voiceErr instanceof Error ? voiceErr.message : "unknown"
          });
          // Continue pipeline with empty rawText — won't produce useful extraction
          // but won't block the pipeline
        }
      }

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

      const resolution = await profileResolutionService.resolveAndStore({
        messageId: msg._id.toString(),
        senderUserId: msg.senderUserId,
        rawText,
        extraction: extraction.extractedData,
        extractionConfidence: extraction.confidence,
        familyMembers: memberContexts
      });

      // Step 3: Health memory creation (non-blocking — failures are logged, not thrown)
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

        // Steps 4–5: Timeline processing + Pattern analysis (non-blocking)
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

              // Step 6: Register evidence chain (non-blocking)
              try {
                await explainabilityService.registerPipelineEvidence({
                  messageId: msg._id.toString(),
                  extractionId: extraction.extractionId,
                  resolutionId: resolution.resolutionId,
                  memoryId: memoryResult.memoryId ?? undefined,
                  confidence: Math.min(extraction.confidence, resolution.confidence)
                });
              } catch (evidenceErr) {
                console.warn("[whatsapp-process] evidence registration failed (non-blocking)", {
                  messageId,
                  error: evidenceErr instanceof Error ? evidenceErr.message : "unknown"
                });
              }
            }
          } catch (pipeErr) {
            console.warn("[whatsapp-process] timeline/pattern failed (non-blocking)", {
              messageId,
              error: pipeErr instanceof Error ? pipeErr.message : "unknown"
            });
          }
        }
      } catch (memErr) {
        console.warn("[whatsapp-process] health memory creation failed (non-blocking)", {
          messageId,
          error: memErr instanceof Error ? memErr.message : "unknown"
        });
      }

      await this.markStatus(messageId, "PROCESSED");
    } catch (err) {
      await healthObservationExtractionService.markFailed(messageId);
      await this.markStatus(messageId, "FAILED");
      console.warn("[whatsapp-process] pipeline failed", {
        messageId,
        error: err instanceof Error ? err.message : "unknown"
      });
    }
  }

  async listPending(limit = 50): Promise<WhatsAppMessageDto[]> {
    const rows = await WhatsAppMessageModel.find({ processingStatus: "PENDING" })
      .sort({ receivedAt: 1 })
      .limit(limit)
      .lean();
    return rows.map((row) => mapDoc(row as Parameters<typeof mapDoc>[0]));
  }

  async markStatus(
    messageId: string,
    status: WhatsAppMessageProcessingStatus
  ): Promise<void> {
    await WhatsAppMessageModel.updateOne(
      { _id: messageId },
      { $set: { processingStatus: status } }
    );
  }
}

export const whatsappMessageProcessingService = new WhatsAppMessageProcessingService();
