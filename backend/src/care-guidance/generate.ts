import { CARE_SYMPTOM_TAXONOMY } from "./taxonomy.js";
import {
  CARE_GUIDANCE_DISCLAIMER,
  type CareGuidanceItem,
  type CareGuidanceResponse,
  type CareGuidanceUrgency,
  type LogForCareGuidance,
  type SymptomTaxonomyEntry
} from "./types.js";

const MS_DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

const STRONG_WORDS =
  /\b(severe|worst|sudden|sharp|intense|unbearable|excruciating|emergency|911|er\b|can't breathe|cannot breathe|unable to breathe|passing out|passed out|fainted|blood in|hemorrhage)\b/i;
const MILD_WORDS = /\b(mild|slight|minor|a little|somewhat|briefly)\b/i;

const ORDER: CareGuidanceUrgency[] = ["low", "moderate", "high"];

function logBody(log: LogForCareGuidance): string {
  return `${log.text || ""} ${log.transcript || ""}`.toLowerCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Short tokens use word boundaries to avoid matching inside unrelated words. */
function matchesPhrase(body: string, phrase: string): boolean {
  const p = phrase.toLowerCase();
  if (p.length <= 4) {
    return new RegExp(`\\b${escapeRe(p)}\\b`, "i").test(body);
  }
  return body.includes(p);
}

function collectMatches(entry: SymptomTaxonomyEntry, logs: LogForCareGuidance[]): LogForCareGuidance[] {
  const phrases = [...entry.matchPhrases].sort((a, b) => b.length - a.length);
  return logs.filter((log) => {
    const body = logBody(log);
    return phrases.some((p) => matchesPhrase(body, p));
  });
}

function bumpUrgency(u: CareGuidanceUrgency, delta: number): CareGuidanceUrgency {
  const i = ORDER.indexOf(u);
  return ORDER[Math.min(ORDER.length - 1, Math.max(0, i + delta))];
}

function trendDelta(matches: LogForCareGuidance[], now: number): { last7: number; prev7: number } {
  const last7 = matches.filter((m) => {
    const t = new Date(m.occurredAt).getTime();
    return t >= now - 7 * MS_DAY;
  }).length;
  const prev7 = matches.filter((m) => {
    const t = new Date(m.occurredAt).getTime();
    return t >= now - 14 * MS_DAY && t < now - 7 * MS_DAY;
  }).length;
  return { last7, prev7 };
}

function durationSpanDays(matches: LogForCareGuidance[]): number {
  if (matches.length < 2) return 0;
  const times = matches.map((m) => new Date(m.occurredAt).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  return Math.max(0, Math.round((max - min) / MS_DAY));
}

function associatedLabels(
  primaryEntry: SymptomTaxonomyEntry,
  primaryMatches: LogForCareGuidance[],
  allLogs: LogForCareGuidance[],
  memberId: string
): string[] {
  const primaryIds = new Set(primaryMatches.map((m) => m.id));
  const minT = Math.min(...primaryMatches.map((m) => new Date(m.occurredAt).getTime()));
  const maxT = Math.max(...primaryMatches.map((m) => new Date(m.occurredAt).getTime()));
  const pad = 5 * MS_DAY;
  const windowLogs = allLogs.filter((l) => {
    if (l.memberId !== memberId) return false;
    const t = new Date(l.occurredAt).getTime();
    return t >= minT - pad && t <= maxT + pad && !primaryIds.has(l.id);
  });
  const labels = new Set<string>();
  for (const other of CARE_SYMPTOM_TAXONOMY) {
    if (other.id === primaryEntry.id) continue;
    const hit = windowLogs.some((log) => {
      const body = logBody(log);
      return other.matchPhrases.some((p) => matchesPhrase(body, p.toLowerCase()));
    });
    if (hit) labels.add(other.symptomLabel);
  }
  return [...labels].slice(0, 4);
}

function buildExplanation(params: {
  memberName: string;
  entry: SymptomTaxonomyEntry;
  count: number;
  durationDays: number;
  last7: number;
  prev7: number;
  hasStrong: boolean;
  hasMild: boolean;
  associated: string[];
}): string {
  const { memberName, entry, count, durationDays, last7, prev7, hasStrong, hasMild, associated } = params;
  const who = memberName.trim() || "This person";
  const theme = entry.symptomLabel;
  const specialist = entry.suggestedSpecialist;

  const parts: string[] = [];
  parts.push(
    `In recent notes, ${theme} comes up ${count} time${count === 1 ? "" : "s"} over roughly the last month for ${who}.`
  );

  if (durationDays >= 14) {
    parts.push(`The mentions are spread across several weeks, based on the dates on those entries.`);
  } else if (durationDays >= 3) {
    parts.push(`The entries span more than a few days, which can help when you review timing with a clinician.`);
  }

  if (hasStrong) {
    parts.push(`Some lines use stronger wording; sharing the original notes may help a clinician understand what you observed.`);
  } else if (hasMild) {
    parts.push(`Some descriptions sound mild in tone; still, recurring themes in logs are often worth a calm conversation with a clinician.`);
  }

  if (last7 > prev7 + 1) {
    parts.push(`Compared with the prior week, there are more mentions in the most recent week—only a count from your saved notes, not a medical judgment.`);
  } else if (prev7 > last7 + 1) {
    parts.push(`Mentions in the most recent week appear a bit less frequent than the week before, based on note dates alone.`);
  }

  if (associated.length > 0) {
    const list = associated.slice(0, 3).join(", ");
    parts.push(`Nearby entries also touch on ${list}; you could mention those together when you speak with someone on the care team.`);
  }

  parts.push(
    `If it feels right for your situation, you might bring these observations to a ${specialist} or your usual primary contact—whenever is practical for you.`
  );
  parts.push(`This line is based only on patterns in saved notes, not on a cause or diagnosis.`);

  return parts.join(" ");
}

function contextualUrgency(
  baseline: CareGuidanceUrgency,
  count: number,
  last7: number,
  prev7: number,
  hasStrong: boolean,
  hasMild: boolean,
  durationDays: number
): CareGuidanceUrgency {
  let u = baseline;
  if (hasStrong) u = bumpUrgency(u, 1);
  if (count >= 5) u = bumpUrgency(u, 1);
  if (last7 > prev7 + 1) u = bumpUrgency(u, 1);
  if (durationDays >= 14 && baseline !== "low") u = bumpUrgency(u, 1);
  if (hasMild && count <= 3 && !hasStrong) u = bumpUrgency(u, -1);
  return u;
}

/**
 * Rule-assisted suggestions from recurring symptom language in logs. Observational only.
 */
export function generateCareGuidance(
  logs: LogForCareGuidance[],
  memberNames: Map<string, string>,
  now: Date = new Date()
): CareGuidanceResponse {
  const nowMs = now.getTime();
  const cutoff = nowMs - WINDOW_DAYS * MS_DAY;

  const items: CareGuidanceItem[] = [];

  for (const memberId of new Set(logs.map((l) => l.memberId))) {
    const memberLogs = logs.filter(
      (l) => l.memberId === memberId && new Date(l.occurredAt).getTime() >= cutoff
    );
    const memberName = memberNames.get(memberId) || "Family member";

    for (const entry of CARE_SYMPTOM_TAXONOMY) {
      const matches = collectMatches(entry, memberLogs);
      if (matches.length < 2) continue;

      const bodies = matches.map(logBody);
      const hasStrong = bodies.some((b) => STRONG_WORDS.test(b));
      const hasMild = bodies.some((b) => MILD_WORDS.test(b));
      const { last7, prev7 } = trendDelta(matches, nowMs);
      const durationDays = durationSpanDays(matches);
      const urgency = contextualUrgency(
        entry.baselineUrgency,
        matches.length,
        last7,
        prev7,
        hasStrong,
        hasMild,
        durationDays
      );
      const associated = associatedLabels(entry, matches, logs, memberId);
      const explanation = buildExplanation({
        memberName,
        entry,
        count: matches.length,
        durationDays,
        last7,
        prev7,
        hasStrong,
        hasMild,
        associated
      });

      const id = `cg-${memberId}-${entry.id}`;
      items.push({
        id,
        memberId,
        memberName,
        symptomLabel: entry.symptomLabel,
        category: entry.category,
        suggestedSpecialist: entry.suggestedSpecialist,
        urgency,
        explanation,
        evidenceLogIds: matches.map((m) => m.id)
      });
    }
  }

  items.sort((a, b) => {
    const uRank = (x: CareGuidanceUrgency) => ORDER.indexOf(x);
    if (uRank(b.urgency) !== uRank(a.urgency)) return uRank(b.urgency) - uRank(a.urgency);
    return b.evidenceLogIds.length - a.evidenceLogIds.length;
  });

  return {
    disclaimer: CARE_GUIDANCE_DISCLAIMER,
    items: items.slice(0, 24)
  };
}
