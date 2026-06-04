import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-1.5-flash"];

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    mentionedPerson: {
      type: SchemaType.STRING,
      description: 'Exact roster name, "__self__" for sender, or empty if unknown'
    },
    symptomMentions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    },
    medicationMentions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    },
    timingMentions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    },
    severity: {
      type: SchemaType.STRING,
      description: "low, medium, high, or empty if not stated"
    },
    confidence: { type: SchemaType.NUMBER },
    observationType: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [
        "SELF_OBSERVATION",
        "CAREGIVER_OBSERVATION",
        "MEDICATION_UPDATE",
        "GENERAL_UPDATE",
        "UNKNOWN"
      ]
    }
  },
  required: [
    "mentionedPerson",
    "symptomMentions",
    "medicationMentions",
    "timingMentions",
    "severity",
    "confidence",
    "observationType"
  ]
} satisfies Schema;

function resolveModelName(): string {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  if (configured && !configured.includes("2.0-flash")) return configured;
  return DEFAULT_MODEL;
}

function isUnavailable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes("not found") || msg.includes("not supported");
}

export async function generateExtractionJson(
  systemInstruction: string,
  userPrompt: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const candidates = [...new Set([resolveModelName(), ...MODEL_FALLBACKS])];

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: {
          temperature: 0.18,
          maxOutputTokens: 768,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA
        }
      });

      const result = await model.generateContent(userPrompt);
      const text = result.response.text()?.trim();
      return text || null;
    } catch (error) {
      if (isUnavailable(error)) continue;
      console.error("[ai-extraction] model error", modelName, error instanceof Error ? error.message : error);
      return null;
    }
  }

  return null;
}
