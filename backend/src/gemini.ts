import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { HealthLog, Insight, Severity } from "./types.js";

const DEFAULT_MODEL = "gemini-2.0-flash";

function toJsonSafe<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

/** Extract insight rows whether the model returned an array or { insights }. */
function extractInsightRows(parsed: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object" && "insights" in parsed) {
    const inner = (parsed as { insights: unknown }).insights;
    if (Array.isArray(inner)) return inner as Array<Record<string, unknown>>;
  }
  return [];
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 48);
}

function firstName(full: string): string {
  const t = full.trim().split(/\s+/)[0];
  return t || "them";
}

function compactLogsPayload(logs: HealthLog[]): object[] {
  return logs.map((l) => ({
    id: l.id,
    occurredAt: l.occurredAt,
    text: l.text.slice(0, 520),
    tags: (l.tags || []).slice(0, 10),
    type: l.type
  }));
}

const GEMINI_INSIGHTS_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    insights: {
      type: SchemaType.ARRAY,
      description: "Trend hints for caregivers. Empty if logs do not clearly support themes.",
      minItems: 0,
      maxItems: 3,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: {
            type: SchemaType.STRING,
            description: "Brief headline caregivers can skim (addressed to adults at home)."
          },
          description: {
            type: SchemaType.STRING,
            description:
              "Max two sentences: what the notes imply in plain words, plus one calm suggestion (watch/observe/track or chat with clinician)—never a diagnosis."
          },
          severity: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["info", "warning", "alert"],
            description: "alert only if credible repetition suggests worsening; otherwise lower."
          },
          keyword: {
            type: SchemaType.STRING,
            description: "Lowercase theme keyword (sleep, dizziness, appetite, etc.)."
          },
          confidence: {
            type: SchemaType.NUMBER,
            description: "0.35–0.92 from note patterns only—not medical certainty."
          },
          evidenceLogIds: {
            type: SchemaType.ARRAY,
            description: "Only ids from supplied logs.",
            items: { type: SchemaType.STRING }
          }
        },
        required: ["title", "description", "severity", "keyword", "confidence", "evidenceLogIds"]
      }
    }
  },
  required: ["insights"]
} satisfies Schema;

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
  const rawEvidence = Array.isArray(row.evidenceLogIds)
    ? (row.evidenceLogIds as unknown[]).map((x) => String(x))
    : [];
  const evidenceLogIds = rawEvidence.filter((id) => validIds.has(id));
  const title = String(row.title || "").trim().slice(0, 220);
  const description = String(row.description || "").trim().slice(0, 1200);
  const keywordRaw = String(row.keyword || "").trim().toLowerCase().slice(0, 64);

  if (!title || !description || !keywordRaw) return null;
  if (evidenceLogIds.length < 2) return null;

  const confidence = clampConfidence(typeof row.confidence === "number" ? row.confidence : 0.55);
  let severity = normalizeSeverity(row.severity);
  if (severity === "alert" && evidenceLogIds.length < 4) severity = "warning";

  return {
    id: `gem-${memberId}-${slug(keywordRaw)}-${stableIdSuffix}`,
    familyId,
    memberId,
    title,
    description,
    severity,
    keyword: keywordRaw,
    count: evidenceLogIds.length,
    confidence,
    evidenceLogIds,
    createdAt: new Date().toISOString(),
    source: "model"
  };
}

export async function generateGeminiInsights(
  familyId: string,
  memberId: string,
  memberDisplayName: string,
  logs: HealthLog[]
): Promise<Insight[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 42);

  const memberLogs = logs
    .filter((log) => log.memberId === memberId && new Date(log.occurredAt) >= cutoff)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  if (memberLogs.length < 2) return [];

  const payload = compactLogsPayload(memberLogs.slice(0, 40));
  const nm = firstName(memberDisplayName);
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);

  const preamble = `You are an assistant helping ADULT CAREGIVERS notice themes across informal home health notes—not a clinician.
Audience: spouses, adult children, and others coordinating care.

Person in these notes is "${memberDisplayName}" (acceptable to say "${nm}" sparingly).

You must NEVER: diagnose or name a disease, claim emergencies, prescribe, or cite sources outside the logs.
Prefer zero insights when notes are unrelated noise—that is safer than guesses.
Each takeaway must cite at least two log ids exactly as given in evidenceLogIds.`;

  const prompt = `${preamble}

Recent notes JSON (each has id, occurredAt, text, tags, type):
${JSON.stringify(payload, null, 2)}

Return JSON with key "insights"—at most three items—for patterns that genuinely help caregivers prepare conversations or appointments.`;

  let parsed: unknown;

  try {
    const structured = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.34,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: GEMINI_INSIGHTS_RESPONSE_SCHEMA
      }
    });
    const text = structured.generateContent(prompt).then((r) => r.response.text());
    parsed = JSON.parse(await text);
  } catch {
    try {
      const fallback = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.34, maxOutputTokens: 2048 }
      });
      const result = await fallback.generateContent(
        `${prompt}\nRespond with ONLY valid JSON {"insights":[{"title":"","description":"","severity":"info"|"warning"|"alert","keyword":"","confidence":0.5,"evidenceLogIds":[]}]}`
      );
      parsed = toJsonSafe<unknown>(result.response.text(), { insights: [] });
    } catch {
      return [];
    }
  }

  const rows = extractInsightRows(parsed);
  const out: Insight[] = [];
  rows.forEach((row, i) => {
    const ins = sanitizeGeminiInsight(row, familyId, memberId, memberLogs, String(i));
    if (ins) out.push(ins);
  });

  return out.slice(0, 4);
}

export async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;
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
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;

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
