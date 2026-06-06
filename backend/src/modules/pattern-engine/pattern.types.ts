import { z } from "zod";

// ── Pattern types ───────────────────────────────────────────────────────
export const PatternTypeSchema = z.enum([
  "RECURRING_SYMPTOM",
  "PERSISTENT_OBSERVATION",
  "FREQUENCY_INCREASE",
  "MULTI_SYMPTOM_CLUSTER",
  "CAREGIVER_PATTERN"
]);

export type PatternType = z.infer<typeof PatternTypeSchema>;

// ── Pattern status ──────────────────────────────────────────────────────
export const PatternStatusSchema = z.enum(["ACTIVE", "STALE"]);

export type PatternStatus = z.infer<typeof PatternStatusSchema>;

// ── Detected pattern ────────────────────────────────────────────────────
export const DetectedPatternSchema = z.object({
  patternId: z.string(),
  profileId: z.string(),
  familyId: z.string(),
  patternType: PatternTypeSchema,
  relatedSymptoms: z.array(z.string()),
  occurrenceCount: z.number(),
  firstOccurrence: z.string(),
  latestOccurrence: z.string(),
  confidence: z.number().min(0).max(1),
  supportingTimelineEventIds: z.array(z.string()),
  status: PatternStatusSchema,
  createdAt: z.string()
});

export type DetectedPattern = z.infer<typeof DetectedPatternSchema>;

// ── Candidate pattern (pre-scoring, pre-persistence) ────────────────────
export type CandidatePattern = {
  patternType: PatternType;
  relatedSymptoms: string[];
  occurrenceCount: number;
  firstOccurrence: Date;
  latestOccurrence: Date;
  supportingTimelineEventIds: string[];
  /** Raw factors for the scoring system */
  scoringFactors: {
    frequency: number;
    timeConsistency: number;
    observerDiversity: number;
    severityEscalation: boolean;
  };
};

// ── Analysis result ─────────────────────────────────────────────────────
export type PatternAnalysisResult = {
  profileId: string;
  patternsCreated: number;
  patternsUpdated: number;
  patternsStaled: number;
};

// ── Constants ───────────────────────────────────────────────────────────

/** Minimum occurrences to flag a recurring symptom. */
export const MIN_RECURRENCE_COUNT = 3;

/** Minimum days a symptom must span to be considered persistent. */
export const PERSISTENCE_DAYS = 7;

/** Rolling window for frequency analysis. */
export const FREQUENCY_WINDOW_DAYS = 14;

/** Minimum co-occurrences for symptom cluster detection. */
export const MIN_CLUSTER_CO_OCCURRENCES = 3;

/** Minimum distinct observers for caregiver pattern. */
export const MIN_CAREGIVER_OBSERVERS = 2;

/** Below this confidence, patterns are not persisted. */
export const MIN_PATTERN_CONFIDENCE = 0.4;

/** Patterns without new evidence in this many days → STALE. */
export const PATTERN_STALE_DAYS = 30;
