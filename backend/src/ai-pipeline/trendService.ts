import { z } from "zod";
import type { NormalizedEvent } from "./normalizerService.js";

const TrendItemSchema = z.object({
  symptom: z.string().min(1),
  count: z.number().int().min(0),
  previousCount: z.number().int().min(0),
  trend: z.enum(["increasing", "decreasing", "stable"]),
  firstSeen: z.string().min(1),
  lastSeen: z.string().min(1),
  recurrence: z.boolean(),
  sourceLogIds: z.array(z.string().min(1)),
  confidenceScore: z.number().min(0).max(1)
});

const TrendOutputSchema = z.object({
  lookbackDays: z.number().int().positive(),
  trends: z.array(TrendItemSchema)
});

export type TrendOutput = z.infer<typeof TrendOutputSchema>;

export function trendService(input: { events: NormalizedEvent[]; lookbackDays: number }): TrendOutput {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - input.lookbackDays);
  const nowMs = Date.now();
  const last7Cutoff = nowMs - 7 * 24 * 60 * 60 * 1000;
  const previous7Cutoff = nowMs - 14 * 24 * 60 * 60 * 1000;

  const bySymptom = new Map<
    string,
    Array<{ timestamp: string; severity: "low" | "medium" | "high"; sourceLogId: string }>
  >();
  const activeSymptoms = new Set<string>();

  for (const event of input.events) {
    const eventTs = new Date(event.timestamp).getTime();
    const isInLookback = eventTs >= cutoff.getTime();
    for (const symptom of event.symptoms) {
      if (!bySymptom.has(symptom)) bySymptom.set(symptom, []);
      bySymptom.get(symptom)!.push({
        timestamp: event.timestamp,
        severity: event.severity,
        sourceLogId: event.sourceLogId
      });
      if (isInLookback) activeSymptoms.add(symptom);
    }
  }

  const trends = [...bySymptom.entries()]
    .filter(([symptom]) => activeSymptoms.has(symptom))
    .map(([symptom, rows]) => {
      const sorted = rows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const recentRows = sorted.filter((x) => new Date(x.timestamp).getTime() >= last7Cutoff);
      const recurrenceDays = new Set(recentRows.map((x) => new Date(x.timestamp).toISOString().slice(0, 10))).size;
      const recurrence = recurrenceDays >= 2;
      const count = recentRows.length;
      const previousCount = sorted.filter((x) => {
        const ts = new Date(x.timestamp).getTime();
        return ts >= previous7Cutoff && ts < last7Cutoff;
      }).length;
      const trend: "increasing" | "decreasing" | "stable" =
        count > previousCount ? "increasing" : count < previousCount ? "decreasing" : "stable";
      const firstSeen = sorted[0]?.timestamp || new Date().toISOString();
      const lastSeen = sorted[sorted.length - 1]?.timestamp || firstSeen;
      const confidenceScore = Math.min(
        0.95,
        0.45 + count * 0.08 + (trend === "increasing" ? 0.08 : trend === "decreasing" ? 0.04 : 0)
      );

      return {
        symptom,
        count,
        previousCount,
        trend,
        firstSeen,
        lastSeen,
        recurrence,
        sourceLogIds: [...new Set(sorted.map((x) => x.sourceLogId))],
        confidenceScore: Number(confidenceScore.toFixed(3))
      };
    });

  return TrendOutputSchema.parse({
    lookbackDays: input.lookbackDays,
    trends: trends.sort((a, b) => b.count - a.count)
  });
}

