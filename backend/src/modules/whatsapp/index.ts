/**
 * WhatsApp integration module — input channel for family health memory ingestion.
 */

export {
  registerWhatsAppRoutes,
  registerWhatsAppWebhookRoutes,
  registerWhatsAppConnectRoutes,
  createWhatsAppWebhookRouter
} from "./routes/whatsapp.routes.js";
export { whatsappWebhookService, WhatsAppWebhookService } from "./services/whatsapp-webhook.service.js";
export { whatsappIngestionService, WhatsAppIngestionService } from "./services/whatsapp-ingestion.service.js";
export {
  whatsappMessageProcessingService,
  WhatsAppMessageProcessingService
} from "./services/whatsapp-message-processing.service.js";
export { WhatsAppMessageModel } from "./models/whatsapp-message.model.js";
export {
  whatsappConnectionService,
  WhatsAppConnectionService,
  WhatsAppConnectionError
} from "./services/whatsapp-connection.service.js";
export { WhatsAppConnectionModel } from "./models/whatsapp-connection.model.js";
export type {
  WhatsAppEnvConfig,
  WhatsAppConnectionStatusDto,
  WhatsAppConnectInitiateResponse
} from "./types/whatsapp.types.js";
export type {
  WhatsAppWebhookEvent,
  WhatsAppWebhookParseResult,
  WhatsAppWebhookMessageType
} from "./types/whatsapp-webhook.types.js";
export type {
  WhatsAppIngestionResult,
  WhatsAppMessageDto,
  WhatsAppStoredMessageType,
  WhatsAppMessageProcessingStatus
} from "./types/whatsapp-message.types.js";
export { getWhatsAppEnvConfig, isWhatsAppConfigured } from "./utils/whatsapp-env.js";
export { validateAndNormalizePhone, maskPhoneNumber } from "./utils/phone-validation.js";
export { parseWhatsAppWebhookPayload, summarizeWebhookForLog } from "./utils/webhook-payload-parser.js";
