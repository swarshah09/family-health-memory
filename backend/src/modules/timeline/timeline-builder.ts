import type { HealthMemoryRecord } from "../health-memory/health-memory.types.js";
import type { TimelineEventType } from "./timeline.types.js";

/**
 * Normalizes a symptom string for consistent grouping.
 * Lowercases, trims, and collapses whitespace.
 */
export function normalizeSymptom(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Derives the timeline event type from the memory record's observation type.
 */
function deriveEventType(observationType: string, sourceType: string): TimelineEventType {
  switch (observationType) {
    case "SELF_OBSERVATION":
      return "SYMPTOM_OBSERVATION";
    case "CAREGIVER_OBSERVATION":
      return "CAREGIVER_OBSERVATION";
    case "MEDICATION_UPDATE":
      return "MEDICATION_UPDATE";
    case "GENERAL_UPDATE":
    case "UNKNOWN":
    default:
      // Caregiver source type with generic observation → caregiver event
      if (sourceType === "CAREGIVER") return "CAREGIVER_OBSERVATION";
      return "GENERAL_UPDATE";
  }
}

/**
 * Builds a normalized timeline event from a health memory record.
 *
 * Safety: purely structural transformation — no interpretation, no inference.
 */
export function buildTimelineEvent(record: HealthMemoryRecord): {
  profileId: string;
  familyId: string;
  sourceMemoryId: string;
  eventType: TimelineEventType;
  eventDate: Date;
  symptoms: string[];
  medications: string[];
  severity: "low" | "medium" | "high" | null;
  createdByUserId: string;
  sourceType: string;
} {
  const symptoms = [...new Set(record.extractedSymptoms.map(normalizeSymptom))].filter(Boolean);
  const medications = [...new Set(record.extractedMedications.map(normalizeSymptom))].filter(Boolean);

  return {
    profileId: record.profileId,
    familyId: record.familyId,
    sourceMemoryId: record.memoryId,
    eventType: deriveEventType(record.observationType, record.sourceType),
    eventDate: new Date(record.createdAt),
    symptoms,
    medications,
    severity: record.severity,
    createdByUserId: record.createdByUserId,
    sourceType: record.sourceType
  };
}
