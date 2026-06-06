import { z } from "zod";

// ── Timeline event types ────────────────────────────────────────────────
export const TimelineEventTypeSchema = z.enum([
  "SYMPTOM_OBSERVATION",
  "MEDICATION_UPDATE",
  "GENERAL_UPDATE",
  "CAREGIVER_OBSERVATION"
]);

export type TimelineEventType = z.infer<typeof TimelineEventTypeSchema>;

export const TimelineSeveritySchema = z.enum(["low", "medium", "high"]).nullable();

// ── Timeline event ──────────────────────────────────────────────────────
export const TimelineEventSchema = z.object({
  timelineEventId: z.string(),
  profileId: z.string(),
  familyId: z.string(),
  sourceMemoryId: z.string(),
  eventType: TimelineEventTypeSchema,
  eventDate: z.string(),
  symptoms: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  severity: TimelineSeveritySchema,
  createdByUserId: z.string(),
  sourceType: z.enum(["SELF", "CAREGIVER", "VOICE", "MANUAL"]),
  createdAt: z.string()
});

export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

// ── Contextual episode ──────────────────────────────────────────────────
export const EpisodeStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const ContextualEpisodeSchema = z.object({
  episodeId: z.string(),
  profileId: z.string(),
  familyId: z.string(),
  primarySymptom: z.string(),
  relatedSymptoms: z.array(z.string()).default([]),
  eventIds: z.array(z.string()).default([]),
  observationCount: z.number().default(1),
  firstOccurrence: z.string(),
  lastOccurrence: z.string(),
  latestSeverity: TimelineSeveritySchema,
  status: EpisodeStatusSchema
});

export type ContextualEpisode = z.infer<typeof ContextualEpisodeSchema>;

// ── Symptom context (running recurrence tracker) ────────────────────────
export const SymptomContextSchema = z.object({
  profileId: z.string(),
  familyId: z.string(),
  symptom: z.string(),
  totalOccurrences: z.number().default(0),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  latestSeverity: TimelineSeveritySchema,
  observerUserIds: z.array(z.string()).default([])
});

export type SymptomContext = z.infer<typeof SymptomContextSchema>;

// ── Processing result ───────────────────────────────────────────────────
export type TimelineProcessResult = {
  timelineEventId: string | null;
  status: "CREATED" | "SKIPPED_DUPLICATE";
  episodesUpdated: number;
  symptomsTracked: number;
};

// ── Constants ───────────────────────────────────────────────────────────

/** Events within this window sharing a symptom are grouped into one episode. */
export const EPISODE_PROXIMITY_HOURS = 72;

/** Episodes without new events for this many days move to INACTIVE. */
export const EPISODE_INACTIVE_DAYS = 14;
