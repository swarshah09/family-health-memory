import cron from "node-cron";
import { getAllActiveFamilyIds, runAutomationAnalysis } from "./store.js";
import { runDailyInsightPrecomputeJob, runWeeklyDigestPrecomputeJob } from "./insight-precompute.js";
import { digestService } from "./modules/weekly-digest-engine/index.js";
import { followupService } from "./modules/followup-engine/index.js";
import { careGuidanceService } from "./modules/care-guidance/index.js";
import { getQueue, QUEUE_NAMES, isRedisConfigured } from "./infrastructure/queue/index.js";

export function startInsightJobs(): void {
  // Runs once every 24 hours at 2:00 AM server time.
  cron.schedule("0 2 * * *", async () => {
    try {
      await runDailyInsightPrecomputeJob();
    } catch (error) {
      // Keep scheduler alive even if the precompute stage fails.
      console.error("Daily insight precompute job failed", error);
    }

    try {
      const familyIds = await getAllActiveFamilyIds();
      for (const familyId of familyIds) {
        try {
          await runAutomationAnalysis(familyId, "scheduled");
        } catch (error) {
          // Continue with remaining families.
          console.error("Failed scheduled automation analysis", familyId, error);
        }
      }
    } catch (error) {
      // Keep scheduler alive even if family list retrieval fails.
      console.error("Failed to retrieve active families for automation run", error);
    }
  });

  // Runs every Sunday at 3:00 AM server time for weekly digest precompute.
  cron.schedule("0 3 * * 0", async () => {
    try {
      console.log("Starting weekly digest precompute job");
      await runWeeklyDigestPrecomputeJob();
      console.log("Completed weekly digest precompute job");
    } catch (error) {
      console.error("Weekly digest precompute job failed", error);
    }
  });

  // Runs every Sunday at 4:00 AM — health intelligence batch via queue.
  cron.schedule("0 4 * * 0", async () => {
    // Use queue when Redis is available, otherwise run directly
    if (isRedisConfigured()) {
      try {
        const queue = getQueue(QUEUE_NAMES.DIGEST_GENERATION);
        await queue.add(
          "weekly-batch",
          { type: "full-batch", triggeredBy: "cron" },
          { jobId: `batch-${Date.now()}` }
        );
        console.log("[jobs] Weekly batch job enqueued");
        return;
      } catch (err) {
        console.warn("[jobs] Queue unavailable, running batch directly", {
          error: err instanceof Error ? err.message : "unknown"
        });
      }
    }

    // Direct execution (no Redis or queue failure)
    try {
      await digestService.runScheduledDigestGeneration();
    } catch (error) {
      console.error("[jobs] Digest generation failed", error);
    }
    try {
      await followupService.runScheduledFollowupGeneration();
    } catch (error) {
      console.error("[jobs] Follow-up generation failed", error);
    }
    try {
      await careGuidanceService.runScheduledGuidanceGeneration();
    } catch (error) {
      console.error("[jobs] Care guidance generation failed", error);
    }
  });
}

