import { WhatsAppConnectionModel } from "../models/whatsapp-connection.model.js";
import { maskPhoneNumber, validateAndNormalizePhone } from "../utils/phone-validation.js";
import { sendWhatsAppVerificationCode } from "../utils/whatsapp-send.js";
import {
  generateVerificationCode,
  hashVerificationCode,
  hasExceededVerificationAttempts,
  isVerificationExpired,
  verificationExpiresAt,
  verifyCodeHash,
  VERIFICATION_MAX_ATTEMPTS
} from "./whatsapp-verification.service.js";
import type { WhatsAppConnectionStatusDto } from "../types/whatsapp.types.js";

export class WhatsAppConnectionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_PHONE"
      | "ALREADY_CONNECTED"
      | "PHONE_IN_USE"
      | "NOT_FOUND"
      | "NO_PENDING"
      | "CODE_EXPIRED"
      | "CODE_INVALID"
      | "TOO_MANY_ATTEMPTS"
      | "SEND_FAILED"
  ) {
    super(message);
    this.name = "WhatsAppConnectionError";
  }
}

function mapStatus(doc: {
  _id: { toString(): string };
  whatsappPhoneNumber: string;
  isVerified: boolean;
  verifiedAt?: Date | null;
  verificationExpiresAt?: Date | null;
}): WhatsAppConnectionStatusDto {
  const pending =
    !doc.isVerified &&
    Boolean(doc.verificationExpiresAt) &&
    !isVerificationExpired(doc.verificationExpiresAt);

  return {
    connectionId: doc._id.toString(),
    connected: doc.isVerified,
    pendingVerification: pending,
    whatsappPhoneNumber: doc.isVerified ? maskPhoneNumber(doc.whatsappPhoneNumber) : undefined,
    phonePending: pending ? maskPhoneNumber(doc.whatsappPhoneNumber) : undefined,
    verifiedAt: doc.verifiedAt?.toISOString()
  };
}

export class WhatsAppConnectionService {
  async getStatus(userId: string): Promise<WhatsAppConnectionStatusDto> {
    const doc = await WhatsAppConnectionModel.findOne({ userId }).lean();
    if (!doc) {
      return { connected: false, pendingVerification: false };
    }
    return mapStatus(doc);
  }

  async initiateConnect(userId: string, rawPhone: string): Promise<{
    status: WhatsAppConnectionStatusDto;
    deliveryHint: string;
    devCode?: string;
  }> {
    const phoneResult = validateAndNormalizePhone(rawPhone);
    if (!phoneResult.ok) {
      throw new WhatsAppConnectionError(phoneResult.message, "INVALID_PHONE");
    }
    const e164 = phoneResult.e164;

    const existingUser = await WhatsAppConnectionModel.findOne({ userId });
    if (existingUser?.isVerified) {
      throw new WhatsAppConnectionError(
        "This account already has WhatsApp connected. Disconnect first to use a different number.",
        "ALREADY_CONNECTED"
      );
    }

    const phoneTaken = await WhatsAppConnectionModel.findOne({
      whatsappPhoneNumber: e164,
      userId: { $ne: userId },
      isVerified: true
    });
    if (phoneTaken) {
      throw new WhatsAppConnectionError(
        "This number is already linked to another account.",
        "PHONE_IN_USE"
      );
    }

    const pendingOther = await WhatsAppConnectionModel.findOne({
      whatsappPhoneNumber: e164,
      userId: { $ne: userId },
      isVerified: false
    });
    if (pendingOther) {
      throw new WhatsAppConnectionError(
        "This number is already being verified on another account.",
        "PHONE_IN_USE"
      );
    }

    const code = generateVerificationCode();
    const sendResult = await sendWhatsAppVerificationCode(e164, code);
    if (!sendResult.sent) {
      throw new WhatsAppConnectionError(
        "We couldn't send a verification code right now. Try again shortly.",
        "SEND_FAILED"
      );
    }

    const doc = await WhatsAppConnectionModel.findOneAndUpdate(
      { userId },
      {
        userId,
        whatsappPhoneNumber: e164,
        isVerified: false,
        verifiedAt: null,
        verificationCodeHash: hashVerificationCode(code),
        verificationExpiresAt: verificationExpiresAt(),
        verificationAttempts: 0
      },
      { upsert: true, new: true }
    ).lean();

    const deliveryHint = sendResult.devFallback
      ? "Check your server logs for the code in local development, or configure WhatsApp in your environment."
      : "We sent a 6-digit code to your WhatsApp. Enter it below to finish connecting.";

    return {
      status: mapStatus(doc!),
      deliveryHint,
      devCode: sendResult.devFallback ? code : undefined
    };
  }

  async verifyConnect(userId: string, rawCode: string): Promise<WhatsAppConnectionStatusDto> {
    const code = rawCode.replace(/\D/g, "").trim();
    if (code.length !== 6) {
      throw new WhatsAppConnectionError("Enter the 6-digit code we sent you.", "CODE_INVALID");
    }

    const doc = await WhatsAppConnectionModel.findOne({ userId });
    if (!doc) {
      throw new WhatsAppConnectionError("Start by entering your phone number.", "NOT_FOUND");
    }
    if (doc.isVerified) {
      return mapStatus(doc);
    }
    if (!doc.verificationCodeHash || !doc.verificationExpiresAt) {
      throw new WhatsAppConnectionError("Request a new code to continue.", "NO_PENDING");
    }
    if (isVerificationExpired(doc.verificationExpiresAt)) {
      throw new WhatsAppConnectionError("That code has expired. Request a new one.", "CODE_EXPIRED");
    }
    if (hasExceededVerificationAttempts(doc.verificationAttempts ?? 0)) {
      throw new WhatsAppConnectionError(
        "Too many tries. Request a new code to continue.",
        "TOO_MANY_ATTEMPTS"
      );
    }

    const valid = verifyCodeHash(code, doc.verificationCodeHash);
    if (!valid) {
      doc.verificationAttempts = (doc.verificationAttempts ?? 0) + 1;
      await doc.save();
      throw new WhatsAppConnectionError(
        doc.verificationAttempts >= VERIFICATION_MAX_ATTEMPTS
          ? "Too many tries. Request a new code."
          : "That code doesn't match. Check WhatsApp and try again.",
        doc.verificationAttempts >= VERIFICATION_MAX_ATTEMPTS ? "TOO_MANY_ATTEMPTS" : "CODE_INVALID"
      );
    }

    const conflict = await WhatsAppConnectionModel.findOne({
      whatsappPhoneNumber: doc.whatsappPhoneNumber,
      userId: { $ne: userId },
      isVerified: true
    });
    if (conflict) {
      throw new WhatsAppConnectionError(
        "This number was linked to another account. Use a different number.",
        "PHONE_IN_USE"
      );
    }

    doc.isVerified = true;
    doc.verifiedAt = new Date();
    doc.verificationCodeHash = undefined;
    doc.verificationExpiresAt = undefined;
    doc.verificationAttempts = 0;
    await doc.save();

    return mapStatus(doc);
  }

  async disconnect(userId: string): Promise<void> {
    const result = await WhatsAppConnectionModel.deleteOne({ userId });
    if (result.deletedCount === 0) {
      throw new WhatsAppConnectionError("No WhatsApp connection to remove.", "NOT_FOUND");
    }
  }

  /** Resolve verified user by WhatsApp number (for future ingestion). */
  async findVerifiedUserByPhone(e164: string): Promise<{ userId: string; connectionId: string } | null> {
    const doc = await WhatsAppConnectionModel.findOne({
      whatsappPhoneNumber: e164,
      isVerified: true
    }).lean();
    if (!doc) return null;
    return { userId: doc.userId, connectionId: doc._id.toString() };
  }
}

export const whatsappConnectionService = new WhatsAppConnectionService();
