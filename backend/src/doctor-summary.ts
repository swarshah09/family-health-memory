import type { HealthLog, Insight } from "./types.js";
import type { TimelineNarrativeEvent } from "./timeline-narrative.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MEDICATION_KEYWORDS = ["medication", "medicine", "tablet", "pill", "dose", "antibiotic", "painkiller"];

type SymptomTrend = {
  symptom: string;
  count: number;
  previousCount: number;
  trend: "increasing" | "decreasing" | "stable";
};

function includesMedication(text: string): boolean {
  const lower = text.toLowerCase();
  return MEDICATION_KEYWORDS.some((kw) => lower.includes(kw));
}

function trendOf(current: number, previous: number): "increasing" | "decreasing" | "stable" {
  if (current > previous) return "increasing";
  if (current < previous) return "decreasing";
  return "stable";
}

export function buildDoctorVisitSummary(input: {
  memberName: string;
  logs: HealthLog[];
  insights: Insight[];
  timelineEvents: TimelineNarrativeEvent[];
  days?: number;
  now?: Date;
}): {
  title: string;
  periodLabel: string;
  generatedAt: string;
  recurringSymptoms: Array<{ symptom: string; count: number }>;
  trendAnalysis: SymptomTrend[];
  majorChangesTimeline: Array<{ date: string; event: string; details: string }>;
  medicationObservations: string[];
  summary: string;
} {
  const days = input.days || 30;
  const now = input.now || new Date();
  const cutoffMs = now.getTime() - days * DAY_MS;
  const previousCutoffMs = now.getTime() - days * 2 * DAY_MS;
  const currentLogs = input.logs.filter((l) => new Date(l.occurredAt).getTime() >= cutoffMs);
  const previousLogs = input.logs.filter((l) => {
    const ts = new Date(l.occurredAt).getTime();
    return ts >= previousCutoffMs && ts < cutoffMs;
  });

  const symptomCount = new Map<string, number>();
  const prevSymptomCount = new Map<string, number>();
  for (const log of currentLogs) {
    for (const symptom of log.tags || []) {
      const key = symptom.trim().toLowerCase();
      if (!key) continue;
      symptomCount.set(key, (symptomCount.get(key) || 0) + 1);
    }
  }
  for (const log of previousLogs) {
    for (const symptom of log.tags || []) {
      const key = symptom.trim().toLowerCase();
      if (!key) continue;
      prevSymptomCount.set(key, (prevSymptomCount.get(key) || 0) + 1);
    }
  }

  const recurringSymptoms = [...symptomCount.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([symptom, count]) => ({ symptom, count }));

  const trendAnalysis: SymptomTrend[] = [...symptomCount.entries()]
    .map(([symptom, count]) => {
      const previousCount = prevSymptomCount.get(symptom) || 0;
      return {
        symptom,
        count,
        previousCount,
        trend: trendOf(count, previousCount)
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const majorChangesTimeline = input.timelineEvents
    .filter((ev) => new Date(ev.startAt).getTime() >= cutoffMs)
    .slice(0, 10)
    .map((ev) => ({
      date: new Date(ev.startAt).toISOString().slice(0, 10),
      event: ev.title,
      details: ev.description
    }));

  const medicationLogs = currentLogs.filter((l) => includesMedication(l.text));
  const medicationObservations: string[] = [];
  for (const mlog of medicationLogs.slice(0, 6)) {
    const mTs = new Date(mlog.occurredAt).getTime();
    const nearbySymptoms = currentLogs
      .filter((l) => {
        const ts = new Date(l.occurredAt).getTime();
        return ts >= mTs && ts <= mTs + DAY_MS;
      })
      .flatMap((l) => l.tags || []);
    const uniqueSymptoms = [...new Set(nearbySymptoms.map((s) => s.trim().toLowerCase()).filter(Boolean))];
    if (!uniqueSymptoms.length) continue;
    medicationObservations.push(
      `After a medication-related note on ${new Date(mlog.occurredAt).toLocaleDateString()}, related symptoms included ${uniqueSymptoms.slice(0, 3).join(", ")}.`
    );
  }

  const topTrend = trendAnalysis[0];
  const summary =
    recurringSymptoms.length === 0
      ? `${input.memberName}'s notes over the last ${days} days show limited recurring symptom patterns.`
      : `${input.memberName}'s last ${days} days show recurring ${recurringSymptoms[0].symptom} patterns, with ${topTrend?.trend || "stable"} overall trend activity compared with the previous period.`;

  return {
    title: `Doctor Visit Summary: ${input.memberName}`,
    periodLabel: `Last ${days} days`,
    generatedAt: now.toISOString(),
    recurringSymptoms,
    trendAnalysis,
    majorChangesTimeline,
    medicationObservations: medicationObservations.length
      ? medicationObservations
      : ["No clear medication-linked symptom pattern was detected in this period."],
    summary
  };
}
