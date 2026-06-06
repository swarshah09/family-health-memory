import { Queue } from "bullmq";
import { getQueueConnectionOpts } from "./queue-connection.js";
import { QUEUE_RETRY_POLICIES, toJobOptions } from "./queue-retry-policies.js";
import type { JobsOptions } from "bullmq";

/**
 * Queue Registry — defines and creates all application queues.
 *
 * 8 named queues covering the full pipeline:
 * ingestion → transcription → extraction → resolution →
 * memory → timeline → digest/guidance
 */

// ── Queue names (constants) ─────────────────────────────────────────────

export const QUEUE_NAMES = {
  WHATSAPP_INGESTION: "whatsapp-ingestion",
  VOICE_TRANSCRIPTION: "voice-transcription",
  AI_EXTRACTION: "ai-extraction",
  PROFILE_RESOLUTION: "profile-resolution",
  HEALTH_MEMORY: "health-memory",
  TIMELINE_PROCESSING: "timeline-processing",
  DIGEST_GENERATION: "digest-generation",
  CARE_GUIDANCE_GENERATION: "care-guidance-generation"
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ── Default concurrency per queue ───────────────────────────────────────

export const DEFAULT_CONCURRENCY: Record<QueueName, number> = {
  [QUEUE_NAMES.WHATSAPP_INGESTION]: 5,
  [QUEUE_NAMES.VOICE_TRANSCRIPTION]: 2,
  [QUEUE_NAMES.AI_EXTRACTION]: 3,
  [QUEUE_NAMES.PROFILE_RESOLUTION]: 5,
  [QUEUE_NAMES.HEALTH_MEMORY]: 5,
  [QUEUE_NAMES.TIMELINE_PROCESSING]: 5,
  [QUEUE_NAMES.DIGEST_GENERATION]: 1,
  [QUEUE_NAMES.CARE_GUIDANCE_GENERATION]: 1
};

// ── Queue instances ─────────────────────────────────────────────────────

const _queues = new Map<string, Queue>();

/**
 * Gets (or creates) a named BullMQ queue.
 */
export function getQueue(name: QueueName): Queue {
  let queue = _queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getQueueConnectionOpts(),
      defaultJobOptions: getDefaultJobOptions(name)
    });
    _queues.set(name, queue);
  }
  return queue;
}

/**
 * Returns default job options for a queue based on its retry policy.
 */
function getDefaultJobOptions(name: QueueName): JobsOptions {
  const policy = QUEUE_RETRY_POLICIES[name];
  if (!policy) {
    return { attempts: 3, backoff: { type: "exponential", delay: 1000 } };
  }
  return toJobOptions(policy);
}

/**
 * Returns all registered queue instances.
 */
export function getAllQueues(): Map<string, Queue> {
  return _queues;
}

/**
 * Closes all queues. Called during graceful shutdown.
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises = [..._queues.values()].map((q) => q.close());
  await Promise.allSettled(closePromises);
  _queues.clear();
}
