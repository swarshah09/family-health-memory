import type { HealthLog, Insight, WeeklyDigest } from "../types.js";
import type { TimelineNarrativeEvent } from "../timeline-narrative.js";
import { buildDoctorVisitSummary, partitionLogsByOccurrenceWindow } from "../doctor-summary.js";
import { computeSymptomFrequencyFromLogs } from "./symptomFrequency.js";
import { extractRedFlagEventsForWindow } from "./redFlags.js";
import { buildWeeklySummaryBlocks } from "./weeklySummaries.js";
import { collectEvidenceLogIds } from "./evidenceIds.js";
import type { DoctorSummaryDocument } from "./types.js";

const DISCLAIMER =
  "This handout summarizes family-recorded observations for discussion with a clinician. It is not a diagnosis, treatment plan, or medical advice.";

export function buildDoctorSummaryDocument(input: {
  memberName: string;
  logs: HealthLog[];
  insights: Insight[];
  timelineEvents: TimelineNarrativeEvent[];
  weeklyDigests: WeeklyDigest[];
  days?: number;
  now?: Date;
}): DoctorSummaryDocument {
  const days = input.days ?? 30;
  const now = input.now ?? new Date();
  const { currentLogs, rangeStart, rangeEnd } = partitionLogsByOccurrenceWindow(input.logs, days, now);
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();

  const base = buildDoctorVisitSummary({
    memberName: input.memberName,
    logs: input.logs,
    insights: input.insights,
    timelineEvents: input.timelineEvents,
    days,
    now
  });

  const symptomFrequency = computeSymptomFrequencyFromLogs(currentLogs);
  const redFlagEvents = extractRedFlagEventsForWindow(input.insights, rangeStartMs, rangeEndMs);
  const aiWeeklySummaries = buildWeeklySummaryBlocks(input.weeklyDigests, rangeStartMs, rangeEndMs);

  const metadataEvidenceDigests = input.weeklyDigests.filter((d) => {
    if (!d.weekStart || !d.weekEnd) return false;
    const ws = new Date(d.weekStart).getTime();
    const we = new Date(d.weekEnd).getTime();
    return we >= rangeStartMs && ws <= rangeEndMs;
  });

  const evidenceLogIds = collectEvidenceLogIds({
    windowLogs: currentLogs,
    memberInsights: input.insights,
    timelineEvents: input.timelineEvents.filter((ev) => new Date(ev.startAt).getTime() >= rangeStartMs),
    weeklyDigests: metadataEvidenceDigests,
    redFlags: redFlagEvents
  });

  return {
    title: base.title,
    subtitle: "",
    periodLabel: base.periodLabel,
    generatedAt: base.generatedAt,
    observationalDisclaimer: DISCLAIMER,
    observationalSummary: base.summary,
    recurringSymptoms: base.recurringSymptoms,
    symptomFrequency,
    trendComparison: base.trendAnalysis,
    majorChangesTimeline: base.majorChangesTimeline,
    medicationObservations: base.medicationObservations,
    redFlagEvents,
    aiWeeklySummaries,
    metadata: {
      generatedAt: now.toISOString(),
      coveredDateRange: {
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString()
      },
      evidenceLogIds
    }
  };
}
