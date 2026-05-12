import fs from "fs/promises";
import path from "path";

const KNOWN_EXT: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/flac": ".flac"
};

export function extensionForMime(mimeType: string): string {
  const normalized = (mimeType || "").split(";")[0].trim().toLowerCase();
  return KNOWN_EXT[normalized] || ".webm";
}

export function resolveVoiceStorageDir(): string {
  const configured = process.env.VOICE_STORAGE_DIR?.trim();
  return configured || path.join(process.cwd(), "data", "voice-artifacts");
}

export function voiceArtifactPath(logId: string, ext: string): string {
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  return path.join(resolveVoiceStorageDir(), `${logId}${safeExt}`);
}

export async function ensureVoiceStorageDir(): Promise<void> {
  await fs.mkdir(resolveVoiceStorageDir(), { recursive: true });
}

export async function writeVoiceArtifact(logId: string, buffer: Buffer, mimeType: string): Promise<string> {
  await ensureVoiceStorageDir();
  const ext = extensionForMime(mimeType);
  const dest = voiceArtifactPath(logId, ext);
  await fs.writeFile(dest, buffer, { mode: 0o600 });
  return ext;
}

export async function readVoiceArtifact(logId: string, ext: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(voiceArtifactPath(logId, ext));
  } catch {
    return null;
  }
}

export async function deleteVoiceArtifactIfExists(logId: string, extWithDot: string): Promise<void> {
  try {
    await fs.unlink(voiceArtifactPath(logId, extWithDot));
  } catch {
    // ignore missing file
  }
}
