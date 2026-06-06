import type { Request, Response } from "express";
import mongoose from "mongoose";
import { checkRedisHealth } from "../queue/index.js";
import { getAllWorkers } from "../queue/queue-workers.js";

/**
 * Health Check endpoints for load balancers and monitoring.
 *
 * /health      — basic liveness (DB + Redis)
 * /health/ready — readiness (all workers healthy)
 */

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const dbHealthy = mongoose.connection.readyState === 1;
  let redisHealthy = false;

  try {
    redisHealthy = await checkRedisHealth();
  } catch {
    redisHealthy = false;
  }

  const healthy = dbHealthy && redisHealthy;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? "connected" : "disconnected",
      redis: redisHealthy ? "connected" : "disconnected"
    }
  });
}

export async function readinessCheck(_req: Request, res: Response): Promise<void> {
  const dbHealthy = mongoose.connection.readyState === 1;
  let redisHealthy = false;

  try {
    redisHealthy = await checkRedisHealth();
  } catch {
    redisHealthy = false;
  }

  const workers = getAllWorkers();
  const workerCount = workers.size;
  const workerStatus: Record<string, string> = {};

  for (const [name, worker] of workers) {
    workerStatus[name] = worker.isRunning() ? "running" : "stopped";
  }

  const allWorkersRunning = Object.values(workerStatus).every(
    (s) => s === "running"
  );
  const ready = dbHealthy && redisHealthy && allWorkersRunning;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? "connected" : "disconnected",
      redis: redisHealthy ? "connected" : "disconnected",
      workers: {
        total: workerCount,
        status: workerStatus
      }
    }
  });
}
