import crypto from "crypto";

/**
 * Validates Meta `X-Hub-Signature-256` (HMAC SHA256 of raw body).
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(expected)) return false;

  const digest = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
