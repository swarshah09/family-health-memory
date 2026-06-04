import { UserModel } from "../../../models.js";
import { WhatsAppMessageModel } from "../models/whatsapp-message.model.js";
import { whatsappConnectionService } from "./whatsapp-connection.service.js";
import { whatsappMessageProcessingService } from "./whatsapp-message-processing.service.js";
import { maskPhoneNumber } from "../utils/phone-validation.js";
import { extractInboundWhatsAppMessages } from "../utils/webhook-message-extractor.js";
import type { InboundWhatsAppMessage, WhatsAppIngestionResult } from "../types/whatsapp-message.types.js";

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

function logIngest(
  level: "info" | "warn",
  msg: string,
  fields: Record<string, unknown>
): void {
  const isProd = process.env.NODE_ENV === "production";
  const line = { scope: "whatsapp-ingest", ...fields };
  if (level === "warn") {
    console.warn(`[whatsapp-ingest] ${msg}`, isProd ? line : { ...line, detail: fields });
    return;
  }
  console.info(`[whatsapp-ingest] ${msg}`, line);
}

/**
 * Ingestion only: resolve identity, persist messages, enqueue for future processing.
 */
export class WhatsAppIngestionService {
  async ingestWebhookBody(body: unknown): Promise<WhatsAppIngestionResult> {
    const inbound = extractInboundWhatsAppMessages(body);
    const result: WhatsAppIngestionResult = {
      received: inbound.length,
      stored: 0,
      skipped: 0,
      duplicate: 0,
      unlinked: 0,
      errors: 0
    };

    for (const message of inbound) {
      try {
        const outcome = await this.ingestOne(message);
        if (outcome === "stored") result.stored += 1;
        else if (outcome === "duplicate") result.duplicate += 1;
        else if (outcome === "unlinked") result.unlinked += 1;
        else result.skipped += 1;
      } catch (err) {
        result.errors += 1;
        logIngest("warn", "ingestion failed", {
          type: message.messageType,
          sender: maskPhoneNumber(message.senderPhoneE164),
          error: err instanceof Error ? err.message : "unknown"
        });
      }
    }

    if (result.stored > 0 || result.unlinked > 0) {
      logIngest("info", "batch complete", {
        received: result.received,
        stored: result.stored,
        duplicate: result.duplicate,
        unlinked: result.unlinked,
        skipped: result.skipped,
        errors: result.errors
      });
    }

    return result;
  }

  private async ingestOne(
    message: InboundWhatsAppMessage
  ): Promise<"stored" | "duplicate" | "unlinked" | "skipped"> {
    const link = await whatsappConnectionService.findVerifiedUserByPhone(message.senderPhoneE164);
    if (!link) {
      logIngest("warn", "unlinked sender", {
        type: message.messageType,
        sender: maskPhoneNumber(message.senderPhoneE164)
      });
      return "unlinked";
    }

    const user = await UserModel.findById(link.userId).select("familyId").lean();
    if (!user?.familyId) {
      logIngest("warn", "sender not in family workspace", {
        type: message.messageType,
        sender: maskPhoneNumber(message.senderPhoneE164)
      });
      return "skipped";
    }

    try {
      const doc = await WhatsAppMessageModel.create({
        whatsappMessageId: message.whatsappMessageId,
        senderPhoneNumber: message.senderPhoneE164,
        senderUserId: link.userId,
        familyId: user.familyId,
        messageType: message.messageType,
        rawPayload: message.rawPayload,
        rawText: message.rawText,
        mediaUrl: message.mediaUrl,
        receivedAt: message.receivedAt,
        processingStatus: "PENDING"
      });

      await whatsappMessageProcessingService.enqueue(doc._id.toString());

      logIngest("info", "stored", {
        type: message.messageType,
        sender: maskPhoneNumber(message.senderPhoneE164),
        success: true
      });

      return "stored";
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        logIngest("info", "duplicate ignored", {
          type: message.messageType,
          sender: maskPhoneNumber(message.senderPhoneE164)
        });
        return "duplicate";
      }
      throw err;
    }
  }
}

export const whatsappIngestionService = new WhatsAppIngestionService();
