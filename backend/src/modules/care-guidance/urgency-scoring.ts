import type { DetectedPattern } from "../pattern-engine/pattern.types.js";
import type { SymptomContext } from "../timeline/timeline.types.js";
import type { UrgencyLevel } from "./care-guidance.types.js";

/**
 * Urgency Scoring — determines urgency level from pattern data.
 *
 * Factors:
 * - Recurrence frequency (how often the symptom appears)
 * - Persistence (how long the symptom has been observed)
 * - Severity history (has severity escalated?)
 * - Caregiver agreement (multiple observers = higher urgency)
 *
 * Safety: NEVER claims emergencies or uses fear language.
 * Urgency is purely observational — "worth discussing soon" vs "worth discussing."
 */

type UrgencyScoringInput = {
  pattern: DetectedPattern;
  symptomContexts: SymptomContext[];
};

/**
 * Computes an urgency level based on observable factors.
 *
 * HIGH: frequent recurrence + multiple observers + escalating severity
 * MODERATE: recurring pattern with some persistence
 * LOW: early/mild pattern with low recurrence
 */
export function computeUrgencyLevel(input: UrgencyScoringInput): UrgencyLevel {
  const { pattern, symptomContexts } = input;
  let score = 0;

  // Factor 1: Recurrence frequency
  if (pattern.occurrenceCount >= 7) score += 3;
  else if (pattern.occurrenceCount >= 5) score += 2;
  else if (pattern.occurrenceCount >= 3) score += 1;

  // Factor 2: Symptom persistence (days between first and latest)
  const spanDays = computeSpanDays(pattern.firstOccurrence, pattern.latestOccurrence);
  if (spanDays >= 21) score += 2;
  else if (spanDays >= 7) score += 1;

  // Factor 3: Observer diversity (caregiver agreement)
  const relatedContexts = symptomContexts.filter((ctx) =>
    pattern.relatedSymptoms.includes(ctx.symptom)
  );
  const totalObservers = new Set(relatedContexts.flatMap((ctx) => ctx.observerUserIds)).size;
  if (totalObservers >= 3) score += 2;
  else if (totalObservers >= 2) score += 1;

  // Factor 4: Pattern confidence
  if (pattern.confidence >= 0.8) score += 1;

  // Factor 5: Pattern type bonus
  if (pattern.patternType === "FREQUENCY_INCREASE") score += 1;
  if (pattern.patternType === "MULTI_SYMPTOM_CLUSTER") score += 1;

  // Map score to urgency level
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MODERATE";
  return "LOW";
}

/**
 * Computes a numeric urgency score (0–1) for ranking.
 */
export function computeUrgencyScore(input: UrgencyScoringInput): number {
  const level = computeUrgencyLevel(input);
  switch (level) {
    case "HIGH":
      return 0.9;
    case "MODERATE":
      return 0.6;
    case "LOW":
      return 0.3;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function computeSpanDays(first: string, latest: string): number {
  const span = new Date(latest).getTime() - new Date(first).getTime();
  return Math.max(span / (24 * 60 * 60 * 1000), 0);
}
