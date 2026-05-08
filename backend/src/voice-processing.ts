import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractorService } from "./ai-pipeline/extractorService.js";
import { transcribeAudioWithGemini } from "./gemini.js";
import { FamilyMemberModel, HealthLogModel } from "./models.js";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEPRECATED_MODELS = new Set(["gemini-2.0-flash", "models/gemini-2.0-flash"]);
const MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

function resolveGeminiModelCandidates(): string[] {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  const preferred = !configured || DEPRECATED_MODELS.has(configured) ? DEFAULT_MODEL : configured;
  return [...new Set([preferred, ...MODEL_FALLBACKS])];
}

function isModelUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("not found") || message.includes("not supported for generatecontent");
}

function placeholderTranscript(): string {
  return "Voice note received. Transcription is unavailable right now.";
}

async function transcribeWithWhisper(
  audioBuffer: Buffer,
  mimeType: string,
  filename = "voice.webm"
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), filename);
    form.append("model", "whisper-1");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`Whisper transcription failed (${response.status})`);
    }

    const json = (await response.json()) as { text?: string };
    const text = (json.text || "").trim();
    return text.length ? text : null;
  } catch (error) {
    console.error("Whisper transcription error", error);
    return null;
  }
}

async function extractTagsFromTranscript(params: {
  familyId: string;
  memberName: string;
  transcript: string;
}): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];
  const modelCandidates = resolveGeminiModelCandidates();
  for (let idx = 0; idx < modelCandidates.length; idx += 1) {
    const modelName = modelCandidates[idx];
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });
      const extracted = await extractorService({
        model,
        person: params.memberName,
        knownPeople: [params.memberName],
        logs: [
          {
            id: "voice-transcript",
            text: params.transcript,
            occurredAt: new Date().toISOString()
          }
        ]
      });
      const first = extracted.events[0];
      if (!first) return [];
      return [...new Set((first.symptoms || []).map((s) => s.toLowerCase().trim()).filter(Boolean))].slice(0, 10);
    } catch (error) {
      if (isModelUnavailableError(error) && idx < modelCandidates.length - 1) {
        console.warn(`Gemini model "${modelName}" unavailable for transcript extraction; trying fallback.`);
        continue;
      }
      console.error("Failed to extract tags from transcript", error);
      return [];
    }
  }
  return [];
}

export function processVoiceLogTranscriptionAsync(input: {
  logId: string;
  familyId: string;
  memberId: string;
  mimeType: string;
  audioBase64: string;
}): void {
  setImmediate(async () => {
    try {
      const log = await HealthLogModel.findById(input.logId);
      if (!log) return;

      const audioBuffer = Buffer.from(input.audioBase64, "base64");
      const transcript =
        (await transcribeWithWhisper(audioBuffer, input.mimeType)) ||
        (await transcribeAudioWithGemini(input.audioBase64, input.mimeType)) ||
        placeholderTranscript();
      const member = await FamilyMemberModel.findOne({ _id: input.memberId, familyId: input.familyId });
      const tags = member
        ? await extractTagsFromTranscript({
            familyId: input.familyId,
            memberName: member.name,
            transcript
          })
        : [];

      log.text = transcript;
      log.transcript = transcript;
      log.tags = [...new Set([...(log.tags || []), ...tags])];
      log.transcriptionStatus = transcript === placeholderTranscript() ? "failed" : "completed";
      await log.save();
    } catch (error) {
      console.error("Async voice transcription failed", { logId: input.logId, error });
      await HealthLogModel.updateOne(
        { _id: input.logId },
        { $set: { transcriptionStatus: "failed", text: placeholderTranscript() } }
      );
    }
  });
}

