import { closeAllWorkers, pauseAllWorkers } from "./queue/queue-workers.js";
import { closeAllQueues } from "./queue/queue-registry.js";
import { closeQueueConnection } from "./queue/queue-connection.js";
import mongoose from "mongoose";

/**
 * Graceful Shutdown — ensures clean termination on SIGTERM/SIGINT.
 *
 * Order:
 * 1. Pause all workers (stop accepting new jobs)
 * 2. Close all workers (finish active jobs, close Redis connections)
 * 3. Close all queues
 * 4. Close shared Redis connection
 * 5. Close MongoDB connection
 *
 * Timeout: 30 seconds max — force exit if cleanup takes too long.
 */

const SHUTDOWN_TIMEOUT_MS = 30000;
let _isShuttingDown = false;

export function registerGracefulShutdown(
  httpServer?: { close: (cb: () => void) => void }
): void {
  const shutdown = async (signal: string) => {
    if (_isShuttingDown) return;
    _isShuttingDown = true;

    console.info(`[shutdown] Received ${signal}. Starting graceful shutdown...`);

    const timeout = setTimeout(() => {
      console.error("[shutdown] Timeout reached. Force exiting.");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      // 1. Stop HTTP server
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
        console.info("[shutdown] HTTP server closed");
      }

      // 2. Pause workers
      await pauseAllWorkers();
      console.info("[shutdown] Workers paused");

      // 3. Close workers
      await closeAllWorkers();
      console.info("[shutdown] Workers closed");

      // 4. Close queues
      await closeAllQueues();
      console.info("[shutdown] Queues closed");

      // 5. Close Redis
      await closeQueueConnection();
      console.info("[shutdown] Redis closed");

      // 6. Close MongoDB
      await mongoose.disconnect();
      console.info("[shutdown] MongoDB closed");

      clearTimeout(timeout);
      console.info("[shutdown] Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      console.error("[shutdown] Error during shutdown", err);
      clearTimeout(timeout);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

export function isShuttingDown(): boolean {
  return _isShuttingDown;
}
