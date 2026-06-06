import type { Request, Response } from "express";
import mongoose from "mongoose";
import { checkRedisHealth, isRedisConfigured } from "../queue/index.js";
import { getAllWorkers } from "../queue/queue-workers.js";

/**
 * Health Check endpoints for load balancers and monitoring.
 *
 * /health      — basic liveness (DB required, Redis optional)
 * /health/ready — readiness (DB + Redis if configured + workers if registered)
 */

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const dbHealthy = mongoose.connection.readyState === 1;
  const redisConfigured = isRedisConfigured();
  let redisHealthy = !redisConfigured; // healthy by default when not configured

  if (redisConfigured) {
    try {
      redisHealthy = await checkRedisHealth();
    } catch {
      redisHealthy = false;
    }
  }

  const healthy = dbHealthy && redisHealthy;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? "connected" : "disconnected",
      redis: redisConfigured
        ? (redisHealthy ? "connected" : "disconnected")
        : "not_configured"
    }
  });
}

export async function readinessCheck(_req: Request, res: Response): Promise<void> {
  const dbHealthy = mongoose.connection.readyState === 1;
  const redisConfigured = isRedisConfigured();
  let redisHealthy = !redisConfigured;

  if (redisConfigured) {
    try {
      redisHealthy = await checkRedisHealth();
    } catch {
      redisHealthy = false;
    }
  }

  const workers = getAllWorkers();
  const workerCount = workers.size;
  const workerStatus: Record<string, string> = {};

  for (const [name, worker] of workers) {
    workerStatus[name] = worker.isRunning() ? "running" : "stopped";
  }

  // When Redis is not configured, no workers are expected
  const allWorkersRunning = workerCount === 0 || Object.values(workerStatus).every(
    (s) => s === "running"
  );
  const ready = dbHealthy && redisHealthy && allWorkersRunning;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? "connected" : "disconnected",
      redis: redisConfigured
        ? (redisHealthy ? "connected" : "disconnected")
        : "not_configured",
      workers: {
        total: workerCount,
        status: workerStatus
      }
    }
  });
}
