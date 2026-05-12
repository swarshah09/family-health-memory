import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import type { HealthLog, MemorySearchCitation, MemorySearchResult } from "./types.js";
import { listMembers, listRecentLogsForFamily } from "./store.js";
import type { ViewerContext } from "./workspace-permissions.js";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "has",
  "have",
  "been",
  "this",
  "that",
  "with",
  "from",
  "they",
  "will",
  "what",
  "when",
  "where",
  "which",
  "who",
  "how",
  "did",
  "does",
  "had",
  "any",
  "into",
  "than",
  "then",
  "too",
  "very"
]);

function resolveGeminiModelCandidates(): string[] {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  const primary = configured && !configured.includes("2.0-flash") ? configured : DEFAULT_MODEL;
  return [...new Set([primary, ...MODEL_FALLBACKS])];
}

function isModelUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("not found") || message.includes("not supported for generatecontent");
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function scoreLog(log: HealthLog, tokens: string[]): number {
  const hay = `${log.text} ${(log.tags || []).join(" ")} ${log.transcript || ""}`.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    if (hay.includes(t)) s += 1;
  }
  return s;
}

function selectLogsForContext(params: { logs: HealthLog[]; query: string; cap: number }): HealthLog[] {
  const tokens = tokenize(params.query);
  const scored = params.logs.map((log) => ({
    log,
    score: tokens.length ? scoreLog(log, tokens) : 0
  }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      new Date(b.log.occurredAt).getTime() - new Date(a.log.occurredAt).getTime()
  );
  const picked: HealthLog[] = [];
  const seen = new Set<string>();
  for (const { log } of scored) {
    if (picked.length >= params.cap) break;
    if (seen.has(log.id)) continue;
    seen.add(log.id);
    picked.push(log);
  }
  if (tokens.length && picked.length < 30) {
    const recent = [...params.logs].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
    for (const log of recent) {
      if (picked.length >= params.cap) break;
      if (seen.has(log.id)) continue;
      seen.add(log.id);
      picked.push(log);
    }
  }
  return picked.slice(0, params.cap);
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 3)}...`;
}

const memorySearchResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    answer: { type: SchemaType.STRING },
    citations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          logId: { type: SchemaType.STRING },
          excerpt: { type: SchemaType.STRING },
          rationale: { type: SchemaType.STRING }
        },
        required: ["logId", "excerpt"]
      }
    },
    followUpSuggestions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    },
    confidence: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["high", "medium", "low"]
    }
  },
  required: ["answer", "citations", "followUpSuggestions", "confidence"]
};

function parseModelJson(raw: string): {
  answer: string;
  citations: Array<{ logId: string; excerpt: string; rationale?: string }>;
  followUpSuggestions: string[];
  confidence: string;
} {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      answer: String(o.answer || "").trim(),
      citations: Array.isArray(o.citations)
        ? (o.citations as unknown[])
            .map((c) => {
              const row = c as { logId?: string; excerpt?: string; rationale?: string };
              if (!row.logId || !row.excerpt) return null;
              return {
                logId: String(row.logId),
                excerpt: String(row.excerpt).trim(),
                rationale: row.rationale ? String(row.rationale).trim() : undefined
              };
            })
            .filter(Boolean) as Array<{ logId: string; excerpt: string; rationale?: string }>
        : [],
      followUpSuggestions: Array.isArray(o.followUpSuggestions)
        ? (o.followUpSuggestions as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
        : [],
      confidence: String(o.confidence || "medium").toLowerCase()
    };
  } catch {
    return {
      answer: "We could not parse the model response. Try a shorter or more specific question.",
      citations: [],
      followUpSuggestions: [],
      confidence: "low"
    };
  }
}

function normalizeConfidence(v: string): "high" | "medium" | "low" {
  if (v === "high" || v === "low") return v;
  return "medium";
}

export async function runMemorySearch(input: {
  familyId: string;
  query: string;
  memberId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  viewer?: ViewerContext;
}): Promise<MemorySearchResult> {
  const members = await listMembers(input.familyId);
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  const retrievalParts = [
    input.query,
    ...(input.history || [])
      .filter((h) => h.role === "user")
      .slice(-2)
      .map((h) => h.content)
  ];
  const retrievalQuery = retrievalParts.join(" ").slice(0, 2000);

  const pool = await listRecentLogsForFamily(input.familyId, {
    memberId: input.memberId,
    sinceDays: 180,
    limit: 480,
    viewer: input.viewer
  });

  if (pool.length === 0) {
    return {
      answer:
        "There are no health log entries in the selected window yet. Add a few dated observations (symptoms, sleep, medications, energy) and ask again.",
      citations: [],
      followUpSuggestions: [
        "When did fatigue start?",
        "Has sleep worsened recently?",
        "What changed after medicine?"
      ],
      confidence: "low",
      logsConsidered: 0
    };
  }

  const contextLogs = selectLogsForContext({ logs: pool, query: retrievalQuery, cap: 80 });
  const logById = new Map(contextLogs.map((l) => [l.id, l]));

  const catalog = contextLogs
    .map((log) => {
      const mn = nameById.get(log.memberId) || "Family member";
      const body = clip(log.text, 380);
      const voiceNote =
        log.type === "voice" && log.transcript?.trim()
          ? `\nTranscript (voice): ${clip(log.transcript, 320)}`
          : "";
      return `[logId:${log.id}|memberId:${log.memberId}|memberName:${mn}|occurredAt:${log.occurredAt}|type:${log.type}|tags:${(log.tags || []).join(",")}]\n${body}${voiceNote}`;
    })
    .join("\n\n---\n\n");

  const historyBlock =
    input.history && input.history.length > 0
      ? input.history
          .slice(-10)
          .map((h) => `${h.role.toUpperCase()}: ${clip(h.content, 1500)}`)
          .join("\n\n")
      : "(no prior turns)";

  const prompt = `You help a family review their PRIVATE health observation logs. You are not a doctor.

Rules:
- Answer ONLY using information that appears in the LOG CATALOG below. If the catalog does not support an answer, say what is missing and suggest what to log next.
- Do NOT diagnose, prescribe, or give emergency instructions. Use observational language ("the logs note...", "entries suggest...").
- When you state a time trend (e.g. worsened recently), tie it to dated log lines and cite logId values.
- If the user asks about medication changes, look for medication-related entries and temporal ordering in the catalog.
- Output must follow the JSON schema you were given (answer, citations, followUpSuggestions, confidence).

LOG CATALOG (only trustworthy source):
${catalog}

Prior conversation (may help disambiguate; still ground claims in LOG CATALOG):
${historyBlock}

User question:
${clip(input.query, 1800)}`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    return {
      answer:
        "Conversational memory search needs a configured GEMINI_API_KEY on the server. Once set, you can ask questions in everyday language and answers will cite your log entries.",
      citations: [],
      followUpSuggestions: [
        "When did fatigue start?",
        "Has sleep worsened recently?",
        "What changed after medicine?"
      ],
      confidence: "low",
      logsConsidered: contextLogs.length,
      modelDisabled: true
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const candidates = resolveGeminiModelCandidates();
  let lastError: unknown;
  let rawText = "";

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: memorySearchResponseSchema,
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      });
      rawText = result.response.text() || "{}";
      break;
    } catch (err) {
      lastError = err;
      if (isModelUnavailableError(err)) continue;
      throw err;
    }
  }

  if (!rawText) {
    console.error("Memory search: all Gemini model candidates failed", lastError);
    return {
      answer: "The AI service is temporarily unavailable. Please try again in a few minutes.",
      citations: [],
      followUpSuggestions: [],
      confidence: "low",
      logsConsidered: contextLogs.length
    };
  }

  const parsed = parseModelJson(rawText);
  const confidence = normalizeConfidence(parsed.confidence);

  const citations: MemorySearchCitation[] = [];
  for (const c of parsed.citations.slice(0, 12)) {
    const log = logById.get(c.logId);
    if (!log) continue;
    const memberName = nameById.get(log.memberId) || "Family member";
    citations.push({
      logId: log.id,
      memberId: log.memberId,
      memberName,
      occurredAt: log.occurredAt,
      excerpt: clip(c.excerpt || log.text, 220),
      rationale: c.rationale ? clip(c.rationale, 200) : undefined
    });
  }

  return {
    answer: clip(parsed.answer, 6000),
    citations,
    followUpSuggestions: parsed.followUpSuggestions.length
      ? parsed.followUpSuggestions
      : [
          "When did fatigue start?",
          "Has sleep worsened recently?",
          "What changed after medicine?"
        ],
    confidence,
    logsConsidered: contextLogs.length
  };
}
