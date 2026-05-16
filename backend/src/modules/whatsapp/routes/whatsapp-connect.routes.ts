import { Router } from "express";
import { authMiddleware } from "../../../auth.js";
import * as connectionController from "../controllers/whatsapp-connection.controller.js";
import {
  whatsappConnectInitiateLimiter,
  whatsappConnectVerifyLimiter
} from "../utils/whatsapp-rate-limit.js";

/**
 * Authenticated WhatsApp account linking (identity mapping only).
 */
export function createWhatsAppConnectRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get("/connection/status", connectionController.getConnectionStatus);
  router.post(
    "/connect/initiate",
    whatsappConnectInitiateLimiter,
    connectionController.initiateConnect
  );
  router.post("/connect/verify", whatsappConnectVerifyLimiter, connectionController.verifyConnect);
  router.delete("/connect", connectionController.disconnectWhatsApp);

  return router;
}
