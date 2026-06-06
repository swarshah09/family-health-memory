import { Worker } from "bullmq";
import { getWorkerConnectionOpts } from "./queue-connection.js";
import { QUEUE_RETRY_POLICIES } from "./queue-retry-policies.js";
import { DEFAULT_CONCURRENCY, type QueueName } from "./queue-registry.js";
import type { Job, Processor } from "bullmq";

/**
 * Queue Workers — factory for creating and managing BullMQ workers.
 *
 * Each worker:
 * - Gets its own Redis connection (BullMQ requirement)
 * - Has configurable concurrency
 * - Has error isolation (one failure doesn't crash others)
 * - Supports lifecycle management (start, pause, drain, close)
 */

const _workers = new Map<string, Worker>();

export type WorkerRegistration = {
  name: QueueName;
  processor: Processor;
  concurrency?: number;
};

/**
 * Creates and starts a BullMQ worker for a named queue.
 */
export function registerWorker(reg: WorkerRegistration): Worker {
  const existing = _workers.get(reg.name);
  if (existing) return existing;

  const concurrency = reg.concurrency ?? DEFAULT_CONCURRENCY[reg.name] ?? 3;
  const policy = QUEUE_RETRY_POLICIES[reg.name];

  const worker = new Worker(reg.name, reg.processor, {
    connection: getWorkerConnectionOpts(),
    concurrency,
    stalledInterval: policy?.stalledInterval ?? 5 * 60 * 1000,
    lockDuration: policy?.stalledInterval ?? 5 * 60 * 1000
  });

  worker.on("completed", (job: Job) => {
    console.info(`[worker:${reg.name}] completed`, {
      jobId: job.id,
      duration: job.finishedOn && job.processedOn
        ? job.finishedOn - job.processedOn
        : undefined
    });
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    console.error(`[worker:${reg.name}] failed`, {
      jobId: job?.id,
      attempt: job?.attemptsMade,
      error: err.message
    });
  });

  worker.on("stalled", (jobId: string) => {
    console.warn(`[worker:${reg.name}] stalled`, { jobId });
  });

  worker.on("error", (err: Error) => {
    console.error(`[worker:${reg.name}] worker error`, { error: err.message });
  });

  _workers.set(reg.name, worker);
  console.info(`[worker:${reg.name}] registered (concurrency=${concurrency})`);
  return worker;
}

/**
 * Pauses all workers (stop accepting new jobs but finish current ones).
 */
export async function pauseAllWorkers(): Promise<void> {
  const promises = [..._workers.values()].map((w) => w.pause());
  await Promise.allSettled(promises);
}

/**
 * Closes all workers and their Redis connections.
 */
export async function closeAllWorkers(): Promise<void> {
  const promises = [..._workers.values()].map((w) => w.close());
  await Promise.allSettled(promises);
  _workers.clear();
}

/**
 * Returns all registered workers for observability.
 */
export function getAllWorkers(): Map<string, Worker> {
  return _workers;
}
