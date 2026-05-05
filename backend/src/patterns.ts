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

    const severity = severityByCount(matches.length);
    const confidence = Math.min(0.55 + matches.length * 0.1, 0.95);
    insights.push({
      id: `ins-${memberId}-${keyword.replace(/\s+/g, "-")}`,
      familyId,
      memberId,
      title:
        severity === "alert"
          ? `${who}'s logs mention "${keyword}" several times recently`
          : `${who}: "${keyword}" comes up across recent notes`,
      description:
        severity === "alert"
          ? `Across the last ~30 days, ${who}'s caregivers recorded "${keyword}" more than usual. Patterns like this may be worth mentioning at the next clinician visit—they do not diagnose anything on their own.`
          : `You logged "${keyword}" a few times in the past month. Watching whether it continues might help decide if you want a routine check‑in.`,
      severity,
      keyword,
      count: matches.length,
      confidence,
      evidenceLogIds: matches.map((m) => m.id),
      createdAt: now.toISOString(),
      source: "rules"
    });
  }

  return insights.sort((a, b) => b.count - a.count).slice(0, 8);
}
