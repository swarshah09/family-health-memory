import { z } from "zod";
import type { ExtractedEvent } from "./extractorService.js";

const symptomSynonyms: Record<string, string> = {
  "tight chest": "chest tightness",
  "chest discomfort": "chest tightness",
  "breathless": "shortness of breath",
  "breathing trouble": "shortness of breath",
  "low appetite": "appetite loss",
  "poor appetite": "appetite loss",
  dizzy: "dizziness",
  fatigued: "fatigue",
  tiredness: "fatigue",
  "back ache": "back pain",
  "joint ache": "joint pain"
};

const NormalizedEventSchema = z.object({
  sourceLogId: z.string().min(1),
  person: z.string().min(1),
  symptoms: z.array(z.string().min(1)),
  severity: z.enum(["low", "medium", "high"]),
  timestamp: z.string().min(1)
});

const NormalizerOutputSchema = z.object({
  events: z.array(NormalizedEventSchema)
});

export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
export type NormalizerOutput = z.infer<typeof NormalizerOutputSchema>;

function canonicalizeSymptom(raw: string): string {
  const key = raw.trim().toLowerCase();
  return symptomSynonyms[key] || key;
}

export function normalizerService(input: { events: ExtractedEvent[] }): NormalizerOutput {
  const normalized = input.events.map((ev) => ({
    ...ev,
    symptoms: [...new Set(ev.symptoms.map(canonicalizeSymptom).filter(Boolean))]
  }));
  return NormalizerOutputSchema.parse({ events: normalized });
}

