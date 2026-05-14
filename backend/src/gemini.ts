import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { HealthLog, Insight, Severity } from "./types.js";
import { logAIStageEvent, type AIStage } from "./ai-observability.js";
import { generateInsights } from "./patterns.js";
import { decisionEngine } from "./ai-pipeline/decisionEngine.js";
import { extractorService } from "./ai-pipeline/extractorService.js";
import { insightService } from "./ai-pipeline/insightService.js";
import { normalizerService } from "./ai-pipeline/normalizerService.js";
import { correlationService } from "./ai-pipeline/correlationService.js";
import { trendService } from "./ai-pipeline/trendService.js";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEPRECATED_MODELS = new Set(["gemini-2.0-flash", "models/gemini-2.0-flash"]);
const MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

function resolveGeminiModelName(): string {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  if (!configured) return DEFAULT_MODEL;
  if (DEPRECATED_MODELS.has(configured)) {
    console.warn(`Configured GEMINI_MODEL "${configured}" is deprecated; using ${DEFAULT_MODEL} instead.`);
    return DEFAULT_MODEL;
  }
  return configured;
}

function resolveGeminiModelCandidates(): string[] {
  return [...new Set([resolveGeminiModelName(), ...MODEL_FALLBACKS])];
}

function isModelUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("not found") || message.includes("not supported for generatecontent");
}

function toJsonSafe<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 48);
}

function clampConfidence(n: number): number {
  if (Number.isNaN(n)) return 0.55;
  return Math.min(0.92, Math.max(0.35, n));
}

function normalizeSeverity(v: unknown): Severity {
  const s = String(v || "").toLowerCase();
  if (s === "alert" || s === "warning" || s === "info") return s;
  return "info";
}

function sanitizeGeminiInsight(
  row: Record<string, unknown>,
  familyId: string,
  memberId: string,
  memberLogs: HealthLog[],
  stableIdSuffix: string
): Insight | null {
  const validIds = new Set(memberLogs.map((l) => l.id));
  const logsById = new Map(memberLogs.map((log) => [log.id, log.text]));
  const rawEvidence = Array.isArray(row.evidence)
    ? (row.evidence as unknown[]).map((x) => String(x))
    : Array.isArray(row.evidenceLogIds)
      ? (row.evidenceLogIds as unknown[]).map((x) => String(x))
    : [];
  const evidence = rawEvidence.filter((id) => validIds.has(id));
  const title = String(row.title || "").trim().slice(0, 220);
  const summary = String(row.summary || row.description || "").trim().slice(0, 600);
  const details = Array.isArray(row.details)
    ? (row.details as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
    : [];
  const typeRaw = String(row.type || "").trim().toLowerCase();
  const priorityRaw = String(row.priority || "").trim().toLowerCase();
  const keywordRaw = String(row.keyword || "").trim().toLowerCase().slice(0, 64);

  if (!title || !summary || !keywordRaw) return null;
  if (evidence.length < 2) return null;

  const confidence = clampConfidence(typeof row.confidence === "number" ? row.confidence : 0.55);
  const priority = priorityRaw === "high" || priorityRaw === "medium" || priorityRaw === "low" ? priorityRaw : "medium";
  const type =
    typeRaw === "trend" || typeRaw === "frequency" || typeRaw === "correlation" || typeRaw === "anomaly" || typeRaw === "red_flag"
      ? typeRaw
      : "trend";
  let severity = normalizeSeverity(row.severity || (priority === "high" ? "alert" : priority === "medium" ? "warning" : "info"));
  if (severity === "alert" && evidence.length < 4) severity = "warning";
  const decisionReasons = Array.isArray(row.decisionReasons)
    ? (row.decisionReasons as unknown[]).map((x) => String(x)).filter(Boolean)
    : undefined;

  return {
    id: `gem-${memberId}-${slug(keywordRaw)}-${stableIdSuffix}`,
    familyId,
    memberId,
    type,
    title,
    summary,
    details: details.length
      ? details
      : [
          `Frequency count (42 days): ${evidence.length}`,
          "Time comparison: see referenced logs for timeline context",
          "Evidence linked directly to source log IDs"
        ],
    priority,
    evidence,
    description: summary,
    severity,
    keyword: keywordRaw,
    count: evidence.length,
    confidence,
    sourceLogIds: evidence,
    evidenceSnippets: evidence.slice(0, 3).map((id) => {
      const raw = (logsById.get(id) || "").trim();
      return {
        logId: id,
        snippet: raw.length > 140 ? `${raw.slice(0, 137)}...` : raw
      };
    }).filter((row) => row.snippet.length > 0),
    evidenceLogIds: evidence,
    createdAt: new Date().toISOString(),
    source: "model",
    ...(decisionReasons && decisionReasons.length ? { decisionReasons } : {})
  };
}

function applyRuleBasedDecisionFallback(
  fallbackInsights: Insight[],
  memberLogs: HealthLog[]
): Insight[] {
  const redFlagTerms = ["chest pain", "breathlessness", "confusion", "fainting"];
  const redFlagInsights: Insight[] = [];
  const template: Insight = {
    id: "fallback-template",
    familyId: fallbackInsights[0]?.familyId || "",
    memberId: fallbackInsights[0]?.memberId || "",
    type: "red_flag",
    title: "Health pattern detected",
    summary: "",
    details: [],
    priority: "high",
    evidence: [],
    description: "",
    severity: "alert",
    keyword: "",
    count: 1,
    confidence: 0.95,
    sourceLogIds: [],
    evidenceLogIds: [],
    createdAt: new Date().toISOString(),
    source: "rules"
  };
  for (const term of redFlagTerms) {
    const matched = memberLogs.filter((l) => l.text.toLowerCase().includes(term)).map((l) => l.id);
    if (!matched.length) continue;
    redFlagInsights.push({
      ...template,
      id: `rf-${term.replace(/\s+/g, "-")}`,
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
      evidenceLogIds: matched,
      createdAt: new Date().toISOString(),
      source: "rules"
    });
  }

  const filteredRules = fallbackInsights
    .filter((ins) => ins.confidence >= 0.6)
    .filter((ins) => {
      const sevenDayAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentMatchCount = memberLogs.filter(
        (l) =>
          ins.keyword &&
          l.text.toLowerCase().includes(ins.keyword.toLowerCase()) &&
          new Date(l.occurredAt).getTime() >= sevenDayAgo
      ).length;
      return recentMatchCount >= 3 || ins.severity === "alert";
    });

  const byKeyword = new Map<string, Insight>();
  for (const ins of [...redFlagInsights, ...filteredRules]) {
    const key = ins.keyword.toLowerCase();
    const existing = byKeyword.get(key);
    if (!existing || ins.confidence > existing.confidence) byKeyword.set(key, ins);
  }
  return [...byKeyword.values()].slice(0, 5);
}

function correlationFallbackInsights(
  familyId: string,
  memberId: string,
  detections: Array<{
    symptom: string;
    correlationType: "time" | "medication" | "activity";
    description: string;
    sourceLogIds?: string[];
  }>
): Insight[] {
  return detections.map((d, i) => ({
    id: `corr-${memberId}-${slug(`${d.symptom}-${d.correlationType}-${i}`)}`,
    familyId,
    memberId,
    type: "correlation",
    title: `Possible ${d.correlationType} link for ${d.symptom}`,
    summary: d.description,
    details: [
      d.description,
      `Correlation type: ${d.correlationType}`,
      `Evidence references: ${(d.sourceLogIds || []).length} log(s)`
    ],
    priority: "medium",
    evidence: d.sourceLogIds || [],
    description: d.description,
    severity: "warning",
    keyword: d.symptom,
    count: Math.max((d.sourceLogIds || []).length, 2),
    confidence: 0.66,
    sourceLogIds: d.sourceLogIds || [],
    evidenceLogIds: d.sourceLogIds || [],
    createdAt: new Date().toISOString(),
    source: "rules"
  }));
}

export async function generateGeminiInsights(
  familyId: string,
  memberId: string,
  memberDisplayName: string,
  logs: HealthLog[],
  wellnessPulseContext?: string
): Promise<Insight[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 42);

  const memberLogs = logs
    .filter((log) => log.memberId === memberId && new Date(log.occurredAt) >= cutoff)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  if (memberLogs.length < 2) return [];

  const modelName = resolveGeminiModelName();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const runWithRetry = async <T>(stage: string, task: () => Promise<T>): Promise<T> => {
    const stageName = stage as AIStage;
    try {
      const value = await task();
      await logAIStageEvent({
        familyId,
        personId: memberId,
        stage: stageName,
        status: "success",
        retryCount: 0
      });
      return value;
    } catch (firstError) {
      console.error(`AI stage failed (${stage}) first attempt`, firstError);
      try {
        const value = await task();
        await logAIStageEvent({
          familyId,
          personId: memberId,
          stage: stageName,
          status: "success",
          retryCount: 1
        });
        return value;
      } catch (secondError) {
        await logAIStageEvent({
          familyId,
          personId: memberId,
          stage: stageName,
          status: "failure",
          errorMessage: secondError instanceof Error ? secondError.message : String(secondError),
          retryCount: 1
        });
        throw secondError;
      }
    }
  };

  try {
    const extracted = await runWithRetry("extractorService", () =>
      extractorService({
        model,
        person: memberDisplayName,
        logs: memberLogs.map((log) => ({
          id: log.id,
          text: log.text,
          occurredAt: log.occurredAt
        }))
      })
    );

    // Deterministic stage, no model call; keep explicit retry without observability stage metric.
    const normalized = await (async () => {
      try {
        return normalizerService({ events: extracted.events });
      } catch {
        return normalizerService({ events: extracted.events });
      }
    })();

    const trend = await runWithRetry("trendService", async () =>
      trendService({ events: normalized.events, lookbackDays: 30 })
    );
    const correlations = correlationService({
      events: normalized.events,
      logs: memberLogs
    });

    const generated = await runWithRetry("insightService", () =>
      insightService({
        model,
        person: memberDisplayName,
        trend,
        correlations,
        logs: memberLogs.map((log) => ({ id: log.id, text: log.text })),
        wellnessContext: wellnessPulseContext
      })
    );

    const decided = decisionEngine({
      candidateInsights: generated.insights,
      normalizedEvents: normalized.events,
      logs: memberLogs,
      includeDebugReasons: process.env.NODE_ENV !== "production"
    });

    const out: Insight[] = [];
    decided.insights.forEach((row, i) => {
      const converted = sanitizeGeminiInsight(
        {
          type: row.type,
          title: row.title,
          summary: row.summary,
          details: row.details,
          priority: row.priority,
          evidence: row.evidence,
          description: row.description,
          severity: row.severity,
          keyword: row.keyword,
          confidence: row.confidence,
          evidenceLogIds: row.evidence,
          decisionReasons: row.decisionReasons
        },
        familyId,
        memberId,
        memberLogs,
        String(i)
      );
      if (converted) out.push(converted);
    });
    return out.slice(0, 5);
  } catch (error) {
    // Fallback is deterministic and keeps pipeline resilient in production.
    console.error("AI multi-stage pipeline failed; using rule-based fallback", {
      familyId,
      memberId,
      error
    });
    await logAIStageEvent({
      familyId,
      personId: memberId,
      stage: "insight",
      status: "failure",
      errorMessage: error instanceof Error ? error.message : String(error),
      retryCount: 1
    });
    const fallback = generateInsights(familyId, memberId, memberDisplayName, memberLogs).slice(0, 12);
    const extractedFallback = normalizerService({
      events: memberLogs.map((l) => ({
        sourceLogId: l.id,
        person: memberDisplayName,
        symptoms: l.tags || [],
        severity: "low",
        timestamp: l.occurredAt
      }))
    });
    const corrFallback = correlationFallbackInsights(
      familyId,
      memberId,
      correlationService({ events: extractedFallback.events, logs: memberLogs }).correlations
    );
    return applyRuleBasedDecisionFallback([...fallback, ...corrFallback], memberLogs);
  }
}

export async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  for (const modelName of resolveGeminiModelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.15, maxOutputTokens: 512 }
      });
      const result = await model.generateContent([
        {
          text: `Transcribe the spoken caregiver note into clear spoken English prose. Omit um/uh fillers. Keep one short paragraph. If unintelligible, reply SILENT only.

Preserve everyday wording about symptoms or events—not clinical labels you invent.`
        },
        {
          inlineData: {
            mimeType,
            data: audioBase64
          }
        }
      ]);
      const text = result.response.text().trim();
      if (!text.length || /^silent\.?$/i.test(text)) return null;
      return text;
    } catch (error) {
      if (isModelUnavailableError(error)) {
        console.warn(`Gemini model "${modelName}" unavailable for transcription; trying fallback.`);
        continue;
      }
      console.error("Gemini transcription failed", error);
      return null;
    }
  }
  return null;
}

const EXTRACTION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    memberName: {
      type: SchemaType.STRING,
      description: "Exact household name from the list when obvious; otherwise empty."
    },
    tags: {
      type: SchemaType.ARRAY,
      description: "2–8 topical tags caregivers could filter later",
      items: { type: SchemaType.STRING }
    },
    normalizedText: {
      type: SchemaType.STRING,
      description: "One clear sentence caregivers can skim (no diagnoses)"
    }
  },
  required: ["memberName", "tags", "normalizedText"]
} satisfies Schema;

export async function extractStructuredHealthSignal(
  input: string,
  memberNames: string[]
): Promise<{ memberName: string | null; tags: string[]; normalizedText: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const lower = input.toLowerCase();
    const fallbackName = memberNames.find((name) => lower.includes(name.toLowerCase())) || null;
    const fallbackTags = ["sleep", "pain", "medication", "dizzy", "chest", "appetite", "fatigue"].filter((tag) =>
      lower.includes(tag)
    );
    return {
      memberName: fallbackName,
      tags: fallbackTags,
      normalizedText: input.trim()
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = resolveGeminiModelName();

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.22,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
        responseSchema: EXTRACTION_SCHEMA
      }
    });

    const esc = input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const prompt = `You normalize messy family caregiver messages for tagging only—not diagnoses.
Known household names: ${JSON.stringify(memberNames)}

Choose memberName ONLY if the message clearly refers to that person by name or obvious context; else "".
Never invent symptoms.

Message text:
"""${esc}"""`;

    const result = await model.generateContent(prompt);
    const parsed = toJsonSafe<{
      memberName?: string;
      tags?: string[];
      normalizedText?: string;
    }>(result.response.text(), {
      memberName: "",
      tags: [],
      normalizedText: input.trim()
    });

    let memberName =
      parsed.memberName && parsed.memberName.trim()
        ? memberNames.find((n) => n.toLowerCase() === parsed.memberName!.trim().toLowerCase()) || null
        : null;

    const tags = (parsed.tags || [])
      .map((t) =>
        String(t)
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .slice(0, 32)
      )
      .filter(Boolean)
      .slice(0, 10);

    return {
      memberName,
      tags,
      normalizedText: (parsed.normalizedText || input).trim()
    };
  } catch {
    const lower = input.toLowerCase();
    const fbName = memberNames.find((name) => lower.includes(name.toLowerCase())) || null;
    return {
      memberName: fbName,
      tags: [],
      normalizedText: input.trim()
    };
  }
}
