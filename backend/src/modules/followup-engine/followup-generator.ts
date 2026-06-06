import type { CandidateFollowup, FollowupType } from "./followup.types.js";

/**
 * Template variants for each follow-up type.
 * Multiple variants per type for natural, non-repetitive feel.
 *
 * Tone: calm, caring, lightweight.
 * Never: robotic, urgent, medical conclusions, repetitive.
 */
const TEMPLATES: Record<FollowupType, string[]> = {
  SYMPTOM_CHECK: [
    "Has the {symptom} improved recently?",
    "How has the {symptom} been over the last few days?",
    "Just checking in — any changes with the {symptom}?"
  ],
  MEDICATION_CHECK: [
    "How has the new medication been feeling so far?",
    "Any changes since starting the medication?",
    "Just checking in — how are things going with the recent medication update?"
  ],
  WELLNESS_CHECK: [
    "How has everyone been feeling lately?",
    "Just checking in — anything new to share about how things are going?",
    "It's been a little while — how are things?"
  ],
  CONTEXT_GAP: [
    "Could you share a bit more about the {symptom} that was mentioned?",
    "It would be helpful to know more about the {symptom} — any additional details?",
    "A little more context about the {symptom} would help us understand better."
  ],
  CAREGIVER_FOLLOWUP: [
    "Has anyone noticed changes in the {symptom} recently?",
    "Have things changed regarding the {symptom} that was mentioned?",
    "Just following up — any updates on the {symptom}?"
  ]
};

/**
 * Generates a human-readable follow-up prompt text from a candidate.
 *
 * Selects a random template variant for natural diversity.
 */
export function generatePromptText(candidate: CandidateFollowup): string {
  const templates = TEMPLATES[candidate.followupType];
  const template = templates[Math.floor(Math.random() * templates.length)];

  const symptom = candidate.symptomContext || "recent observation";
  return template.replace(/\{symptom\}/g, symptom);
}
