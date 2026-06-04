import { z } from "zod";
import {
  HealthObservationExtractionSchema,
  type HealthObservationExtraction
} from "./extraction.types.js";
import { SELF_TOKEN } from "./extraction.prompts.js";

function stripCodeFences(raw: string): string {
  return raw.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function normalizeMentionedPerson(
  value: unknown,
  rosterNames: string[]
): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "unknown") return null;
  if (s === SELF_TOKEN || s.toLowerCase() === "self") return SELF_TOKEN;

  const match = rosterNames.find((n) => n.toLowerCase() === s.toLowerCase());
  return match ?? null;
}

function normalizeStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      String(item)
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 120)
    )
    .filter(Boolean)
    .slice(0, max);
}

function normalizeSeverity(value: unknown): "low" | "medium" | "high" | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).toLowerCase();
  if (s === "low" || s === "medium" || s === "high") return s;
  return null;
}

function clampConfidence(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0.4;
  return Math.min(1, Math.max(0, x));
}

/**
 * Validates and normalizes raw model JSON into {@link HealthObservationExtraction}.
 */
export function parseExtractionResponse(
  raw: string,
  rosterNames: string[]
): { ok: true; data: HealthObservationExtraction } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(raw));
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  const row = json && typeof json === "object" ? (json as Record<string, unknown>) : {};

  const candidate = {
    mentionedPerson: normalizeMentionedPerson(row.mentionedPerson, rosterNames),
    symptomMentions: normalizeStringList(row.symptomMentions, 12),
    medicationMentions: normalizeStringList(row.medicationMentions, 8),
    timingMentions: normalizeStringList(row.timingMentions, 8),
    severity: normalizeSeverity(row.severity),
    confidence: clampConfidence(row.confidence),
    observationType: row.observationType
  };

  const parsed = HealthObservationExtractionSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  return { ok: true, data: parsed.data };
}

/** Deterministic fallback when the model is unavailable or returns invalid JSON. */
export function buildFallbackExtraction(
  messageText: string,
  senderUserId: string,
  familyMembers: { name: string; linkedUserId?: string }[]
): HealthObservationExtraction {
  const lower = messageText.toLowerCase();
  const rosterNames = familyMembers.map((m) => m.name);

  let mentionedPerson: string | null = null;
  const named = rosterNames.find((n) => lower.includes(n.toLowerCase()));
  if (named) {
    mentionedPerson = named;
  } else if (
    /\b(i|i'm|im|myself|me)\b/.test(lower) &&
    !/\b(dad|mom|mother|father|pa|ma)\b/.test(lower)
  ) {
    mentionedPerson = SELF_TOKEN;
  }

  const symptomMentions = [
    "dizzy",
    "dizziness",
    "weak",
    "weakness",
    "pain",
    "tired",
    "fatigue",
    "fever",
    "nausea",
    "headache",
    "cough",
    "appetite"
  ].filter((s) => lower.includes(s));

  const medicationMentions = ["medication", "medicine", "pill", "dose", "tablet", "insulin"].filter((s) =>
    lower.includes(s)
  );

  const timingMentions = ["today", "yesterday", "tonight", "this morning", "again"].filter((s) =>
    lower.includes(s)
  );

  let observationType: HealthObservationExtraction["observationType"] = "GENERAL_UPDATE";
  if (medicationMentions.length) observationType = "MEDICATION_UPDATE";
  else if (mentionedPerson === SELF_TOKEN) observationType = "SELF_OBSERVATION";
  else if (mentionedPerson) observationType = "CAREGIVER_OBSERVATION";
  else if (!messageText.trim()) observationType = "UNKNOWN";

  void senderUserId;

  return {
    mentionedPerson,
    symptomMentions,
    medicationMentions,
    timingMentions,
    severity: symptomMentions.length ? "medium" : null,
    confidence: messageText.trim() ? 0.35 : 0.2,
    observationType
  };
}
