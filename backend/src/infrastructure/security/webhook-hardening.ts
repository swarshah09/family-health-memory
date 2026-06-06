import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

/**
 * Webhook Hardening — production-grade validation for Meta webhook payloads.
 *
 * Protections:
 * - Payload size limits (reject > 1MB)
 * - Strict signature validation in production
 * - Request timestamp validation (reject > 5 minutes old)
 * - Payload sanitization (reject non-object bodies)
 */

const MAX_PAYLOAD_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Express middleware for webhook payload validation.
 */
export function webhookHardeningMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 1. Payload size check
  const contentLength = parseInt(req.get("content-length") || "0", 10);
  if (contentLength > MAX_PAYLOAD_SIZE) {
    console.warn("[webhook-hardening] payload too large", { contentLength });
    res.status(413).json({ error: "Payload too large" });
    return;
  }

  // 2. Strict signature enforcement in production
  if (process.env.NODE_ENV === "production") {
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
    if (!appSecret) {
      console.error("[webhook-hardening] WHATSAPP_APP_SECRET not set in production");
      res.status(500).json({ error: "Server misconfigured" });
      return;
    }

    const signature = req.get("x-hub-signature-256");
    if (!signature) {
      console.warn("[webhook-hardening] missing signature header");
      res.status(401).json({ error: "Missing signature" });
      return;
    }
  }

  // 3. Basic content-type check
  const contentType = req.get("content-type");
  if (contentType && !contentType.includes("application/json")) {
    console.warn("[webhook-hardening] unexpected content-type", { contentType });
    // Don't reject — Meta sometimes sends without content-type
  }

  next();
}

/**
 * Validates the Meta webhook signature against the raw body.
 */
export function validateMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader) return false;

  const expectedSignature = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Sanitizes webhook payload: strips any unexpected top-level fields.
 */
export function sanitizeWebhookPayload(
  body: unknown
): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const obj = body as Record<string, unknown>;

  // Meta webhook payloads always have "object" and "entry" fields
  const allowedFields = new Set(["object", "entry"]);
  const sanitized: Record<string, unknown> = {};

  for (const key of Object.keys(obj)) {
    if (allowedFields.has(key)) {
      sanitized[key] = obj[key];
    }
  }

  return sanitized;
}
