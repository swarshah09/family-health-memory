import { z } from "zod";
import { ObservationTypeSchema, SeverityLevelSchema } from "../ai-extraction/extraction.types.js";

// ── Source type: how the observation reached the system ──────────────────
export const MemorySourceTypeSchema = z.enum([
  "SELF",
  "CAREGIVER",
  "VOICE",
  "MANUAL"
]);

export type MemorySourceType = z.infer<typeof MemorySourceTypeSchema>;

// ── Memory record status ────────────────────────────────────────────────
export const MemoryRecordStatusSchema = z.enum([
  "ACTIVE",
  "REVIEW_REQUIRED"
]);

export type MemoryRecordStatus = z.infer<typeof MemoryRecordStatusSchema>;

// ── Health memory record schema ─────────────────────────────────────────
export const HealthMemoryRecordSchema = z.object({
  memoryId: z.string(),
  profileId: z.string(),
  familyId: z.string(),
  createdByUserId: z.string(),

  // Traceability links — back to the original WhatsApp pipeline artefacts
  sourceMessageId: z.string(),
  extractionId: z.string(),
  resolutionId: z.string(),

  sourceType: MemorySourceTypeSchema,
  observationType: ObservationTypeSchema,

  content: z.string(),

  extractedSymptoms: z.array(z.string()).default([]),
  extractedMedications: z.array(z.string()).default([]),
  extractedTiming: z.array(z.string()).default([]),

  severity: SeverityLevelSchema,
  confidence: z.number().min(0).max(1),

  status: MemoryRecordStatusSchema,

  createdAt: z.string()
});

export type HealthMemoryRecord = z.infer<typeof HealthMemoryRecordSchema>;

// ── Input from the pipeline into the health memory service ──────────────
export type HealthMemoryCreateInput = {
  messageId: string;
  familyId: string;
  senderUserId: string;
  rawText: string;
  messageType: string;
  extraction: {
    extractionId: string;
    messageId: string;
    status: string;
    extractedData: {
      mentionedPerson: string | null;
      symptomMentions: string[];
      medicationMentions: string[];
      timingMentions: string[];
      severity: "low" | "medium" | "high" | null;
      confidence: number;
      observationType: string;
    };
    confidence: number;
    usedFallback: boolean;
  };
  resolution: {
    resolutionId: string;
    messageId: string;
    resolvedProfileId: string | null;
    resolutionType: string;
    confidence: number;
    matchedTerms: string[];
    createdAt: string;
  };
};

// ── Result returned after attempting memory creation ─────────────────────
export type HealthMemoryCreateStatus =
  | "CREATED"
  | "SKIPPED_VALIDATION"
  | "SKIPPED_DUPLICATE"
  | "SKIPPED_UNRESOLVED";

export type HealthMemoryCreateResult = {
  memoryId: string | null;
  status: HealthMemoryCreateStatus;
  reason?: string;
};

/**
 * Minimum combined confidence required to create a health memory record.
 * Records below this threshold are saved with status REVIEW_REQUIRED.
 */
export const MIN_MEMORY_CONFIDENCE = 0.5;
