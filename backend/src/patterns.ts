import { HealthLog, Insight, Severity } from "./types.js";

const KEYWORDS = [
  "pain",
  "headache",
  "tired",
  "fatigue",
  "sleep",
  "insomnia",
  "dizzy",
  "nausea",
  "chest tightness",
  "chest discomfort",
  "breathing",
  "cough",
  "fever",
  "swelling",
  "weakness",
  "appetite",
  "weight",
  "pressure",
  "anxiety",
  "stress",
  "joint pain",
  "back pain",
  "stomach",
  "heart"
];

function collectKeywordMatches(logs: HealthLog[], keyword: string): HealthLog[] {
  return logs.filter((log) => log.text.toLowerCase().includes(keyword));
}

function severityByCount(count: number): Severity {
  if (count >= 4) return "alert";
  if (count >= 2) return "warning";
  return "info";
}

function priorityFromSeverity(severity: Severity): "low" | "medium" | "high" {
  if (severity === "alert") return "high";
  if (severity === "warning") return "medium";
  return "low";
}

export function generateInsights(
  familyId: string,
  memberId: string,
  memberDisplayName: string,
  logs: HealthLog[],
  now: Date = new Date()
): Insight[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);

  const recentLogs = logs.filter(
    (log) => log.memberId === memberId && new Date(log.occurredAt) >= cutoff
  );

  const who = memberDisplayName.trim() || "This person";

  const insights: Insight[] = [];
  for (const keyword of KEYWORDS) {
    const matches = collectKeywordMatches(recentLogs, keyword);
    if (matches.length < 2) continue;

    const last7 = matches.filter(
      (m) => new Date(m.occurredAt).getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000
    ).length;
    const previous7 = matches.filter((m) => {
      const ts = new Date(m.occurredAt).getTime();
      const upper = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      const lower = now.getTime() - 14 * 24 * 60 * 60 * 1000;
      return ts >= lower && ts < upper;
    }).length;
    const severity = severityByCount(matches.length);
    const confidence = Math.min(0.55 + matches.length * 0.1, 0.95);
    const priority = priorityFromSeverity(severity);
    const evidence = matches.map((m) => m.id);
    const summary =
      severity === "alert"
        ? `${keyword} appears repeatedly in recent caregiver logs and needs closer follow-up.`
        : `${keyword} appears multiple times in recent logs and should be tracked over time.`;
    insights.push({
      id: `ins-${memberId}-${keyword.replace(/\s+/g, "-")}`,
      familyId,
      memberId,
      type: "frequency",
      title:
        severity === "alert"
          ? `${who}'s logs mention "${keyword}" several times recently`
          : `${who}: "${keyword}" comes up across recent notes`,
      summary,
      details: [
        `Frequency count (30 days): ${matches.length} mentions`,
        `Time comparison: last 7 days ${last7} vs previous 7 days ${previous7}`,
        `Pattern source: repeated keyword mentions in caregiver notes`
      ],
      priority,
      evidence,
      description: summary,
      severity,
      keyword,
      count: matches.length,
      confidence,
      sourceLogIds: evidence,
      evidenceSnippets: matches.slice(0, 3).map((m) => ({
        logId: m.id,
        snippet: m.text.length > 140 ? `${m.text.slice(0, 137)}...` : m.text
      })),
      evidenceLogIds: evidence,
      createdAt: now.toISOString(),
      source: "rules"
    });
  }

  return insights.sort((a, b) => b.count - a.count).slice(0, 8);
}
