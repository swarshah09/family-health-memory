import { Redis } from "ioredis";
import type { ConnectionOptions } from "bullmq";

/**
 * Queue Connection — Redis connection factory for BullMQ.
 *
 * Uses BullMQ's own ConnectionOptions (URL string) for queues/workers
 * to avoid ioredis version conflicts. Uses standalone ioredis only
 * for health checks.
 */

let _healthCheckConn: Redis | null = null;

/**
 * Returns true only if REDIS_URL is explicitly set in the environment.
 * When false, the entire queue system is disabled and the app runs
 * in-process (setImmediate fallback).
 */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL?.trim();
}

function getRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || "redis://localhost:6379";
}

/**
 * Returns BullMQ-compatible connection options for queue producers.
 * Passes URL string so BullMQ uses its bundled ioredis version.
 */
export function getQueueConnectionOpts(): ConnectionOptions {
  return {
    url: getRedisUrl(),
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  } as ConnectionOptions;
}

/**
 * Returns BullMQ-compatible connection options for workers.
 * Each worker creates its own connection internally.
 */
export function getWorkerConnectionOpts(): ConnectionOptions {
  return {
    url: getRedisUrl(),
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  } as ConnectionOptions;
}

/**
 * Checks if Redis is reachable using standalone ioredis.
 */
export async function checkRedisHealth(): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  try {
    if (!_healthCheckConn) {
      _healthCheckConn = new Redis(getRedisUrl(), {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        lazyConnect: true,
        retryStrategy() { return null; }
      });
    }
    await _healthCheckConn.connect().catch(() => {/* already connected */});
    const pong = await _healthCheckConn.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/**
 * Closes the health check connection. Called during graceful shutdown.
 */
export async function closeQueueConnection(): Promise<void> {
  if (_healthCheckConn) {
    await _healthCheckConn.quit().catch(() => _healthCheckConn?.disconnect());
    _healthCheckConn = null;
  }
}
