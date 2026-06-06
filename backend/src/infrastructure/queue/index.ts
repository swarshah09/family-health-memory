/**
 * Queue Infrastructure — BullMQ-based production queue system.
 */

export {
  getQueueConnectionOpts,
  getWorkerConnectionOpts,
  checkRedisHealth,
  closeQueueConnection
} from "./queue-connection.js";

export {
  QUEUE_NAMES,
  getQueue,
  getAllQueues,
  closeAllQueues,
  DEFAULT_CONCURRENCY,
  type QueueName
} from "./queue-registry.js";

export {
  QUEUE_RETRY_POLICIES,
  toJobOptions,
  type RetryPolicy
} from "./queue-retry-policies.js";

export {
  registerWorker,
  pauseAllWorkers,
  closeAllWorkers,
  getAllWorkers,
  type WorkerRegistration
} from "./queue-workers.js";
