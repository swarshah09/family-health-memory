/**
 * WhatsApp Cloud API domain types.
 * Business logic and payload shapes will be expanded in later phases.
 */

/** Runtime configuration loaded from environment variables. */
export type WhatsAppEnvConfig = {
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string;
  /** Meta app secret for webhook HMAC validation */
  appSecret: string;
};

/** Placeholder for inbound webhook dispatch metadata. */
export type WhatsAppWebhookContext = {
  receivedAt: string;
};

/** Placeholder service result — replace when ingestion pipeline is implemented. */
export type WhatsAppServiceResult = {
  handled: boolean;
  message: string;
};

export type WhatsAppConnectionStatusDto = {
  connectionId?: string;
  connected: boolean;
  pendingVerification: boolean;
  /** Masked E.164 when connected */
  whatsappPhoneNumber?: string;
  /** Masked number while awaiting code */
  phonePending?: string;
  verifiedAt?: string;
};

export type WhatsAppConnectInitiateResponse = {
  status: WhatsAppConnectionStatusDto;
  message: string;
  /** Only in local dev when WhatsApp API is not configured */
  devCode?: string;
};
