import cron from "node-cron";
import { getAllActiveFamilyIds, runAutomationAnalysis } from "./store.js";

export function startInsightJobs(): void {
  // Runs every day at 2:00 AM server time.
  cron.schedule("0 2 * * *", async () => {
    const familyIds = await getAllActiveFamilyIds();
    for (const familyId of familyIds) {
      try {
        await runAutomationAnalysis(familyId, "scheduled");
      } catch (error) {
        console.error("Failed insight snapshot job", familyId, error);
      }
    }
  });
}
