import type { Express, Router } from "express";
import express, { Router as createRouter } from "express";
import rateLimit from "express-rate-limit";
import * as webhookController from "../controllers/whatsapp-webhook.controller.js";
import { createWhatsAppConnectRouter } from "./whatsapp-connect.routes.js";

const WEBHOOK_BASE = "/api/whatsapp";

const webhookBodyLimit = process.env.WHATSAPP_WEBHOOK_BODY_LIMIT?.trim() || "256kb";

const webhookPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.WHATSAPP_WEBHOOK_RATE_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many webhook requests" }
});

/**
 * Meta webhook routes — must register BEFORE `express.json()` so POST retains raw body for HMAC.
 */
export function registerWhatsAppWebhookRoutes(app: Express): void {
  app.get(`${WEBHOOK_BASE}/webhook`, webhookController.verifyWebhook);
  app.post(
    `${WEBHOOK_BASE}/webhook`,
    webhookPostLimiter,
    express.raw({ type: "application/json", limit: webhookBodyLimit }),
    webhookController.handleWebhook
  );
}

/**
 * Public webhook router (GET only) — used if mounted on a sub-router; POST is registered via {@link registerWhatsAppWebhookRoutes}.
 */
export function createWhatsAppWebhookRouter(): Router {
  const router = createRouter();
  router.get("/webhook", webhookController.verifyWebhook);
  return router;
}

/** Authenticated account-linking routes (after JSON body parser). */
export function registerWhatsAppConnectRoutes(app: Express): void {
  app.use(WEBHOOK_BASE, createWhatsAppConnectRouter());
}

/** @deprecated Use {@link registerWhatsAppWebhookRoutes} + {@link registerWhatsAppConnectRoutes} */
export function registerWhatsAppRoutes(app: Express): void {
  registerWhatsAppWebhookRoutes(app);
  registerWhatsAppConnectRoutes(app);
}
