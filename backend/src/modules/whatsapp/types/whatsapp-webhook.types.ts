/**
 * Meta WhatsApp Cloud API webhook shapes (subset for routing/logging).
 * Ingestion logic will consume {@link WhatsAppWebhookEvent} in a later phase.
 */

export type WhatsAppWebhookMessageType =
  | "text"
  | "audio"
  | "image"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "interactive"
  | "button"
  | "unknown";

export type WhatsAppWebhookEventKind = "message" | "status" | "account_update" | "unknown";

/** Sanitized event safe for logs and future handlers. */
export type WhatsAppWebhookEvent = {
  kind: WhatsAppWebhookEventKind;
  messageType?: WhatsAppWebhookMessageType;
  /** Masked sender (messages) */
  senderMasked?: string;
  /** Masked recipient (statuses) */
  recipientMasked?: string;
  timestamp?: string;
  messageId?: string;
  status?: string;
  phoneNumberId?: string;
  field?: string;
};

export type WhatsAppWebhookParseResult = {
  objectType?: string;
  events: WhatsAppWebhookEvent[];
  entryCount: number;
  changeCount: number;
};

export type WhatsAppWebhookVerifyQuery = {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
};
