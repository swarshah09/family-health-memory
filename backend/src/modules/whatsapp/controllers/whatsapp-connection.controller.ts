import type { Request, Response } from "express";
import { z } from "zod";
import type { AuthTokenPayload } from "../../../auth.js";
import {
  WhatsAppConnectionError,
  whatsappConnectionService
} from "../services/whatsapp-connection.service.js";

const initiateSchema = z.object({
  phoneNumber: z.string().min(5).max(32).transform((s) => s.trim())
});

const verifySchema = z.object({
  code: z.string().min(4).max(12).transform((s) => s.trim())
});

function authUserId(req: Request): string | null {
  return (req as Request & { auth?: AuthTokenPayload }).auth?.userId ?? null;
}

function mapConnectionError(err: unknown, res: Response): boolean {
  if (!(err instanceof WhatsAppConnectionError)) return false;
  const statusByCode: Record<WhatsAppConnectionError["code"], number> = {
    INVALID_PHONE: 400,
    ALREADY_CONNECTED: 409,
    PHONE_IN_USE: 409,
    NOT_FOUND: 404,
    NO_PENDING: 400,
    CODE_EXPIRED: 400,
    CODE_INVALID: 400,
    TOO_MANY_ATTEMPTS: 429,
    SEND_FAILED: 503
  };
  res.status(statusByCode[err.code] ?? 400).json({ message: err.message, code: err.code });
  return true;
}

export async function getConnectionStatus(req: Request, res: Response): Promise<void> {
  const userId = authUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const status = await whatsappConnectionService.getStatus(userId);
  res.json(status);
}

export async function initiateConnect(req: Request, res: Response): Promise<void> {
  const userId = authUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = initiateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a valid phone number with country code." });
    return;
  }

  try {
    const result = await whatsappConnectionService.initiateConnect(userId, parsed.data.phoneNumber);
    res.json({
      status: result.status,
      message: result.deliveryHint,
      ...(result.devCode ? { devCode: result.devCode } : {})
    });
  } catch (err) {
    if (mapConnectionError(err, res)) return;
    throw err;
  }
}

export async function verifyConnect(req: Request, res: Response): Promise<void> {
  const userId = authUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter the 6-digit code from WhatsApp." });
    return;
  }

  try {
    const status = await whatsappConnectionService.verifyConnect(userId, parsed.data.code);
    res.json({
      status,
      message: "WhatsApp is connected. You can send health updates from that number when we turn that on."
    });
  } catch (err) {
    if (mapConnectionError(err, res)) return;
    throw err;
  }
}

export async function disconnectWhatsApp(req: Request, res: Response): Promise<void> {
  const userId = authUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    await whatsappConnectionService.disconnect(userId);
    res.status(204).send();
  } catch (err) {
    if (mapConnectionError(err, res)) return;
    throw err;
  }
}
