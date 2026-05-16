import { maskPhoneNumber } from "./phone-validation.js";
import type {
  WhatsAppWebhookEvent,
  WhatsAppWebhookEventKind,
  WhatsAppWebhookMessageType,
  WhatsAppWebhookParseResult
} from "../types/whatsapp-webhook.types.js";

function maskWaId(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  if (!digits) return "••••";
  return maskPhoneNumber(`+${digits}`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseMessageType(raw: unknown): WhatsAppWebhookMessageType {
  const t = typeof raw === "string" ? raw : "";
  const allowed: WhatsAppWebhookMessageType[] = [
    "text",
    "audio",
    "image",
    "video",
    "document",
    "sticker",
    "location",
    "contacts",
    "interactive",
    "button"
  ];
  return allowed.includes(t as WhatsAppWebhookMessageType) ? (t as WhatsAppWebhookMessageType) : "unknown";
}

function parseMessages(value: unknown, phoneNumberId?: string): WhatsAppWebhookEvent[] {
  const events: WhatsAppWebhookEvent[] = [];
  for (const msg of asArray(value)) {
    const row = asRecord(msg);
    if (!row) continue;
    const from = typeof row.from === "string" ? row.from : undefined;
    const ts = typeof row.timestamp === "string" ? row.timestamp : String(row.timestamp ?? "");
    events.push({
      kind: "message",
      messageType: parseMessageType(row.type),
      senderMasked: from ? maskWaId(from) : undefined,
      timestamp: ts || undefined,
      messageId: typeof row.id === "string" ? row.id : undefined,
      phoneNumberId
    });
  }
  return events;
}

function parseStatuses(value: unknown, phoneNumberId?: string): WhatsAppWebhookEvent[] {
  const events: WhatsAppWebhookEvent[] = [];
  for (const row of asArray(value)) {
    const status = asRecord(row);
    if (!status) continue;
    const recipient = typeof status.recipient_id === "string" ? status.recipient_id : undefined;
    const ts =
      typeof status.timestamp === "string" ? status.timestamp : String(status.timestamp ?? "");
    events.push({
      kind: "status",
      status: typeof status.status === "string" ? status.status : undefined,
      recipientMasked: recipient ? maskWaId(recipient) : undefined,
      timestamp: ts || undefined,
      messageId: typeof status.id === "string" ? status.id : undefined,
      phoneNumberId
    });
  }
  return events;
}

function inferKindFromField(field: string, value: Record<string, unknown>): WhatsAppWebhookEventKind {
  if (field === "messages" || asArray(value.messages).length > 0) return "message";
  if (asArray(value.statuses).length > 0) return "status";
  if (field.includes("account") || field.includes("phone_number")) return "account_update";
  return "unknown";
}

/**
 * Parses Meta webhook JSON into sanitized events (no secrets, no message bodies).
 */
export function parseWhatsAppWebhookPayload(body: unknown): WhatsAppWebhookParseResult {
  const root = asRecord(body);
  const objectType = typeof root?.object === "string" ? root.object : undefined;
  const events: WhatsAppWebhookEvent[] = [];
  let changeCount = 0;

  for (const entry of asArray(root?.entry)) {
    const entryRow = asRecord(entry);
    if (!entryRow) continue;
    for (const change of asArray(entryRow.changes)) {
      changeCount += 1;
      const changeRow = asRecord(change);
      if (!changeRow) continue;
      const field = typeof changeRow.field === "string" ? changeRow.field : "unknown";
      const value = asRecord(changeRow.value);
      if (!value) {
        events.push({ kind: "unknown", field });
        continue;
      }

      const metadata = asRecord(value.metadata);
      const phoneNumberId =
        typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : undefined;

      const messageEvents = parseMessages(value.messages, phoneNumberId);
      const statusEvents = parseStatuses(value.statuses, phoneNumberId);
      events.push(...messageEvents, ...statusEvents);

      if (messageEvents.length === 0 && statusEvents.length === 0) {
        events.push({
          kind: inferKindFromField(field, value),
          field,
          phoneNumberId
        });
      }
    }
  }

  return {
    objectType,
    events,
    entryCount: asArray(root?.entry).length,
    changeCount
  };
}

/** Compact log-safe summary (no raw payload). */
export function summarizeWebhookForLog(parsed: WhatsAppWebhookParseResult): Record<string, unknown> {
  return {
    object: parsed.objectType ?? "unknown",
    entries: parsed.entryCount,
    changes: parsed.changeCount,
    events: parsed.events.map((e) => ({
      kind: e.kind,
      type: e.messageType,
      sender: e.senderMasked,
      recipient: e.recipientMasked,
      status: e.status,
      timestamp: e.timestamp,
      messageId: e.messageId ? `${e.messageId.slice(0, 8)}…` : undefined
    }))
  };
}
