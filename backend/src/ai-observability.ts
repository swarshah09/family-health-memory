import { AIProcessingLogModel } from "./models.js";

export type AIStage = "extractor" | "trend" | "insight";
export type AIStageStatus = "success" | "failure";

type ObservabilityTrendPoint = {
  date: string;
  successes: number;
  failures: number;
  retries: number;
};

type RecentFailurePoint = {
  stage: AIStage;
  errorMessage: string | null;
  timestamp: string;
};

export async function logAIStageEvent(input: {
  familyId: string;
  personId: string;
  stage: AIStage;
  status: AIStageStatus;
  errorMessage?: string;
  retryCount?: number;
}): Promise<void> {
  try {
    await AIProcessingLogModel.create({
      familyId: input.familyId,
      personId: input.personId,
      stage: input.stage,
      status: input.status,
      errorMessage: input.errorMessage || undefined,
      retryCount: input.retryCount || 0,
      timestamp: new Date()
    });
  } catch (error) {
    // Never break primary pipeline due to observability persistence failure.
    console.error("Failed to persist AI stage event", error);
  }
}

export async function getAIObservabilitySummary(familyId: string, lookbackDays = 7): Promise<{
  lookbackDays: number;
  totalEvents: number;
  failures: number;
  retryEvents: number;
  insightSuccessRate: number;
  extractionFailures: number;
  trend: ObservabilityTrendPoint[];
  recentFailures: RecentFailurePoint[];
}> {
  const days = Math.min(Math.max(lookbackDays, 1), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [totalEvents, failures, retryEvents, insightSuccessCount, insightTotalCount, extractionFailures, trendRaw, recentFailuresRaw] =
    await Promise.all([
      AIProcessingLogModel.countDocuments({ familyId, timestamp: { $gte: since } }),
      AIProcessingLogModel.countDocuments({ familyId, status: "failure", timestamp: { $gte: since } }),
      AIProcessingLogModel.countDocuments({ familyId, retryCount: { $gt: 0 }, timestamp: { $gte: since } }),
      AIProcessingLogModel.countDocuments({
        familyId,
        stage: "insight",
        status: "success",
        timestamp: { $gte: since }
      }),
      AIProcessingLogModel.countDocuments({ familyId, stage: "insight", timestamp: { $gte: since } }),
      AIProcessingLogModel.countDocuments({
        familyId,
        stage: "extractor",
        status: "failure",
        timestamp: { $gte: since }
      }),
      AIProcessingLogModel.aggregate<{
        _id: string;
        successes: number;
        failures: number;
        retries: number;
      }>([
        { $match: { familyId, timestamp: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$timestamp",
                timezone: "UTC"
              }
            },
            successes: {
              $sum: {
                $cond: [{ $eq: ["$status", "success"] }, 1, 0]
              }
            },
            failures: {
              $sum: {
                $cond: [{ $eq: ["$status", "failure"] }, 1, 0]
              }
            },
            retries: {
              $sum: {
                $cond: [{ $gt: ["$retryCount", 0] }, 1, 0]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      AIProcessingLogModel.find({
        familyId,
        status: "failure",
        timestamp: { $gte: since }
      })
        .sort({ timestamp: -1 })
        .limit(5)
        .select({ stage: 1, errorMessage: 1, timestamp: 1, _id: 0 })
        .lean()
    ]);

  const insightSuccessRate = insightTotalCount
    ? Number((insightSuccessCount / insightTotalCount).toFixed(4))
    : 0;

  const trendByDate = new Map(trendRaw.map((row) => [row._id, row]));
  const trend: ObservabilityTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - i);
    const key = day.toISOString().slice(0, 10);
    const point = trendByDate.get(key);
    trend.push({
      date: key,
      successes: point?.successes || 0,
      failures: point?.failures || 0,
      retries: point?.retries || 0
    });
  }

  const recentFailures: RecentFailurePoint[] = recentFailuresRaw.map((item) => ({
    stage: item.stage as AIStage,
    errorMessage: item.errorMessage || null,
    timestamp: new Date(item.timestamp).toISOString()
  }));

  return {
    lookbackDays: days,
    totalEvents,
    failures,
    retryEvents,
    insightSuccessRate,
    extractionFailures,
    trend,
    recentFailures
  };
}

