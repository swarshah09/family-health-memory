import { z } from "zod";
import type { HealthLog } from "../types.js";
import type { NormalizedEvent } from "./normalizerService.js";

const CorrelationItemSchema = z.object({
  symptom: z.string().min(1),
  correlationType: z.enum(["time", "medication", "activity"]),
  description: z.string().min(1),
  sourceLogIds: z.array(z.string().min(1)).default([])
});

const CorrelationOutputSchema = z.object({
  correlations: z.array(CorrelationItemSchema)
});

export type CorrelationOutput = z.infer<typeof CorrelationOutputSchema>;

const medicationKeywords = [
  "medication",
  "medicine",
  "tablet",
  "pill",
  "dose",
  "antibiotic",
  "painkiller"
];

const activityKeywordGroups: Array<{ label: string; keywords: string[] }> = [
  { label: "walking", keywords: ["walk", "walking", "stroll"] },
  { label: "eating", keywords: ["eat", "eating", "meal", "food"] }
];
const MIN_CORRELATED_MENTIONS = 2;
const MEDICATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

function timeBucket(iso: string): "morning" | "night" | "other" {
  const hour = new Date(iso).getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 18 || hour < 5) return "night";
  return "other";
}

export function correlationService(input: {
  events: NormalizedEvent[];
  logs: Array<Pick<HealthLog, "id" | "text" | "occurredAt">>;
}): CorrelationOutput {
  const logsById = new Map(
    input.logs.map((l) => [
      l.id,
      {
        text: l.text.toLowerCase(),
        ts: new Date(l.occurredAt).getTime(),
        occurredAt: l.occurredAt
      }
    ])
  );

  const medicationLogs = input.logs
    .map((l) => ({
      id: l.id,
      text: l.text.toLowerCase(),
      ts: new Date(l.occurredAt).getTime()
    }))
    .filter((l) => includesAny(l.text, medicationKeywords));

  const bySymptom = new Map<string, Array<{ sourceLogId: string; timestamp: string }>>();
  for (const ev of input.events) {
    for (const symptom of ev.symptoms) {
      const key = symptom.trim().toLowerCase();
      if (!key) continue;
      if (!bySymptom.has(key)) bySymptom.set(key, []);
      bySymptom.get(key)!.push({ sourceLogId: ev.sourceLogId, timestamp: ev.timestamp });
    }
  }

  const correlations: CorrelationOutput["correlations"] = [];

  for (const [symptom, rows] of bySymptom.entries()) {
    const sourceLogIds = [...new Set(rows.map((r) => r.sourceLogId))];
    if (!sourceLogIds.length) continue;

    const morningIds: string[] = [];
    const nightIds: string[] = [];
    for (const row of rows) {
      const bucket = timeBucket(row.timestamp);
      if (bucket === "morning") morningIds.push(row.sourceLogId);
      if (bucket === "night") nightIds.push(row.sourceLogId);
    }
    const dominantBucket =
      morningIds.length >= MIN_CORRELATED_MENTIONS && morningIds.length >= nightIds.length
        ? "morning"
        : nightIds.length >= MIN_CORRELATED_MENTIONS
          ? "night"
          : null;
    if (dominantBucket) {
      const bucketIds = dominantBucket === "morning" ? morningIds : nightIds;
      correlations.push({
        symptom,
        correlationType: "time",
        description: `${symptom} appears clustered in the ${dominantBucket} (${bucketIds.length} recent mentions).`,
        sourceLogIds: [...new Set(bucketIds)]
      });
    }

    const medicationLinkedIds: string[] = [];
    for (const row of rows) {
      const rowTs = new Date(row.timestamp).getTime();
      const hasMedicationBefore = medicationLogs.some(
        (m) => m.ts <= rowTs && rowTs - m.ts <= MEDICATION_WINDOW_MS
      );
      if (hasMedicationBefore) medicationLinkedIds.push(row.sourceLogId);
    }
    if (medicationLinkedIds.length >= MIN_CORRELATED_MENTIONS) {
      correlations.push({
        symptom,
        correlationType: "medication",
        description: `${symptom} often appears after medication mentions (within ~24 hours).`,
        sourceLogIds: [...new Set(medicationLinkedIds)]
      });
    }

    for (const group of activityKeywordGroups) {
      const linkedIds: string[] = [];
      for (const sourceLogId of sourceLogIds) {
        const log = logsById.get(sourceLogId);
        if (!log) continue;
        if (includesAny(log.text, group.keywords)) linkedIds.push(sourceLogId);
      }
      if (linkedIds.length >= MIN_CORRELATED_MENTIONS) {
        correlations.push({
          symptom,
          correlationType: "activity",
          description: `${symptom} is frequently mentioned alongside ${group.label}-related activity notes.`,
          sourceLogIds: [...new Set(linkedIds)]
        });
      }
    }
  }

  const deduped = new Map<string, CorrelationOutput["correlations"][number]>();
  for (const item of correlations) {
    const key = `${item.symptom}::${item.correlationType}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }

  return CorrelationOutputSchema.parse({ correlations: [...deduped.values()] });
}

