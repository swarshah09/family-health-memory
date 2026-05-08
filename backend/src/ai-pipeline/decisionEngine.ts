import { z } from "zod";
import type { HealthLog } from "../types.js";
import type { NormalizedEvent } from "./normalizerService.js";
import type { InsightOutput } from "./insightService.js";

const redFlagTerms = [
  "chest pain",
  "breathlessness",
  "confusion",
  "fainting"
] as const;

const DecisionedInsightSchema = z.object({
  type: z.enum(["trend", "frequency", "correlation", "anomaly", "red_flag"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  details: z.array(z.string().min(1)).min(1),
  priority: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string().min(1)).min(1),
  description: z.string().min(1),
  severity: z.enum(["info", "warning", "alert"]),
  keyword: z.string().min(1),
  count: z.number().int().min(1),
  confidence: z.number().min(0).max(1),
  sourceLogIds: z.array(z.string().min(1)),
  evidenceSnippets: z.array(z.object({ logId: z.string().min(1), snippet: z.string().min(1) })).optional(),
  decisionReasons: z.array(z.string().min(1)).optional()
});

const DecisionEngineOutputSchema = z.object({
  insights: z.array(DecisionedInsightSchema)
});

export type DecisionedInsight = z.infer<typeof DecisionedInsightSchema>;
export type DecisionEngineOutput = z.infer<typeof DecisionEngineOutputSchema>;

type SymptomStats = {
  sevenDayFrequency: number;
  worseningTrend: boolean;
  newSymptomSudden: boolean;
  sourceLogIds: string[];
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildStats(events: NormalizedEvent[]): Map<string, SymptomStats> {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

  const bySymptom = new Map<string, Array<{ ts: number; severity: "low" | "medium" | "high"; sourceLogId: string }>>();
  for (const ev of events) {
    const ts = new Date(ev.timestamp).getTime();
    for (const symptom of ev.symptoms) {
      const key = normalizeKey(symptom);
      if (!key) continue;
      if (!bySymptom.has(key)) bySymptom.set(key, []);
      bySymptom.get(key)!.push({ ts, severity: ev.severity, sourceLogId: ev.sourceLogId });
    }
  }

  const severityScore: Record<"low" | "medium" | "high", number> = { low: 1, medium: 2, high: 3 };
  const out = new Map<string, SymptomStats>();
  for (const [symptom, rows] of bySymptom) {
    const sorted = rows.sort((a, b) => a.ts - b.ts);
    const sevenDayRows = sorted.filter((x) => x.ts >= sevenDaysAgo);
    const firstTs = sorted[0]?.ts ?? 0;
    const oldRows = sorted.filter((x) => x.ts < sevenDaysAgo);

    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
    const firstAvg =
      firstHalf.length > 0 ? firstHalf.reduce((sum, x) => sum + severityScore[x.severity], 0) / firstHalf.length : 0;
    const secondAvg =
      secondHalf.length > 0 ? secondHalf.reduce((sum, x) => sum + severityScore[x.severity], 0) / secondHalf.length : 0;

    out.set(symptom, {
      sevenDayFrequency: sevenDayRows.length,
      worseningTrend: sorted.length >= 3 && secondAvg > firstAvg,
      newSymptomSudden: firstTs >= twoDaysAgo && oldRows.length === 0,
      sourceLogIds: [...new Set(sorted.map((x) => x.sourceLogId))]
    });
  }
  return out;
}

function findRedFlagInsights(logs: HealthLog[], includeDebugReasons: boolean): DecisionedInsight[] {
  const out: DecisionedInsight[] = [];
  const lowerLogs = logs.map((l) => ({ id: l.id, text: l.text.toLowerCase() }));
  for (const term of redFlagTerms) {
    const matched = lowerLogs.filter((l) => l.text.includes(term)).map((l) => l.id);
    if (matched.length === 0) continue;
    out.push({
      type: "red_flag",
      title: `Immediate attention trend: ${term}`,
      summary: `Recent notes repeatedly mention ${term}, so this is flagged for prompt review.`,
      details: [
        `Frequency count: ${matched.length} mentions`,
        "Time comparison: high-priority trigger based on immediate symptom risk",
        "Evidence linked directly to source logs"
      ],
      priority: "high",
      evidence: matched,
      description: `Recent notes repeatedly mention ${term}, so this is flagged for prompt review.`,
      severity: "alert",
      keyword: term,
      count: matched.length,
      confidence: 0.95,
      sourceLogIds: matched,
      ...(includeDebugReasons ? { decisionReasons: ["red_flag_term_detected"] } : {})
    });
  }
  return out;
}

function dedupeByKeyword(insights: DecisionedInsight[]): DecisionedInsight[] {
  const byKey = new Map<string, DecisionedInsight>();
  for (const ins of insights) {
    const key = normalizeKey(ins.keyword);
    const existing = byKey.get(key);
    if (!existing || ins.confidence > existing.confidence) byKey.set(key, ins);
  }
  return [...byKey.values()];
}

function computePriority(input: {
  type: DecisionedInsight["type"];
  sevenDayFrequency: number;
  worseningTrend: boolean;
  newSymptomSudden: boolean;
}): DecisionedInsight["priority"] {
  if (input.type === "red_flag") return "high";
  if (input.sevenDayFrequency >= 2 || input.worseningTrend || input.newSymptomSudden) return "medium";
  return "low";
}

function computeConfidenceFromFrequencyAndConsistency(input: {
  evidenceLogIds: string[];
  logs: HealthLog[];
}): number {
  const evidenceSet = new Set(input.evidenceLogIds);
  const now = Date.now();
  const sevenDayCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const rows = input.logs.filter((log) => evidenceSet.has(log.id));

  const frequency = rows.filter((row) => new Date(row.occurredAt).getTime() >= sevenDayCutoff).length;
  const uniqueDays = new Set(rows.map((row) => new Date(row.occurredAt).toISOString().slice(0, 10))).size;

  const frequencyScore = Math.min(1, frequency / 5); // 5+ mentions in 7d saturates
  const consistencyScore = Math.min(1, uniqueDays / 4); // spread over 4+ days is high consistency
  const confidence = 0.25 + frequencyScore * 0.45 + consistencyScore * 0.3;

  return Number(Math.max(0, Math.min(1, confidence)).toFixed(3));
}

function buildEvidenceSnippets(
  sourceLogIds: string[],
  logs: HealthLog[]
): Array<{ logId: string; snippet: string }> {
  const byId = new Map(logs.map((log) => [log.id, log.text]));
  return sourceLogIds
    .slice(0, 3)
    .map((id) => {
      const raw = (byId.get(id) || "").trim();
      const snippet = raw.length > 140 ? `${raw.slice(0, 137)}...` : raw;
      return { logId: id, snippet };
    })
    .filter((row) => row.snippet.length > 0);
}

export function decisionEngine(input: {
  candidateInsights: InsightOutput["insights"];
  normalizedEvents: NormalizedEvent[];
  logs: HealthLog[];
  includeDebugReasons?: boolean;
}): DecisionEngineOutput {
  const nowMs = Date.now();
  const toSeverity = (priority: "low" | "medium" | "high"): "info" | "warning" | "alert" =>
    priority === "high" ? "alert" : priority === "medium" ? "warning" : "info";
  const lastAndPrevious7d = (ids: string[]): { last7: number; previous7: number } => {
    const idSet = new Set(ids);
    const last7Cutoff = nowMs - 7 * 24 * 60 * 60 * 1000;
    const prev7Cutoff = nowMs - 14 * 24 * 60 * 60 * 1000;
    let last7 = 0;
    let previous7 = 0;
    for (const log of input.logs) {
      if (!idSet.has(log.id)) continue;
      const ts = new Date(log.occurredAt).getTime();
      if (ts >= last7Cutoff) last7 += 1;
      else if (ts >= prev7Cutoff) previous7 += 1;
    }
    return { last7, previous7 };
  };
  const stats = buildStats(input.normalizedEvents);
  const redFlags = findRedFlagInsights(input.logs, Boolean(input.includeDebugReasons));

  const filtered: DecisionedInsight[] = [];
  for (const raw of input.candidateInsights) {
    const key = normalizeKey(raw.keyword || "");
    const symptomStats = stats.get(key);
    if (!symptomStats) continue;

    const isCorrelation = raw.type === "correlation";
    const hasAnyEvidence = (raw.evidence?.length || raw.sourceLogIds?.length || symptomStats.sourceLogIds.length) > 0;
    const shouldShow =
      symptomStats.sevenDayFrequency >= 3 ||
      symptomStats.worseningTrend ||
      symptomStats.newSymptomSudden ||
      (isCorrelation && (raw.evidence?.length || 0) >= 2) ||
      hasAnyEvidence;
    if (!shouldShow) continue;
    const reasons: string[] = [];
    if (symptomStats.sevenDayFrequency >= 2) reasons.push("frequency>=2_in_7d");
    if (symptomStats.worseningTrend) reasons.push("worsening_trend");
    if (symptomStats.newSymptomSudden) reasons.push("new_symptom_sudden");
    if (isCorrelation) reasons.push("correlation_detected");
    if (!symptomStats.sevenDayFrequency && !symptomStats.worseningTrend && !symptomStats.newSymptomSudden) {
      reasons.push("minor_observation");
    }

    const evidence = raw.evidence?.length
      ? raw.evidence
      : raw.sourceLogIds?.length
        ? raw.sourceLogIds
        : symptomStats.sourceLogIds;
    const { last7, previous7 } = lastAndPrevious7d(evidence);
    const derivedType: DecisionedInsight["type"] = symptomStats.newSymptomSudden
      ? "anomaly"
      : symptomStats.worseningTrend
        ? "trend"
        : "frequency";
    const type = raw.type || derivedType;
    const priority = computePriority({
      type,
      sevenDayFrequency: symptomStats.sevenDayFrequency,
      worseningTrend: symptomStats.worseningTrend,
      newSymptomSudden: symptomStats.newSymptomSudden
    });
    const confidence = computeConfidenceFromFrequencyAndConsistency({
      evidenceLogIds: evidence,
      logs: input.logs
    });
    if (confidence < 0.6 && priority !== "low") continue;
    const summary = raw.summary || raw.description || `${raw.keyword || key} appears repeatedly in recent logs.`;
    const details = raw.details?.length
      ? raw.details
      : [
          `Frequency count (7 days): ${symptomStats.sevenDayFrequency}`,
          `Time comparison: last 7 days ${last7} vs previous 7 days ${previous7}`,
          "Evidence linked directly to matching source logs"
        ];

    filtered.push({
      type,
      title: raw.title,
      summary,
      details,
      priority,
      evidence,
      description: summary,
      severity: raw.severity || toSeverity(priority),
      keyword: raw.keyword || key,
      count: Math.max(raw.count || 0, symptomStats.sevenDayFrequency, 1),
      confidence,
      sourceLogIds: evidence,
      evidenceSnippets: buildEvidenceSnippets(evidence, input.logs),
      ...(input.includeDebugReasons ? { decisionReasons: reasons } : {})
    });
  }

  const finalInsights = dedupeByKeyword([...redFlags, ...filtered]);
  return DecisionEngineOutputSchema.parse({ insights: finalInsights });
}

