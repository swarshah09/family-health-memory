import type { HealthLog, Insight, WeeklyDigest } from "./types.js";
import type { TimelineNarrativeEvent } from "./timeline-narrative.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type TrendDirection = "increasing" | "decreasing" | "stable";

function normalizeSymptom(raw: string): string {
  return raw.trim().toLowerCase();
}

function toTitle(symptom: string): string {
  return symptom.replace(/\b\w/g, (c) => c.toUpperCase());
}

function weekBoundaries(reference: Date): { currentStart: number; previousStart: number } {
  const end = reference.getTime();
  return {
    currentStart: end - 7 * DAY_MS,
    previousStart: end - 14 * DAY_MS
  };
}

function symptomRows(logs: HealthLog[]): Array<{ symptom: string; ts: number; logId: string }> {
  const out: Array<{ symptom: string; ts: number; logId: string }> = [];
  for (const log of logs) {
    const ts = new Date(log.occurredAt).getTime();
    for (const tag of log.tags || []) {
      const symptom = normalizeSymptom(tag);
      if (!symptom) continue;
      out.push({ symptom, ts, logId: log.id });
    }
  }
  return out;
}

function computeTrend(current: number, previous: number): TrendDirection {
  if (current > previous) return "increasing";
  if (current < previous) return "decreasing";
  return "stable";
}

function highlightPriorityByType(type: WeeklyDigest["highlights"][number]["type"]): "low" | "medium" | "high" {
  if (type === "red_flag") return "high";
  if (type === "trend" || type === "new_symptom" || type === "behavioral_change") return "medium";
  return "low";
}

function evidenceSnippetsFor(ids: string[], logs: HealthLog[]): Array<{ logId: string; snippet: string }> {
  const byId = new Map(logs.map((l) => [l.id, l.text]));
  return ids
    .slice(0, 3)
    .map((id) => {
      const text = (byId.get(id) || "").trim();
      if (!text) return null;
      return { logId: id, snippet: text.length > 130 ? `${text.slice(0, 127)}...` : text };
    })
    .filter((row): row is { logId: string; snippet: string } => Boolean(row));
}

export function createWeeklyDigest(input: {
  memberName: string;
  familyId: string;
  userId: string;
  personId: string;
  logs: HealthLog[];
  insights: Insight[];
  timelineEvents: TimelineNarrativeEvent[];
  now?: Date;
}): Omit<WeeklyDigest, "id" | "generatedAt"> & {
  generatedAt: Date;
  weekStart: Date;
  weekEnd: Date;
  sourceLogIds: string[];
} {
  const now = input.now || new Date();
  const { currentStart, previousStart } = weekBoundaries(now);
  const rows = symptomRows(input.logs);
  const current = rows.filter((row) => row.ts >= currentStart);
  const previous = rows.filter((row) => row.ts >= previousStart && row.ts < currentStart);

  const allSymptoms = new Set([...current.map((r) => r.symptom), ...previous.map((r) => r.symptom)]);
  const stats = [...allSymptoms].map((symptom) => {
    const currentRows = current.filter((r) => r.symptom === symptom);
    const previousRows = previous.filter((r) => r.symptom === symptom);
    const recurrenceDays = new Set(currentRows.map((r) => new Date(r.ts).toISOString().slice(0, 10))).size;
    return {
      symptom,
      currentCount: currentRows.length,
      previousCount: previousRows.length,
      trend: computeTrend(currentRows.length, previousRows.length),
      recurrenceDays,
      sourceLogIds: [...new Set(currentRows.map((r) => r.logId))]
    };
  });

  const topTrends = stats
    .filter((s) => s.currentCount > 0)
    .sort((a, b) => b.currentCount - a.currentCount)
    .slice(0, 3);
  const recurring = stats.filter((s) => s.currentCount > 0 && s.recurrenceDays >= 2).sort((a, b) => b.currentCount - a.currentCount);
  const newSymptoms = stats.filter((s) => s.currentCount > 0 && s.previousCount === 0).sort((a, b) => b.currentCount - a.currentCount);

  const resolvedSymptoms = stats.filter((s) => s.currentCount === 0 && s.previousCount > 0).map((s) => s.symptom);
  const increasingSymptoms = stats.filter((s) => s.currentCount > s.previousCount).map((s) => s.symptom);
  const decreasingSymptoms = stats.filter((s) => s.currentCount < s.previousCount && s.currentCount > 0).map((s) => s.symptom);
  const redFlags = input.insights
    .filter((ins) => ins.type === "red_flag")
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);
  const behavioralChanges = input.timelineEvents
    .filter((ev) => ev.stage === "cluster" || ev.stage === "progression")
    .slice(0, 2);

  const highlights: WeeklyDigest["highlights"] = [];
  for (const item of recurring.slice(0, 3)) {
    highlights.push({
      type: "recurring",
      title: `${toTitle(item.symptom)} recurred this week`,
      description: `${toTitle(item.symptom)} appeared on multiple days, suggesting a continuing pattern.`,
      priority: highlightPriorityByType("recurring"),
      confidence: Number(Math.min(0.95, 0.55 + item.currentCount * 0.08).toFixed(3)),
      evidenceLogIds: item.sourceLogIds,
      evidenceSnippets: evidenceSnippetsFor(item.sourceLogIds, input.logs)
    });
  }
  for (const item of topTrends.slice(0, 2)) {
    highlights.push({
      type: "trend",
      title: `${toTitle(item.symptom)} trend is ${item.trend}`,
      description: `${toTitle(item.symptom)} was logged ${item.currentCount} times this week versus ${item.previousCount} last week.`,
      priority: highlightPriorityByType("trend"),
      confidence: Number(Math.min(0.95, 0.6 + item.currentCount * 0.06).toFixed(3)),
      evidenceLogIds: item.sourceLogIds,
      evidenceSnippets: evidenceSnippetsFor(item.sourceLogIds, input.logs)
    });
  }
  for (const symptom of newSymptoms.slice(0, 2)) {
    highlights.push({
      type: "new_symptom",
      title: `${toTitle(symptom.symptom)} appeared newly`,
      description: `${toTitle(symptom.symptom)} appears this week but was not seen in the previous week.`,
      priority: highlightPriorityByType("new_symptom"),
      confidence: 0.68,
      evidenceLogIds: symptom.sourceLogIds,
      evidenceSnippets: evidenceSnippetsFor(symptom.sourceLogIds, input.logs)
    });
  }
  for (const symptom of resolvedSymptoms.slice(0, 2)) {
    highlights.push({
      type: "resolved_symptom",
      title: `${toTitle(symptom)} appears to have settled`,
      description: `${toTitle(symptom)} was present last week but not observed in current-week notes.`,
      priority: highlightPriorityByType("resolved_symptom"),
      confidence: 0.64,
      evidenceLogIds: previous.filter((p) => p.symptom === symptom).map((p) => p.logId).slice(0, 3),
      evidenceSnippets: evidenceSnippetsFor(previous.filter((p) => p.symptom === symptom).map((p) => p.logId), input.logs)
    });
  }
  for (const ins of redFlags) {
    highlights.push({
      type: "red_flag",
      title: ins.title,
      description: ins.summary,
      priority: highlightPriorityByType("red_flag"),
      confidence: ins.confidence || 0.8,
      evidenceLogIds: ins.sourceLogIds || ins.evidence || [],
      evidenceSnippets: evidenceSnippetsFor(ins.sourceLogIds || ins.evidence || [], input.logs)
    });
  }
  for (const ev of behavioralChanges) {
    highlights.push({
      type: "behavioral_change",
      title: ev.title,
      description: ev.description,
      priority: highlightPriorityByType("behavioral_change"),
      confidence: 0.66,
      evidenceLogIds: ev.sourceLogIds,
      evidenceSnippets: evidenceSnippetsFor(ev.sourceLogIds, input.logs)
    });
  }

  const totalCurrent = current.length;
  const totalPrevious = previous.length;
  const weekComparison =
    totalCurrent > totalPrevious
      ? "more symptom mentions than last week"
      : totalCurrent < totalPrevious
        ? "fewer symptom mentions than last week"
        : "a similar symptom load compared with last week";
  const summary = `${input.memberName}'s week shows ${weekComparison}. ${recurring.length ? "A few patterns repeat, so steady monitoring is helpful." : "No strongly repeating issue stands out right now."}`;

  return {
    familyId: input.familyId,
    userId: input.userId,
    personId: input.personId,
    title: `Weekly health digest for ${input.memberName}`,
    summary,
    highlights: highlights.slice(0, 10),
    comparison: {
      symptomIncrease: increasingSymptoms.slice(0, 8).map(toTitle),
      symptomDecrease: decreasingSymptoms.slice(0, 8).map(toTitle),
      newlyAppeared: newSymptoms.slice(0, 8).map((s) => toTitle(s.symptom)),
      resolved: resolvedSymptoms.slice(0, 8).map(toTitle)
    },
    generatedAt: now,
    weekStart: new Date(currentStart),
    weekEnd: now,
    sourceLogIds: [...new Set(current.map((r) => r.logId))]
  };
}
