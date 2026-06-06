/**
 * Structured Logger — PHI-safe, correlation-aware logging.
 *
 * Safety rules:
 * - Never logs raw health content
 * - Masks phone numbers
 * - Redacts message text
 * - Never logs secrets/tokens
 */

export type LogLevel = "info" | "warn" | "error" | "debug";

export type StructuredLogEntry = {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  correlationId?: string;
  duration?: number;
  fields?: Record<string, unknown>;
};

/**
 * Creates a scoped logger with optional correlation ID.
 */
export function createLogger(scope: string, correlationId?: string) {
  return {
    info: (message: string, fields?: Record<string, unknown>) =>
      logEntry("info", scope, message, correlationId, fields),
    warn: (message: string, fields?: Record<string, unknown>) =>
      logEntry("warn", scope, message, correlationId, fields),
    error: (message: string, fields?: Record<string, unknown>) =>
      logEntry("error", scope, message, correlationId, fields),
    debug: (message: string, fields?: Record<string, unknown>) =>
      logEntry("debug", scope, message, correlationId, fields),
    /**
     * Creates a child logger with the same correlation ID and a sub-scope.
     */
    child: (subScope: string) =>
      createLogger(`${scope}:${subScope}`, correlationId),
    /**
     * Times an async operation and logs duration.
     */
    timed: async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
      const start = Date.now();
      try {
        const result = await fn();
        logEntry("info", scope, `${label} completed`, correlationId, {
          duration: Date.now() - start
        });
        return result;
      } catch (err) {
        logEntry("error", scope, `${label} failed`, correlationId, {
          duration: Date.now() - start,
          error: err instanceof Error ? err.message : "unknown"
        });
        throw err;
      }
    }
  };
}

function logEntry(
  level: LogLevel,
  scope: string,
  message: string,
  correlationId?: string,
  fields?: Record<string, unknown>
): void {
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    ...(correlationId ? { correlationId } : {}),
    ...(fields ? { fields: sanitizeFields(fields) } : {})
  };

  const logFn = level === "error"
    ? console.error
    : level === "warn"
      ? console.warn
      : console.info;

  logFn(JSON.stringify(entry));
}

// ── PHI Protection ──────────────────────────────────────────────────────

const REDACTED_FIELDS = new Set([
  "rawText", "messageText", "content", "transcriptText",
  "guidanceText", "explanationText", "symptoms", "medications",
  "extractedSymptoms", "extractedMedications"
]);

const SECRET_FIELDS = new Set([
  "token", "secret", "password", "apiKey", "accessToken",
  "refreshToken", "appSecret", "verifyToken"
]);

function sanitizeFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_FIELDS.has(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (REDACTED_FIELDS.has(key)) {
      sanitized[key] = typeof value === "string"
        ? `[${value.length} chars]`
        : "[REDACTED]";
    } else if (key === "phoneNumber" || key === "senderPhoneNumber") {
      sanitized[key] = typeof value === "string"
        ? maskPhone(value)
        : "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return phone.slice(0, 3) + "****" + phone.slice(-2);
}
