import { getWhatsAppEnvConfig } from "../whatsapp/utils/whatsapp-env.js";
import { DEFAULT_VOICE_MIME_TYPE } from "./voice.types.js";

/**
 * Audio Storage Service — handles downloading WhatsApp media and storing
 * audio metadata.
 *
 * WhatsApp media flow:
 * 1. Webhook delivers a media ID (not the actual file)
 * 2. We call the Graph API to get the download URL
 * 3. We download the binary audio data
 *
 * Security: audio is accessed via Meta's Graph API with the access token.
 * Raw media is never exposed publicly.
 */

function logAudio(msg: string, fields: Record<string, unknown>): void {
  console.info(`[audio-storage] ${msg}`, { scope: "audio-storage", ...fields });
}

/**
 * Downloads audio binary from WhatsApp's Graph API.
 *
 * Flow: media ID → GET /media/{id} for URL → GET URL for binary
 */
export async function downloadWhatsAppAudio(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const { accessToken } = getWhatsAppEnvConfig();
  if (!accessToken) {
    logAudio("no access token configured", {});
    return null;
  }

  try {
    // Step 1: Get the download URL from the media ID
    const metaRes = await fetch(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!metaRes.ok) {
      logAudio("media lookup failed", {
        mediaId,
        status: metaRes.status
      });
      return null;
    }

    const metaData = (await metaRes.json()) as {
      url?: string;
      mime_type?: string;
    };

    if (!metaData.url) {
      logAudio("no download URL in meta response", { mediaId });
      return null;
    }

    // Step 2: Download the actual audio binary
    const audioRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!audioRes.ok) {
      logAudio("audio download failed", {
        mediaId,
        status: audioRes.status
      });
      return null;
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = metaData.mime_type || DEFAULT_VOICE_MIME_TYPE;

    logAudio("downloaded", { mediaId, size: buffer.length, mimeType });

    return { buffer, mimeType };
  } catch (err) {
    logAudio("download error", {
      mediaId,
      error: err instanceof Error ? err.message : "unknown"
    });
    return null;
  }
}

/**
 * Extracts audio duration from metadata if available.
 * Returns null if not determinable (duration will be updated post-transcription).
 */
export function extractAudioDuration(
  _rawPayload: Record<string, unknown>
): number | null {
  // WhatsApp audio payloads sometimes include duration in the audio object
  const audio =
    _rawPayload?.audio && typeof _rawPayload.audio === "object"
      ? (_rawPayload.audio as Record<string, unknown>)
      : null;

  if (audio && typeof audio.duration === "number") {
    return audio.duration;
  }
  return null;
}
