import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractorService } from "./ai-pipeline/extractorService.js";
import { normalizerService } from "./ai-pipeline/normalizerService.js";
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
): Promise<{ text: string | null; engine: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { text: null, engine: "whisper-1" };

  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), filename);
    form.append("model", "whisper-1");
    form.append("temperature", "0");
    const lang = process.env.OPENAI_WHISPER_LANGUAGE?.trim();
    if (lang) form.append("language", lang);
    form.append(
      "prompt",
      "Family health observation. Medical terms may appear. Long pauses, partial sentences, or background noise are possible."
    );

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
    return { text: text.length ? text : null, engine: "whisper-1" };
  } catch (error) {
    console.error("Whisper transcription error", error);
    return { text: null, engine: "whisper-1" };
  }
}

async function extractTagsFromTranscript(params: {
  logId: string;
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
            id: params.logId,
            text: params.transcript,
            occurredAt: new Date().toISOString()
          }
        ]
      });
      const normalized = normalizerService({ events: extracted.events });
      const symptoms = normalized.events.flatMap((ev) => ev.symptoms || []);
      return [...new Set(symptoms.map((s) => s.toLowerCase().trim()).filter(Boolean))].slice(0, 12);
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
      await HealthLogModel.updateOne(
        { _id: input.logId, familyId: input.familyId },
        { $set: { transcriptionStatus: "processing" } }
      );

      const log = await HealthLogModel.findById(input.logId);
      if (!log) return;

      const audioBuffer = Buffer.from(input.audioBase64, "base64");
      const whisper = await transcribeWithWhisper(audioBuffer, input.mimeType);
      let transcript = whisper.text;
      let transcriber = whisper.text ? whisper.engine : "";
      if (!transcript) {
        const geminiText = await transcribeAudioWithGemini(input.audioBase64, input.mimeType);
        transcript = geminiText?.trim() || null;
        transcriber = transcript ? "gemini" : "";
      }
      if (!transcript) {
        transcript = placeholderTranscript();
        transcriber = "unavailable";
      }

      const member = await FamilyMemberModel.findOne({ _id: input.memberId, familyId: input.familyId });
      const tags = member
        ? await extractTagsFromTranscript({
            logId: input.logId,
            familyId: input.familyId,
            memberName: member.name,
            transcript
          })
        : [];

      const prevMeta = (log.rawAudioMetadata || {}) as Record<string, unknown>;
      log.text = transcript;
      log.transcript = transcript;
      log.tags = [...new Set([...(log.tags || []), ...tags])];
      log.transcriptionStatus = transcript === placeholderTranscript() ? "failed" : "completed";
      log.rawAudioMetadata = {
        ...prevMeta,
        transcriber: transcriber || undefined,
        transcriptCharCount: transcript.length,
        whisperTemperature: 0
      } as typeof log.rawAudioMetadata;
      await log.save();
    } catch (error) {
      console.error("Async voice transcription failed", { logId: input.logId, error });
      await HealthLogModel.updateOne(
        { _id: input.logId },
        {
          $set: {
            transcriptionStatus: "failed",
            text: placeholderTranscript(),
            "rawAudioMetadata.transcriptionError": error instanceof Error ? error.message : "unknown"
          }
        }
      );
    }
  });
}
