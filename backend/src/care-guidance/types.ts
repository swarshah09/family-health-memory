import type { HealthLog } from "../types.js";

export type CareGuidanceUrgency = "low" | "moderate" | "high";

/** Rule row: symptom theme, clinical grouping, and default routing suggestion (not a diagnosis). */
export interface SymptomTaxonomyEntry {
  id: string;
  symptomLabel: string;
  matchPhrases: string[];
  category: string;
  suggestedSpecialist: string;
  /** Starting urgency before contextual adjustment from logs */
  baselineUrgency: CareGuidanceUrgency;
}

export interface CareGuidanceItem {
  id: string;
  memberId: string;
  memberName: string;
  symptomLabel: string;
  category: string;
  suggestedSpecialist: string;
  urgency: CareGuidanceUrgency;
  explanation: string;
  evidenceLogIds: string[];
}

export interface CareGuidanceResponse {
  disclaimer: string;
  items: CareGuidanceItem[];
}

export const CARE_GUIDANCE_DISCLAIMER =
  "This guidance is informational and not medical advice.";

export type LogForCareGuidance = Pick<HealthLog, "id" | "memberId" | "occurredAt" | "text" | "transcript">;
