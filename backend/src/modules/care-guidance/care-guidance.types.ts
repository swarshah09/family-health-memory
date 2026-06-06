import { z } from "zod";

// ── Urgency levels ──────────────────────────────────────────────────────
export const UrgencyLevelSchema = z.enum(["LOW", "MODERATE", "HIGH"]);
export type UrgencyLevel = z.infer<typeof UrgencyLevelSchema>;

// ── Guidance status ─────────────────────────────────────────────────────
export const GuidanceStatusSchema = z.enum(["ACTIVE", "DISMISSED", "EXPIRED"]);
export type GuidanceStatus = z.infer<typeof GuidanceStatusSchema>;

// ── Care guidance record ────────────────────────────────────────────────
export const CareGuidanceSchema = z.object({
  guidanceId: z.string(),
  profileId: z.string(),
  familyId: z.string(),
  relatedPatternIds: z.array(z.string()),
  suggestedSpecialist: z.string(),
  urgencyLevel: UrgencyLevelSchema,
  guidanceText: z.string(),
  disclaimer: z.string(),
  supportingEvidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  status: GuidanceStatusSchema,
  createdAt: z.string()
});

export type CareGuidance = z.infer<typeof CareGuidanceSchema>;

// ── Candidate (pre-persistence) ─────────────────────────────────────────
export type CareGuidanceCandidate = {
  profileId: string;
  familyId: string;
  relatedPatternIds: string[];
  suggestedSpecialist: string;
  urgencyLevel: UrgencyLevel;
  guidanceText: string;
  supportingEvidenceIds: string[];
  confidence: number;
  /** Key for dedup: specialist + symptom set */
  deduplicationKey: string;
};

// ── Generation result ───────────────────────────────────────────────────
export type CareGuidanceGenerationResult = {
  profileId: string;
  created: number;
  skippedDuplicate: number;
};

// ── Constants ───────────────────────────────────────────────────────────

/** Minimum pattern confidence to consider for guidance. */
export const MIN_PATTERN_CONFIDENCE_FOR_GUIDANCE = 0.5;

/** Minimum occurrences before suggesting specialist. */
export const MIN_OCCURRENCES_FOR_GUIDANCE = 3;

/** Guidance auto-expires after this many days without reconfirmation. */
export const GUIDANCE_EXPIRY_DAYS = 30;

/** Standard disclaimer appended to all guidance. */
export const GUIDANCE_DISCLAIMER =
  "This guidance is informational and not medical advice. Please consult a healthcare professional for any medical concerns.";
