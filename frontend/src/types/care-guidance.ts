export type CareGuidanceUrgency = "low" | "moderate" | "high";

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

export const CARE_GUIDANCE_DISCLAIMER_FALLBACK =
  "This guidance is informational and not medical advice.";
