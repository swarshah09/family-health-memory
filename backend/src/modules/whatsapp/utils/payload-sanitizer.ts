const REDACT_KEY = /token|secret|password|authorization|api[_-]?key|access[_-]?token/i;
const MAX_DEPTH = 8;
const MAX_KEYS = 200;
const MAX_STRING = 16_000;

let keyCount = 0;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[truncated-depth]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (keyCount >= MAX_KEYS) break;
      keyCount += 1;
      if (REDACT_KEY.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }

  return String(value);
}

/** Deep-clone webhook JSON with secrets redacted and size bounded. */
export function sanitizeWebhookPayload(value: unknown): Record<string, unknown> {
  keyCount = 0;
  const result = sanitizeValue(value, 0);
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return { value: result };
}
