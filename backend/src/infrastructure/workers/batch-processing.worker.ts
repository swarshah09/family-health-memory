import type { Job } from "bullmq";
import { digestService } from "../../modules/weekly-digest-engine/index.js";
import { followupService } from "../../modules/followup-engine/index.js";
import { careGuidanceService } from "../../modules/care-guidance/index.js";
import { processingStateService } from "../processing-state/index.js";

/**
 * Batch Processing Worker — handles scheduled batch jobs:
 * - Weekly digest generation
 * - Follow-up prompt generation
 * - Care guidance generation
 *
 * Concurrency: 1 (sequential to avoid resource contention)
 */

export type BatchJobType = "digest" | "followup" | "care-guidance" | "full-batch";

export type BatchJobData = {
  type: BatchJobType;
  triggeredBy: "cron" | "manual";
};

export async function processBatchJob(
  job: Job<BatchJobData>
): Promise<Record<string, unknown>> {
  const { type, triggeredBy } = job.data;
  const jobId = `batch-${type}-${Date.now()}`;

  await processingStateService.transition(
    "BATCH_JOB", jobId, "PROCESSING"
  );

  console.info(`[batch-worker] starting ${type} (triggered: ${triggeredBy})`);

  try {
    let result: Record<string, unknown> = {};

    if (type === "digest" || type === "full-batch") {
      const digestResult = await digestService.runScheduledDigestGeneration();
      result.digest = digestResult;
      console.info("[batch-worker] digests complete", digestResult);
    }

    if (type === "followup" || type === "full-batch") {
      const followupResult = await followupService.runScheduledFollowupGeneration();
      result.followup = followupResult;
      console.info("[batch-worker] followups complete", followupResult);
    }

    if (type === "care-guidance" || type === "full-batch") {
      const guidanceResult = await careGuidanceService.runScheduledGuidanceGeneration();
      result.guidance = guidanceResult;
      console.info("[batch-worker] care guidance complete", guidanceResult);
    }

    await processingStateService.transition(
      "BATCH_JOB", jobId, "COMPLETED"
    );

    return result;
  } catch (err) {
    await processingStateService.transition(
      "BATCH_JOB", jobId, "FAILED",
      err instanceof Error ? err.message : "unknown"
    );
    throw err;
  }
}
