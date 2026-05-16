import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

const DEFAULT_REGION = (process.env.WHATSAPP_DEFAULT_PHONE_REGION?.trim().toUpperCase() ||
  "US") as CountryCode;

export type PhoneValidationResult =
  | { ok: true; e164: string }
  | { ok: false; message: string };

/**
 * Sanitize and validate an international mobile number to E.164.
 */
export function validateAndNormalizePhone(raw: string, defaultRegion: CountryCode = DEFAULT_REGION): PhoneValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: "Please enter a phone number." };
  }
  if (trimmed.length > 32) {
    return { ok: false, message: "Phone number is too long." };
  }

  const sanitized = trimmed.replace(/[^\d+]/g, "");
  const parsed = parsePhoneNumberFromString(sanitized.startsWith("+") ? sanitized : trimmed, defaultRegion);

  if (!parsed || !parsed.isValid()) {
    return {
      ok: false,
      message: "Enter a valid number with country code (e.g. +1 555 123 4567)."
    };
  }

  const lineType = parsed.getType();
  if (lineType === "FIXED_LINE") {
    return { ok: false, message: "Please use a mobile number you use for WhatsApp." };
  }

  return { ok: true, e164: parsed.format("E.164") };
}

/** Mask for display: +1 ••• ••• 4567 */
export function maskPhoneNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  const last4 = digits.slice(-4);
  const cc = e164.startsWith("+") ? `+${digits.slice(0, Math.min(3, digits.length - 10))}` : "+";
  return `${cc} ••• ••• ${last4}`;
}
