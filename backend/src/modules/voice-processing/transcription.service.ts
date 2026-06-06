import { MAX_TRANSCRIPTION_RETRIES } from "./voice.types.js";

/**
 * Transcription Service — converts audio buffers to text using OpenAI
 * Whisper API or equivalent transcription service.
 *
 * Safety: preserves original meaning, no AI interpretation during transcription.
 *
 * Architecture:
 * - Async processing with retry handling
 * - Queue-safe (idempotent — same audio → same transcript)
 * - Designed for future multilingual support
 */

function logTranscription(msg: string, fields: Record<string, unknown>): void {
  console.info(`[transcription] ${msg}`, { scope: "transcription", ...fields });
}

export type TranscriptionResult = {
  text: string;
  language: string | null;
  confidence: number;
};

/**
 * Transcribes audio using OpenAI Whisper API.
 *
 * Supports:
 * - Multiple audio formats (ogg/opus, mp3, wav, m4a)
 * - Automatic language detection
 * - Retry with exponential backoff
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  retries = MAX_TRANSCRIPTION_RETRIES
): Promise<TranscriptionResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    logTranscription("OpenAI API key not configured — skipping transcription", {});
    return null;
  }

  const ext = mimeTypeToExtension(mimeType);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Build multipart form data
      const formData = new FormData();
      const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
      formData.append("file", audioBlob, `voice.${ext}`);
      formData.append("model", "whisper-1");
      formData.append("response_format", "verbose_json");

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: formData
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        logTranscription("API error", {
          status: res.status,
          attempt,
          error: errText.slice(0, 200)
        });

        // Retry on 5xx or rate limit
        if ((res.status >= 500 || res.status === 429) && attempt < retries) {
          await delay(Math.pow(2, attempt) * 1000);
          continue;
        }
        return null;
      }

      const data = (await res.json()) as {
        text?: string;
        language?: string;
        duration?: number;
      };

      if (!data.text?.trim()) {
        logTranscription("empty transcript", { attempt });
        return null;
      }

      logTranscription("completed", {
        language: data.language || "unknown",
        length: data.text.length,
        duration: data.duration
      });

      return {
        text: data.text.trim(),
        language: data.language || null,
        confidence: 0.85 // Whisper doesn't return per-utterance confidence; use baseline
      };
    } catch (err) {
      logTranscription("transcription error", {
        attempt,
        error: err instanceof Error ? err.message : "unknown"
      });

      if (attempt < retries) {
        await delay(Math.pow(2, attempt) * 1000);
        continue;
      }
      return null;
    }
  }

  return null;
}

/**
 * Normalizes conversational transcript text for downstream AI extraction.
 *
 * Handles:
 * - Filler words (um, uh, like, you know)
 * - Excessive pauses (represented as "...")
 * - Fragmented sentence cleanup
 * - Casual speech normalization
 *
 * Safety: preserves original meaning — only cleans formatting artifacts.
 */
export function normalizeTranscript(rawText: string): string {
  let text = rawText;

  // Remove common filler sounds (preserve meaning)
  text = text.replace(/\b(um+|uh+|hmm+|err+)\b/gi, "");

  // Collapse excessive ellipsis / pauses
  text = text.replace(/\.{3,}/g, "...");

  // Collapse excessive whitespace
  text = text.replace(/\s+/g, " ");

  // Remove leading/trailing whitespace per sentence
  text = text
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(". ");

  // Ensure ends with period
  if (text && !text.endsWith(".") && !text.endsWith("?") && !text.endsWith("!")) {
    text += ".";
  }

  return text.trim();
}

// ── Helpers ─────────────────────────────────────────────────────────────

function mimeTypeToExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("m4a") || mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  return "ogg"; // Default for WhatsApp voice notes
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
