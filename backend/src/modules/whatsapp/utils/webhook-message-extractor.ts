import { validateAndNormalizePhone } from "./phone-validation.js";
import { sanitizeWebhookPayload } from "./payload-sanitizer.js";
import type { InboundWhatsAppMessage } from "../types/whatsapp-message.types.js";
import type { WhatsAppStoredMessageType } from "../types/whatsapp-message.types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function waIdToE164(waId: string): string | null {
  const digits = waId.replace(/\D/g, "");
  if (!digits) return null;
  const withPlus = waId.startsWith("+") ? waId : `+${digits}`;
  const parsed = validateAndNormalizePhone(withPlus);
  return parsed.ok ? parsed.e164 : null;
}

function mapStoredMessageType(metaType: string): WhatsAppStoredMessageType {
  switch (metaType) {
    case "text":
      return "TEXT";
    case "audio":
    case "voice":
      return "AUDIO";
    case "image":
      return "IMAGE";
    default:
      return "UNKNOWN";
  }
}

function extractMediaRef(row: Record<string, unknown>, type: string): string | undefined {
  const media = asRecord(row[type]);
  if (!media) return undefined;
  if (typeof media.id === "string") return media.id;
  if (typeof media.link === "string") return media.link;
  return undefined;
}

function extractText(row: Record<string, unknown>, type: string): string | undefined {
  if (type === "text") {
    const text = asRecord(row.text);
    if (typeof text?.body === "string") return text.body.trim().slice(0, MAX_TEXT);
  }
  if (type === "button") {
    const button = asRecord(row.button);
    if (typeof button?.text === "string") return button.text.trim().slice(0, MAX_TEXT);
  }
  const interactive = asRecord(row.interactive);
  const body = asRecord(interactive?.body);
  if (typeof body?.text === "string") return body.text.trim().slice(0, MAX_TEXT);
  return undefined;
}

const MAX_TEXT = 8_192;

/**
 * Extracts storable inbound messages from a verified Meta webhook body.
 * Ignores status/account-only notifications.
 */
export function extractInboundWhatsAppMessages(body: unknown): InboundWhatsAppMessage[] {
  const root = asRecord(body);
  const out: InboundWhatsAppMessage[] = [];

  for (const entry of asArray(root?.entry)) {
    const entryRow = asRecord(entry);
    if (!entryRow) continue;

    for (const change of asArray(entryRow.changes)) {
      const changeRow = asRecord(change);
      if (!changeRow) continue;
      const value = asRecord(changeRow.value);
      if (!value) continue;

      for (const msg of asArray(value.messages)) {
        const row = asRecord(msg);
        if (!row) continue;

        const whatsappMessageId = typeof row.id === "string" ? row.id : "";
        const senderWaId = typeof row.from === "string" ? row.from : "";
        if (!whatsappMessageId || !senderWaId) continue;

        const e164 = waIdToE164(senderWaId);
        if (!e164) continue;

        const metaType = typeof row.type === "string" ? row.type : "unknown";
        const messageType = mapStoredMessageType(metaType);
        const tsRaw = row.timestamp;
        const tsSec =
          typeof tsRaw === "string" || typeof tsRaw === "number"
            ? Number(tsRaw)
            : NaN;
        const receivedAt = Number.isFinite(tsSec)
          ? new Date(tsSec * 1000)
          : new Date();

        const rawText = extractText(row, metaType);
        const mediaUrl =
          metaType === "audio" || metaType === "voice" || metaType === "image"
            ? extractMediaRef(row, metaType === "voice" ? "audio" : metaType)
            : extractMediaRef(row, "document");

        out.push({
          whatsappMessageId,
          senderWaId,
          senderPhoneE164: e164,
          receivedAt,
          messageType,
          rawText,
          mediaUrl,
          rawPayload: sanitizeWebhookPayload(row) as Record<string, unknown>
        });
      }
    }
  }

  return out;
}
