export type WhatsAppStoredMessageType = "TEXT" | "AUDIO" | "IMAGE" | "UNKNOWN";

export type WhatsAppMessageProcessingStatus = "PENDING" | "PROCESSED" | "FAILED";

/** Normalized inbound message extracted from a Meta webhook (pre-storage). */
export type InboundWhatsAppMessage = {
  whatsappMessageId: string;
  senderWaId: string;
  senderPhoneE164: string;
  receivedAt: Date;
  messageType: WhatsAppStoredMessageType;
  rawText?: string;
  /** Media object id or URL reference from Meta (not downloaded yet). */
  mediaUrl?: string;
  /** Sanitized single-message payload slice. */
  rawPayload: Record<string, unknown>;
};

export type WhatsAppIngestionResult = {
  received: number;
  stored: number;
  skipped: number;
  duplicate: number;
  unlinked: number;
  errors: number;
};

export type WhatsAppMessageDto = {
  messageId: string;
  whatsappMessageId: string;
  senderPhoneNumber: string;
  senderUserId: string;
  familyId: string;
  messageType: WhatsAppStoredMessageType;
  rawText?: string;
  mediaUrl?: string;
  receivedAt: string;
  processingStatus: WhatsAppMessageProcessingStatus;
};
