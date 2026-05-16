import rateLimit from "express-rate-limit";
import type { Request } from "express";
import type { AuthTokenPayload } from "../../../auth.js";

function userIdFromRequest(req: Request): string {
  const auth = (req as Request & { auth?: AuthTokenPayload }).auth;
  return auth?.userId || req.ip || "anonymous";
}

export const whatsappConnectInitiateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userIdFromRequest,
  message: { message: "Too many connection attempts. Please try again in an hour." }
});

export const whatsappConnectVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userIdFromRequest,
  message: { message: "Too many verification attempts. Please try again later." }
});
