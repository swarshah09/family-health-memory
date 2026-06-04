import type { Request, Response } from "express";
import { whatsappWebhookService } from "../services/whatsapp-webhook.service.js";

function readVerifyQuery(req: Request) {
  return {
    mode: typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : undefined,
    verifyToken:
      typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : undefined,
    challenge: typeof req.query["hub.challenge"] === "string" ? req.query["hub.challenge"] : undefined
  };
}

/**
 * Meta webhook verification (GET).
 * Returns hub.challenge as plain text when token matches.
 */
export function verifyWebhook(req: Request, res: Response): void {
  try {
    const result = whatsappWebhookService.verifySubscription(readVerifyQuery(req));
    if (!result.ok) {
      res.status(403).type("text/plain").send("Forbidden");
      return;
    }
    res.status(200).type("text/plain").send(result.challenge);
  } catch (err) {
    console.error("[whatsapp-webhook] verify error", err instanceof Error ? err.message : err);
    res.status(403).type("text/plain").send("Forbidden");
  }
}

/**
 * Meta webhook receiver (POST).
 * Always responds 200 quickly; processing is logging-only for now.
 */
export function handleWebhook(req: Request, res: Response): void {
  res.sendStatus(200);

  setImmediate(() => {
    try {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(typeof req.body === "string" ? req.body : "", "utf8");

      if (rawBody.length === 0) {
        console.warn("[whatsapp-webhook] empty body");
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody.toString("utf8"));
      } catch {
        console.warn("[whatsapp-webhook] invalid JSON");
        return;
      }

      const signature = req.get("x-hub-signature-256") ?? undefined;
      void whatsappWebhookService.receiveWebhook(rawBody, signature, parsed);
    } catch (err) {
      console.error("[whatsapp-webhook] receive error", err instanceof Error ? err.message : err);
    }
  });
}
