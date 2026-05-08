import { SchemaType, type GenerativeModel, type Schema } from "@google/generative-ai";
import { z } from "zod";

const extractorResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    events: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          sourceLogId: { type: SchemaType.STRING },
          person: { type: SchemaType.STRING },
          symptoms: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          severity: { type: SchemaType.STRING, format: "enum", enum: ["low", "medium", "high"] },
          timestamp: { type: SchemaType.STRING }
        },
        required: ["sourceLogId", "person", "symptoms", "severity", "timestamp"]
      }
    }
  },
  required: ["events"]
} satisfies Schema;

const ExtractedEventSchema = z.object({
  sourceLogId: z.string().min(1),
  person: z.string().min(1),
  symptoms: z.array(z.string().min(1)).default([]),
  severity: z.enum(["low", "medium", "high"]),
  timestamp: z.string().min(1)
});

const ExtractorOutputSchema = z.object({
  events: z.array(ExtractedEventSchema)
});

export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;
export type ExtractorOutput = z.infer<typeof ExtractorOutputSchema>;

export async function extractorService(params: {
  model: GenerativeModel;
  person?: string;
  knownPeople?: string[];
  logs: Array<{ id: string; text: string; occurredAt: string }>;
}): Promise<ExtractorOutput> {
  const compactLogs = params.logs.map((l) => ({
    id: l.id,
    timestamp: l.occurredAt,
    text: l.text.slice(0, 520)
  }));

  const target = params.person?.trim() || "unknown";
  const prompt = `Extract structured health events from logs for ${target}.
Return strict JSON with "events".
Rules:
- sourceLogId must be one of supplied ids.
- person should be one of known people when possible, else "unknown".
- symptoms should be short canonical-like phrases.
- severity: low|medium|high.
- preserve given timestamp.
- do not infer diagnosis.
Known people: ${JSON.stringify(params.knownPeople || [])}

Logs:
${JSON.stringify(compactLogs, null, 2)}`;

  const result = await params.model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: extractorResponseSchema,
      temperature: 0.2,
      maxOutputTokens: 2048
    }
  });

  const parsed = JSON.parse(result.response.text() || "{}");
  return ExtractorOutputSchema.parse(parsed);
}

