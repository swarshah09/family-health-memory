import { z } from "zod";
import type { FamilyMemberContext, HealthObservationExtraction } from "../ai-extraction/extraction.types.js";

export const ResolutionTypeSchema = z.enum([
  "SELF",
  "FAMILY_REFERENCE",
  "NAME_REFERENCE",
  "UNRESOLVED"
]);

export type ResolutionType = z.infer<typeof ResolutionTypeSchema>;

export const ProfileResolutionResultSchema = z.object({
  resolvedProfileId: z.string().nullable(),
  resolutionType: ResolutionTypeSchema,
  confidence: z.number().min(0).max(1),
  matchedTerms: z.array(z.string().max(80)).max(16)
});

export type ProfileResolutionResult = z.infer<typeof ProfileResolutionResultSchema>;

export type ProfileResolutionInput = {
  messageId: string;
  senderUserId: string;
  rawText: string;
  extraction: HealthObservationExtraction;
  extractionConfidence: number;
  familyMembers: FamilyMemberContext[];
};

export type ProfileResolutionPersisted = ProfileResolutionResult & {
  resolutionId: string;
  messageId: string;
  createdAt: string;
};

/** Minimum confidence required before assigning a profile (conservative). */
export const MIN_ASSIGNMENT_CONFIDENCE = 0.55;
