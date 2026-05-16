import type { WhatsAppEnvConfig } from "../types/whatsapp.types.js";

/**
 * Reads WhatsApp integration env vars. Does not validate or call external APIs.
 */
export function getWhatsAppEnvConfig(): WhatsAppEnvConfig {
  return {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "",
    appSecret: process.env.WHATSAPP_APP_SECRET?.trim() ?? ""
  };
}

export function isWhatsAppConfigured(): boolean {
  const { verifyToken, accessToken, phoneNumberId } = getWhatsAppEnvConfig();
  return Boolean(verifyToken && accessToken && phoneNumberId);
}
