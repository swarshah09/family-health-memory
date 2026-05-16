import crypto from "crypto";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function generateVerificationCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

export function hashVerificationCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}

export function verificationExpiresAt(): Date {
  return new Date(Date.now() + CODE_TTL_MS);
}

export function isVerificationExpired(expiresAt?: Date | null): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() < Date.now();
}

export function verifyCodeHash(provided: string, storedHash?: string | null): boolean {
  if (!storedHash) return false;
  const normalized = provided.replace(/\D/g, "").trim();
  if (normalized.length !== 6) return false;
  const hash = hashVerificationCode(normalized);
  if (hash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, "utf8"), Buffer.from(storedHash, "utf8"));
}

export function hasExceededVerificationAttempts(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS;
}

export const VERIFICATION_MAX_ATTEMPTS = MAX_ATTEMPTS;
