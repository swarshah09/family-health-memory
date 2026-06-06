import type { JobsOptions } from "bullmq";

/**
 * Queue Retry Policies — per-queue retry configuration.
 *
 * Policies are tuned by failure mode:
 * - OpenAI-dependent: fewer retries, longer backoff (rate limits)
 * - DB-dependent: more retries, shorter backoff (transient failures)
 * - Webhook: minimal retries (Meta will re-send)
 * - Batch: moderate retries, long backoff (non-urgent)
 */

export type RetryPolicy = {
  attempts: number;
  backoff: {
    type: "exponential" | "fixed";
    delay: number; // ms
  };
  /** Job is considered stalled if not completed within this time (ms). */
  stalledInterval: number;
  /** Job removed from completed set after this time (ms). */
  removeOnComplete: number;
  /** Failed jobs kept for inspection (ms). */
  removeOnFail: number;
};

// ── Policy definitions ──────────────────────────────────────────────────

const OPENAI_POLICY: RetryPolicy = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  stalledInterval: 5 * 60 * 1000,   // 5 minutes
  removeOnComplete: 24 * 60 * 60 * 1000,  // 24 hours
  removeOnFail: 7 * 24 * 60 * 60 * 1000   // 7 days
};

const DB_POLICY: RetryPolicy = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
  stalledInterval: 3 * 60 * 1000,   // 3 minutes
  removeOnComplete: 12 * 60 * 60 * 1000,  // 12 hours
  removeOnFail: 7 * 24 * 60 * 60 * 1000   // 7 days
};

const WEBHOOK_POLICY: RetryPolicy = {
  attempts: 2,
  backoff: { type: "fixed", delay: 1000 },
  stalledInterval: 2 * 60 * 1000,
  removeOnComplete: 6 * 60 * 60 * 1000,
  removeOnFail: 3 * 24 * 60 * 60 * 1000
};

const BATCH_POLICY: RetryPolicy = {
  attempts: 2,
  backoff: { type: "exponential", delay: 30000 },
  stalledInterval: 10 * 60 * 1000,  // 10 minutes (batch can be slow)
  removeOnComplete: 48 * 60 * 60 * 1000,
  removeOnFail: 14 * 24 * 60 * 60 * 1000
};

// ── Queue → Policy mapping ─────────────────────────────────────────────

export const QUEUE_RETRY_POLICIES: Record<string, RetryPolicy> = {
  "whatsapp-ingestion": WEBHOOK_POLICY,
  "voice-transcription": OPENAI_POLICY,
  "ai-extraction": OPENAI_POLICY,
  "profile-resolution": DB_POLICY,
  "health-memory": DB_POLICY,
  "timeline-processing": DB_POLICY,
  "digest-generation": BATCH_POLICY,
  "care-guidance-generation": BATCH_POLICY
};

/**
 * Converts a RetryPolicy into BullMQ JobsOptions.
 */
export function toJobOptions(policy: RetryPolicy): JobsOptions {
  return {
    attempts: policy.attempts,
    backoff: policy.backoff,
    removeOnComplete: { age: Math.floor(policy.removeOnComplete / 1000) },
    removeOnFail: { age: Math.floor(policy.removeOnFail / 1000) }
  };
}
