import { getWhatsAppEnvConfig } from "../utils/whatsapp-env.js";
import {
  parseWhatsAppWebhookPayload,
  summarizeWebhookForLog
} from "../utils/webhook-payload-parser.js";
import { verifyMetaWebhookSignature } from "../utils/webhook-signature.js";
import type { WhatsAppWebhookVerifyQuery } from "../types/whatsapp-webhook.types.js";

export type WebhookVerifyResult =
  | { ok: true; challenge: string }
  | { ok: false; reason: "missing_params" | "invalid_mode" | "invalid_token" | "token_not_configured" };

export type WebhookReceiveResult = {
  accepted: boolean;
  signatureValid: boolean;
  phoneNumberIdMatch: boolean;
  summary: Record<string, unknown>;
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
   * Lightweight receive handler: validate signature, parse structure, log summary.
   * No health-memory ingestion.
   */
  receiveWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    parsedJson: unknown
  ): WebhookReceiveResult {
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

    const parsed = parseWhatsAppWebhookPayload(parsedJson);
    const phoneNumberIdMatch =
      !phoneNumberId ||
      parsed.events.every((e) => !e.phoneNumberId || e.phoneNumberId === phoneNumberId);

    if (phoneNumberId && !phoneNumberIdMatch) {
      console.warn("[whatsapp-webhook] phone_number_id mismatch", {
        expected: `${phoneNumberId.slice(0, 4)}…`
      });
    }

    const summary = summarizeWebhookForLog(parsed);
    console.info("[whatsapp-webhook] inbound", summary);

    for (const event of parsed.events) {
      console.info("[whatsapp-webhook] event", {
        kind: event.kind,
        messageType: event.messageType,
        sender: event.senderMasked,
        recipient: event.recipientMasked,
        status: event.status,
        timestamp: event.timestamp
      });
    }

    return {
      accepted: true,
      signatureValid,
      phoneNumberIdMatch,
      summary
    };
  }
}

export const whatsappWebhookService = new WhatsAppWebhookService();
