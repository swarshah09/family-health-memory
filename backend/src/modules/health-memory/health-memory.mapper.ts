import type { HealthMemoryCreateInput, MemorySourceType } from "./health-memory.types.js";

/**
 * Derives the MemorySourceType from resolution type and message metadata.
 *
 * Priority:
 * 1. Audio messages → VOICE
 * 2. SELF resolution + SELF_OBSERVATION → SELF
 * 3. FAMILY_REFERENCE / NAME_REFERENCE → CAREGIVER
 * 4. Fallback → MANUAL
 */
export function deriveSourceType(input: HealthMemoryCreateInput): MemorySourceType {
  // Audio/voice messages are always VOICE source type
  if (input.messageType === "AUDIO" || input.messageType === "VOICE") {
    return "VOICE";
  }

  const resolutionType = input.resolution.resolutionType;
  const observationType = input.extraction.extractedData.observationType;

  // Self-reported observations
  if (resolutionType === "SELF") {
    return "SELF";
  }

  // Also treat SELF_OBSERVATION with self-language as SELF
  if (observationType === "SELF_OBSERVATION" && resolutionType !== "UNRESOLVED") {
    return "SELF";
  }

  // Caregiver observations (someone reporting about another family member)
  if (resolutionType === "FAMILY_REFERENCE" || resolutionType === "NAME_REFERENCE") {
    return "CAREGIVER";
  }

  // Fallback for any edge case
  return "MANUAL";
}

/**
 * Maps pipeline outputs (extraction + resolution + message data) into the
 * shape expected by the HealthMemoryRecordModel for persistence.
 */
export function mapToHealthMemory(
  input: HealthMemoryCreateInput,
  resolvedProfileId: string
): {
  profileId: string;
  familyId: string;
  createdByUserId: string;
  sourceMessageId: string;
  extractionId: string;
  resolutionId: string;
  sourceType: MemorySourceType;
  observationType: string;
  content: string;
  extractedSymptoms: string[];
  extractedMedications: string[];
  extractedTiming: string[];
  severity: "low" | "medium" | "high" | null;
  confidence: number;
  status: "ACTIVE" | "REVIEW_REQUIRED";
} {
  const { extraction, resolution } = input;
  const ed = extraction.extractedData;

  return {
    profileId: resolvedProfileId,
    familyId: input.familyId,
    createdByUserId: input.senderUserId,
    sourceMessageId: input.messageId,
    extractionId: extraction.extractionId,
    resolutionId: resolution.resolutionId,
    sourceType: deriveSourceType(input),
    observationType: ed.observationType,
    content: input.rawText,
    extractedSymptoms: [...ed.symptomMentions],
    extractedMedications: [...ed.medicationMentions],
    extractedTiming: [...ed.timingMentions],
    severity: ed.severity,
    confidence: Math.min(extraction.confidence, resolution.confidence),
    status: "ACTIVE"
  };
}
