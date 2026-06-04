import { z } from "zod";

export const ObservationTypeSchema = z.enum([
  "SELF_OBSERVATION",
  "CAREGIVER_OBSERVATION",
  "MEDICATION_UPDATE",
  "GENERAL_UPDATE",
  "UNKNOWN"
]);

export const SeverityLevelSchema = z.enum(["low", "medium", "high"]).nullable();

export const HealthObservationExtractionSchema = z.object({
  mentionedPerson: z.string().nullable(),
  symptomMentions: z.array(z.string().min(1).max(120)).max(12),
  medicationMentions: z.array(z.string().min(1).max(120)).max(8),
  timingMentions: z.array(z.string().min(1).max(120)).max(8),
  severity: SeverityLevelSchema,
  confidence: z.number().min(0).max(1),
  observationType: ObservationTypeSchema
});

export type HealthObservationExtraction = z.infer<typeof HealthObservationExtractionSchema>;

export type ExtractionStatus = "PENDING" | "COMPLETED" | "FAILED";

export type FamilyMemberContext = {
  id: string;
  name: string;
  relationship: string;
  linkedUserId?: string;
};

export type WhatsAppExtractionInput = {
  messageId: string;
  familyId: string;
  senderUserId: string;
  senderDisplayName: string;
  messageType: string;
  rawText: string;
  receivedAt: string;
  familyMembers: FamilyMemberContext[];
};

export type ExtractionServiceResult = {
  extractionId: string;
  messageId: string;
  status: ExtractionStatus;
  extractedData: HealthObservationExtraction;
  confidence: number;
  usedFallback: boolean;
};
