import { getWhatsAppEnvConfig } from "../utils/whatsapp-env.js";
import { summarizeWebhookForLog } from "../utils/webhook-payload-parser.js";
import { verifyMetaWebhookSignature } from "../utils/webhook-signature.js";
import { whatsappIngestionService } from "./whatsapp-ingestion.service.js";
import type { WhatsAppWebhookVerifyQuery } from "../types/whatsapp-webhook.types.js";
import type { WhatsAppIngestionResult } from "../types/whatsapp-message.types.js";

export type WebhookVerifyResult =
  | { ok: true; challenge: string }
  | { ok: false; reason: "missing_params" | "invalid_mode" | "invalid_token" | "token_not_configured" };

export type WebhookReceiveResult = {
  accepted: boolean;
  signatureValid: boolean;
  phoneNumberIdMatch: boolean;
  summary: Record<string, unknown>;
  ingestion?: WhatsAppIngestionResult;
};

export class WhatsAppWebhookService {
  verifySubscription(query: WhatsAppWebhookVerifyQuery): WebhookVerifyResult {
    const { verifyToken } = getWhatsAppEnvConfig();
    if (!verifyToken) {
      return { ok: false, reason: "token_not_configured" };
    }
    if (!query.mode || !query.verifyToken || !query.challenge) {
      return { ok: false, reason: "missing_params" };
    }
    if (query.mode !== "subscribe") {
      return { ok: false, reason: "invalid_mode" };
    }
    if (query.verifyToken !== verifyToken) {
      return { ok: false, reason: "invalid_token" };
    }
    return { ok: true, challenge: query.challenge };
  }

  /**
   * Validate signature, ingest storable messages, log compact summary.
   */
  async receiveWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    parsedJson: unknown
  ): Promise<WebhookReceiveResult> {
    const { phoneNumberId, appSecret } = getWhatsAppEnvConfig();
    let signatureValid = true;

    if (appSecret) {
      signatureValid = verifyMetaWebhookSignature(rawBody, signatureHeader, appSecret);
      if (!signatureValid) {
        console.warn("[whatsapp-webhook] Invalid X-Hub-Signature-256");
        return {
          accepted: false,
          signatureValid: false,
          phoneNumberIdMatch: false,
          summary: { error: "invalid_signature" }
        };
      }
    } else if (process.env.NODE_ENV === "production") {
      console.warn("[whatsapp-webhook] WHATSAPP_APP_SECRET not set — skipping signature check");
    }

    const ingestion = await whatsappIngestionService.ingestWebhookBody(parsedJson);

    const isProd = process.env.NODE_ENV === "production";
    if (!isProd) {
      const { parseWhatsAppWebhookPayload } = await import("../utils/webhook-payload-parser.js");
      const parsed = parseWhatsAppWebhookPayload(parsedJson);
      const phoneNumberIdMatch =
        !phoneNumberId ||
        parsed.events.every((e) => !e.phoneNumberId || e.phoneNumberId === phoneNumberId);

      if (phoneNumberId && !phoneNumberIdMatch) {
        console.warn("[whatsapp-webhook] phone_number_id mismatch", {
          expected: `${phoneNumberId.slice(0, 4)}…`
        });
      }

      console.info("[whatsapp-webhook] inbound", summarizeWebhookForLog(parsed));
    }

    return {
      accepted: true,
      signatureValid,
      phoneNumberIdMatch: true,
      summary: {
        stored: ingestion.stored,
        received: ingestion.received,
        unlinked: ingestion.unlinked,
        duplicate: ingestion.duplicate
      },
      ingestion
    };
  }
}

export const whatsappWebhookService = new WhatsAppWebhookService();
