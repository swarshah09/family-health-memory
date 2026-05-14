import { SchemaType, type GenerativeModel, type Schema } from "@google/generative-ai";
import { z } from "zod";
import type { TrendOutput } from "./trendService.js";
import type { CorrelationOutput } from "./correlationService.js";

const insightResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    insights: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["trend", "frequency", "correlation", "anomaly", "red_flag"]
          },
          title: { type: SchemaType.STRING },
          summary: { type: SchemaType.STRING },
          details: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          priority: { type: SchemaType.STRING, format: "enum", enum: ["low", "medium", "high"] },
          description: { type: SchemaType.STRING },
          severity: { type: SchemaType.STRING, format: "enum", enum: ["info", "warning", "alert"] },
          keyword: { type: SchemaType.STRING },
          count: { type: SchemaType.INTEGER },
          confidence: { type: SchemaType.NUMBER },
          evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          sourceLogIds: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          evidenceSnippets: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                logId: { type: SchemaType.STRING },
                snippet: { type: SchemaType.STRING }
              },
              required: ["logId", "snippet"]
            }
          }
        },
        required: ["type", "title", "summary", "details", "priority", "confidence", "evidence", "sourceLogIds"]
      }
    }
  },
  required: ["insights"]
} satisfies Schema;

const InsightItemSchema = z.object({
  type: z.enum(["trend", "frequency", "correlation", "anomaly", "red_flag"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  details: z.array(z.string().min(1)).min(1),
  priority: z.enum(["low", "medium", "high"]),
  description: z.string().min(1).optional(),
  severity: z.enum(["info", "warning", "alert"]).optional(),
  keyword: z.string().min(1).optional(),
  count: z.number().int().min(1).optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).min(1),
  sourceLogIds: z.array(z.string().min(1)).min(1),
  evidenceSnippets: z.array(z.object({ logId: z.string().min(1), snippet: z.string().min(1) })).optional()
});

const InsightOutputSchema = z.object({
  insights: z.array(InsightItemSchema)
});

export type InsightOutput = z.infer<typeof InsightOutputSchema>;

type InsightItem = z.infer<typeof InsightItemSchema>;
type EvidenceSnippet = { logId: string; snippet: string };
type NormalizedInsight = InsightItem & { evidenceSnippets: EvidenceSnippet[] };

function buildEvidenceSnippets(
  sourceLogIds: string[],
  logTextById: Map<string, string>
): EvidenceSnippet[] {
  return sourceLogIds
    .slice(0, 3)
    .map((id) => {
      const raw = (logTextById.get(id) || "").trim();
      if (!raw) return null;
      return {
        logId: id,
        snippet: raw.length > 140 ? `${raw.slice(0, 137)}...` : raw
      };
    })
    .filter((row): row is { logId: string; snippet: string } => Boolean(row));
}

function buildRuleBasedCorrelationInsights(
  correlations: CorrelationOutput
): Array<InsightItem> {
  return correlations.correlations.map((corr) => {
    const evidence = corr.sourceLogIds.length ? corr.sourceLogIds : [`correlation:${corr.symptom}:${corr.correlationType}`];
    return {
      type: "correlation",
      title: `Possible ${corr.correlationType} link for ${corr.symptom}`,
      summary: corr.description,
      details: [
        corr.description,
        `Correlation type: ${corr.correlationType}`,
        `Evidence references: ${corr.sourceLogIds.length} log(s)`
      ],
      priority: "medium",
      description: corr.description,
      severity: "warning",
      keyword: corr.symptom,
      count: Math.max(corr.sourceLogIds.length, 1),
      confidence: 0.66,
      evidence,
      sourceLogIds: corr.sourceLogIds.length ? corr.sourceLogIds : evidence
    };
  });
}

export async function insightService(params: {
  model: GenerativeModel;
  person: string;
  trend: TrendOutput;
  correlations: CorrelationOutput;
  logs?: Array<{ id: string; text: string }>;
  /** Optional non-diagnostic wellness pulse context; must not replace log evidence. */
  wellnessContext?: string;
}): Promise<InsightOutput> {
  const toSeverity = (priority: "low" | "medium" | "high"): "info" | "warning" | "alert" =>
    priority === "high" ? "alert" : priority === "medium" ? "warning" : "info";
  const prompt = `You are a caregiver assistant.
Convert trend JSON into concise insights for ${params.person}.
Rules:
- strict JSON only with key "insights"
- no diagnosis
- no emergency language
- max 5 insights
- use trend fields directly: count, previousCount, trend, firstSeen, lastSeen
- treat firstSeen as onset and lastSeen as most recent occurrence
- include frequency counts in details
- include time-based comparisons in details (last 7d vs previous 7d)
- mention recurrence when trend.recurrence is true (appears across multiple days)
- evidence/sourceLogIds must come from provided trends/correlations
- every insight must include sourceLogIds for traceability
- optionally include evidenceSnippets as [{logId, snippet}] using short original-text excerpts
- use correlations when relevant:
  - medication: symptom appears after medication mentions
  - time: symptom clusters in morning/night
  - activity: symptom linked with walking/eating notes
- when a correlation is strong, prefer insight type "correlation"

Trend data:
${JSON.stringify(params.trend, null, 2)}

Correlation data:
${JSON.stringify(params.correlations, null, 2)}
${
  params.wellnessContext?.trim()
    ? `

Additional non-diagnostic context (camera fingertip pulse rhythm estimates; not blood pressure; not medical advice):
${params.wellnessContext.trim()}
When relevant, you may weave gentle wellness-oriented phrasing that relates log mentions (e.g. fatigue, sleep, dizziness) to these pulse rhythm snapshots in time. Do not diagnose. Do not imply hypertension. Evidence/sourceLogIds must still reference supplied log IDs only.`
    : ""
}`;

  const result = await params.model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: insightResponseSchema,
      temperature: 0.25,
      maxOutputTokens: 2048
    }
  });

  const parsed = InsightOutputSchema.parse(JSON.parse(result.response.text() || "{}"));
  const ruleBasedCorrelations = buildRuleBasedCorrelationInsights(params.correlations);
  const merged = [...parsed.insights, ...ruleBasedCorrelations];
  const logTextById = new Map((params.logs || []).map((log) => [log.id, log.text]));
  const validLogIds = new Set((params.logs || []).map((log) => log.id));
  const knownSourceIds = new Set([
    ...params.trend.trends.flatMap((item) => item.sourceLogIds),
    ...params.correlations.correlations.flatMap((item) => item.sourceLogIds)
  ]);
  const isValidId = (id: string) => (validLogIds.size ? validLogIds.has(id) : knownSourceIds.has(id));
  const normalizedMapped: Array<NormalizedInsight | null> = merged.map((ins) => {
      const sourceLogIds = [...new Set((ins.sourceLogIds || []).filter((id) => isValidId(id)))];
      const evidence = [...new Set((ins.evidence || sourceLogIds).filter((id) => isValidId(id)))];
      const finalSourceLogIds = sourceLogIds.length ? sourceLogIds : evidence;
      if (!finalSourceLogIds.length) return null;
      const evidenceSnippets = ins.evidenceSnippets?.filter((s) => finalSourceLogIds.includes(s.logId));
      return {
        ...ins,
        evidence: evidence.length ? evidence : finalSourceLogIds,
        sourceLogIds: finalSourceLogIds,
        evidenceSnippets:
          evidenceSnippets && evidenceSnippets.length > 0
            ? evidenceSnippets
            : buildEvidenceSnippets(finalSourceLogIds, logTextById)
      };
    });
  const normalized = normalizedMapped.filter((ins): ins is NormalizedInsight => ins !== null);
  const dedupedByTypeAndKeyword = new Map<string, NormalizedInsight>();
  for (const ins of normalized) {
    const key = `${ins.type}:${(ins.keyword || "").trim().toLowerCase()}`;
    const existing = dedupedByTypeAndKeyword.get(key);
    if (!existing || ins.confidence > existing.confidence) {
      dedupedByTypeAndKeyword.set(key, ins);
    }
  }
  return {
    insights: [...dedupedByTypeAndKeyword.values()].slice(0, 5).map((ins) => ({
      ...ins,
      description: ins.description || ins.summary,
      severity: ins.severity || toSeverity(ins.priority),
      keyword: ins.keyword || ins.type,
      count: typeof ins.count === "number" ? ins.count : ins.evidence.length,
      sourceLogIds: ins.sourceLogIds?.length ? ins.sourceLogIds : ins.evidence,
      evidenceSnippets: ins.evidenceSnippets
    }))
  };
}

