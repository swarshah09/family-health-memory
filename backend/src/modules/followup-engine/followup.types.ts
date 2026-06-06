import { z } from "zod";

// ── Follow-up types ─────────────────────────────────────────────────────
export const FollowupTypeSchema = z.enum([
  "SYMPTOM_CHECK",
  "MEDICATION_CHECK",
  "WELLNESS_CHECK",
  "CONTEXT_GAP",
  "CAREGIVER_FOLLOWUP"
]);

export type FollowupType = z.infer<typeof FollowupTypeSchema>;

// ── Follow-up status ────────────────────────────────────────────────────
export const FollowupStatusSchema = z.enum([
  "PENDING",
  "DELIVERED",
  "DISMISSED",
  "EXPIRED"
]);

export type FollowupStatus = z.infer<typeof FollowupStatusSchema>;

// ── Follow-up prompt ────────────────────────────────────────────────────
export const FollowupPromptSchema = z.object({
  followupId: z.string(),
  profileId: z.string(),
  familyId: z.string(),
  relatedPatternId: z.string().optional(),
  followupType: FollowupTypeSchema,
  generatedPrompt: z.string(),
  triggerReason: z.string(),
  confidence: z.number().min(0).max(1),
  supportingEvidenceIds: z.array(z.string()).default([]),
  status: FollowupStatusSchema,
  cooldownExpiresAt: z.string(),
  createdAt: z.string()
});

export type FollowupPrompt = z.infer<typeof FollowupPromptSchema>;

// ── Candidate (pre-persistence) ─────────────────────────────────────────
export type CandidateFollowup = {
  profileId: string;
  familyId: string;
  relatedPatternId?: string;
  followupType: FollowupType;
  triggerReason: string;
  confidence: number;
  supportingEvidenceIds: string[];
  symptomContext?: string;
};

// ── Trigger evaluation input ────────────────────────────────────────────
export type FollowupTriggerInput = {
  profileId: string;
  familyId: string;
  activePatterns: Array<{
    patternId: string;
    patternType: string;
    relatedSymptoms: string[];
    occurrenceCount: number;
    latestOccurrence: string;
    confidence: number;
  }>;
  symptomContexts: Array<{
    symptom: string;
    totalOccurrences: number;
    lastSeenAt: string;
    observerUserIds: string[];
  }>;
  recentEvents: Array<{
    timelineEventId: string;
    eventType: string;
    eventDate: string;
    symptoms: string[];
    medications: string[];
  }>;
  existingPendingFollowups: Array<{
    followupType: FollowupType;
    cooldownExpiresAt: string;
  }>;
};

// ── Generation result ───────────────────────────────────────────────────
export type FollowupGenerationResult = {
  profileId: string;
  created: number;
  skippedCooldown: number;
  skippedCapacity: number;
};

// ── Constants ───────────────────────────────────────────────────────────

/** Minimum hours between same-type followups for a profile. */
export const FOLLOWUP_COOLDOWN_HOURS = 48;

/** Maximum pending followups per profile at once. */
export const MAX_PENDING_PER_PROFILE = 3;

/** Below this confidence, followups are not generated. */
export const MIN_FOLLOWUP_CONFIDENCE = 0.5;

/** Pending followups auto-expire after this many days. */
export const FOLLOWUP_EXPIRY_DAYS = 7;

/** Days without any observation → trigger wellness check. */
export const WELLNESS_CHECK_SILENCE_DAYS = 5;
