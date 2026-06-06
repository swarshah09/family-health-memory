import { getAllQueues, checkRedisHealth } from "../queue/index.js";
import { processingStateService } from "../processing-state/index.js";

/**
 * Observability Service — internal metrics for monitoring.
 *
 * IMPORTANT: These metrics are INTERNAL ONLY.
 * Do NOT expose to end users.
 *
 * Metrics:
 * - Queue sizes (pending, active, completed, failed, delayed)
 * - Processing state counts
 * - Redis health
 */

export type QueueMetrics = {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

export type SystemHealthSnapshot = {
  timestamp: string;
  redis: boolean;
  queues: QueueMetrics[];
  processingStates: Record<string, Record<string, number>>;
};

export class ObservabilityService {
  /**
   * Collects a full system health snapshot.
   */
  async getHealthSnapshot(): Promise<SystemHealthSnapshot> {
    const [redisHealthy, queueMetrics, processingStates] = await Promise.all([
      checkRedisHealth(),
      this.getQueueMetrics(),
      this.getProcessingStateCounts()
    ]);

    return {
      timestamp: new Date().toISOString(),
      redis: redisHealthy,
      queues: queueMetrics,
      processingStates
    };
  }

  /**
   * Collects metrics for all registered queues.
   */
  async getQueueMetrics(): Promise<QueueMetrics[]> {
    const queues = getAllQueues();
    const metrics: QueueMetrics[] = [];

    for (const [name, queue] of queues) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount()
        ]);
        metrics.push({ name, waiting, active, completed, failed, delayed });
      } catch {
        metrics.push({ name, waiting: -1, active: -1, completed: -1, failed: -1, delayed: -1 });
      }
    }

    return metrics;
  }

  /**
   * Collects processing state counts by entity type.
   */
  async getProcessingStateCounts(): Promise<Record<string, Record<string, number>>> {
    const entityTypes = [
      "WHATSAPP_MESSAGE", "VOICE_TRANSCRIPTION", "AI_EXTRACTION",
      "BATCH_JOB"
    ];

    const result: Record<string, Record<string, number>> = {};

    for (const entityType of entityTypes) {
      try {
        result[entityType] = await processingStateService.countByState(entityType);
      } catch {
        result[entityType] = {};
      }
    }

    return result;
  }

  /**
   * Lists all failed entities for a given type (for recovery).
   */
  async listFailedEntities(
    entityType: string,
    limit = 50
  ): Promise<Array<{ entityId: string; attempts: number; error: string | null }>> {
    return processingStateService.listByState(entityType, "FAILED", limit);
  }
}

export const observabilityService = new ObservabilityService();
