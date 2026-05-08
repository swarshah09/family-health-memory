import type { HealthLog } from "./types.js";

const symptomKeywords: Array<{ symptom: string; keywords: string[] }> = [
  { symptom: "sleep issues", keywords: ["sleep", "insomnia", "awake", "woke"] },
  { symptom: "fatigue", keywords: ["fatigue", "tired", "exhausted", "weak"] },
  { symptom: "pain", keywords: ["pain", "ache", "hurt", "sore"] },
  { symptom: "appetite loss", keywords: ["no appetite", "low appetite", "not eating", "loss of appetite"] },
  { symptom: "dizziness", keywords: ["dizzy", "dizziness", "lightheaded"] },
  { symptom: "breathlessness", keywords: ["breathless", "shortness of breath", "breathing trouble"] }
];

export type TimelineNarrativeEvent = {
  id: string;
  title: string;
  description: string;
  stage: "onset" | "progression" | "recurrence" | "cluster";
  symptoms: string[];
  startAt: string;
  endAt: string;
  sourceLogIds: string[];
};

function detectSymptoms(log: HealthLog): string[] {
  const text = log.text.toLowerCase();
  const fromTags = (log.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const fromText = symptomKeywords
    .filter((row) => row.keywords.some((kw) => text.includes(kw)))
    .map((row) => row.symptom);
  return [...new Set([...fromTags, ...fromText])];
}

export function buildTimelineNarrative(logs: HealthLog[]): TimelineNarrativeEvent[] {
  const sorted = [...logs].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  const rows = sorted.map((log) => ({
    logId: log.id,
    at: log.occurredAt,
    symptoms: detectSymptoms(log)
  }));
  const symptomFirstSeen = new Map<string, string>();
  const symptomLastSeen = new Map<string, string>();
  const symptomLogIds = new Map<string, string[]>();
  const symptomDays = new Map<string, Set<string>>();

  for (const row of rows) {
    for (const symptom of row.symptoms) {
      if (!symptomFirstSeen.has(symptom)) symptomFirstSeen.set(symptom, row.at);
      symptomLastSeen.set(symptom, row.at);
      if (!symptomLogIds.has(symptom)) symptomLogIds.set(symptom, []);
      symptomLogIds.get(symptom)!.push(row.logId);
      if (!symptomDays.has(symptom)) symptomDays.set(symptom, new Set());
      symptomDays.get(symptom)!.add(new Date(row.at).toISOString().slice(0, 10));
    }
  }

  const events: TimelineNarrativeEvent[] = [];
  for (const [symptom, firstAt] of symptomFirstSeen.entries()) {
    const ids = symptomLogIds.get(symptom) || [];
    const lastAt = symptomLastSeen.get(symptom) || firstAt;
    const dayCount = symptomDays.get(symptom)?.size || 0;
    events.push({
      id: `onset-${symptom.replace(/\s+/g, "-")}`,
      title: `${symptom} begins`,
      description: `${symptom} first appears in notes, marking the start of this pattern.`,
      stage: "onset",
      symptoms: [symptom],
      startAt: firstAt,
      endAt: lastAt,
      sourceLogIds: ids
    });
    if (ids.length >= 2) {
      events.push({
        id: `progression-${symptom.replace(/\s+/g, "-")}`,
        title: `${symptom} progresses over time`,
        description: `${symptom} continues to appear across later entries (${ids.length} mentions).`,
        stage: "progression",
        symptoms: [symptom],
        startAt: firstAt,
        endAt: lastAt,
        sourceLogIds: ids
      });
    }
    if (dayCount >= 2) {
      events.push({
        id: `recurrence-${symptom.replace(/\s+/g, "-")}`,
        title: `${symptom} recurs`,
        description: `${symptom} recurs across multiple days, suggesting a repeating pattern.`,
        stage: "recurrence",
        symptoms: [symptom],
        startAt: firstAt,
        endAt: lastAt,
        sourceLogIds: ids
      });
    }
  }

  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const current = rows[i];
    if (!prev.symptoms.length || !current.symptoms.length) continue;
    const overlap = current.symptoms.filter((s) => prev.symptoms.includes(s));
    if (overlap.length < 2) continue;
    events.push({
      id: `cluster-${current.logId}`,
      title: "Symptoms recur together",
      description: `${overlap.join(", ")} appear together in close sequence.`,
      stage: "cluster",
      symptoms: overlap,
      startAt: prev.at,
      endAt: current.at,
      sourceLogIds: [prev.logId, current.logId]
    });
  }

  const deduped = new Map<string, TimelineNarrativeEvent>();
  for (const event of events) {
    const key = `${event.stage}:${event.symptoms.sort().join("|")}:${event.startAt.slice(0, 10)}`;
    if (!deduped.has(key)) deduped.set(key, event);
  }
  return [...deduped.values()].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}
