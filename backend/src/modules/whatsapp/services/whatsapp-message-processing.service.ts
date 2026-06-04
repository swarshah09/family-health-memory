import { UserModel } from "../../../models.js";
import { listMembers } from "../../../store.js";
import { healthObservationExtractionService } from "../../ai-extraction/index.js";
import { profileResolutionService } from "../../profile-resolution/index.js";
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
 * Background pipeline: AI extraction → profile resolution (no health logs or insights).
 */
export class WhatsAppMessageProcessingService {
  enqueue(messageId: string): void {
    setImmediate(() => {
      void this.processMessage(messageId).catch((err) => {
        console.error(
          "[whatsapp-process] unhandled error",
          messageId,
          err instanceof Error ? err.message : err
        );
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
      const rawText = msg.rawText?.trim() || "";

      const extraction = await healthObservationExtractionService.extractAndStore({
        messageId: msg._id.toString(),
        familyId: msg.familyId,
        senderUserId: msg.senderUserId,
        senderDisplayName: sender?.name?.trim() || "Family member",
        messageType: msg.messageType,
        rawText,
        receivedAt: msg.receivedAt.toISOString(),
        familyMembers: memberContexts
      });

      await profileResolutionService.resolveAndStore({
        messageId: msg._id.toString(),
        senderUserId: msg.senderUserId,
        rawText,
        extraction: extraction.extractedData,
        extractionConfidence: extraction.confidence,
        familyMembers: memberContexts
      });

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
