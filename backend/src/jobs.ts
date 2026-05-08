import cron from "node-cron";
import { getAllActiveFamilyIds, runAutomationAnalysis } from "./store.js";
import { runDailyInsightPrecomputeJob, runWeeklyDigestPrecomputeJob } from "./insight-precompute.js";

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
}
