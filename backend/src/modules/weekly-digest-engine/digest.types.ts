import { z } from "zod";

// ── Digest types ────────────────────────────────────────────────────────
export const DigestTypeSchema = z.enum(["PERSONAL_DIGEST", "FAMILY_DIGEST"]);
export type DigestType = z.infer<typeof DigestTypeSchema>;

// ── Key observation types ───────────────────────────────────────────────
export const ObservationTypeSchema = z.enum([
  "RECURRING_SYMPTOM",
  "NEW_SYMPTOM",
  "RESOLVED_SYMPTOM",
  "FREQUENCY_CHANGE",
  "CAREGIVER_CONCERN",
  "WELLNESS_CHANGE"
]);

export type DigestObservationType = z.infer<typeof ObservationTypeSchema>;

// ── Key observation ─────────────────────────────────────────────────────
export const KeyObservationSchema = z.object({
  observationType: ObservationTypeSchema,
  description: z.string(),
  relatedSymptoms: z.array(z.string()).default([]),
  supportingEventIds: z.array(z.string()).default([]),
  relatedPatternId: z.string().optional(),
  confidence: z.number().min(0).max(1)
});

export type KeyObservation = z.infer<typeof KeyObservationSchema>;

// ── Weekly health digest ────────────────────────────────────────────────
export const WeeklyHealthDigestSchema = z.object({
  digestId: z.string(),
  profileId: z.string(),
  familyId: z.string(),
  digestType: DigestTypeSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  summaryTitle: z.string(),
  summaryText: z.string(),
  keyObservations: z.array(KeyObservationSchema).default([]),
  relatedPatterns: z.array(z.string()).default([]),
  supportingEvidenceIds: z.array(z.string()).default([]),
  generatedAt: z.string()
});

export type WeeklyHealthDigest = z.infer<typeof WeeklyHealthDigestSchema>;

// ── Generation result ───────────────────────────────────────────────────
export type DigestGenerationResult = {
  digestId: string | null;
  status: "CREATED" | "SKIPPED_DUPLICATE" | "SKIPPED_NO_DATA";
  observationCount: number;
};
