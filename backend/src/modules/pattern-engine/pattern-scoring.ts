import type { CandidatePattern } from "./pattern.types.js";
import { MIN_PATTERN_CONFIDENCE } from "./pattern.types.js";

/**
 * Weights for the confidence scoring factors.
 */
const WEIGHTS = {
  frequency: 0.35,
  timeConsistency: 0.25,
  observerDiversity: 0.25,
  severityEscalation: 0.15
};

/**
 * Computes a confidence score (0–1) for a candidate pattern.
 *
 * Factors:
 * - frequency: more occurrences → higher score
 * - timeConsistency: regular intervals → higher score
 * - observerDiversity: multiple observers → higher score
 * - severityEscalation: worsening severity → bonus
 */
export function scorePattern(candidate: CandidatePattern): number {
  const { frequency, timeConsistency, observerDiversity, severityEscalation } =
    candidate.scoringFactors;

  // Normalize frequency: 3 → 0.4, 5 → 0.6, 10+ → 1.0
  const freqScore = Math.min(frequency / 10, 1);

  // Time consistency is already 0–1
  const timeScore = Math.min(Math.max(timeConsistency, 0), 1);

  // Observer diversity: 1 → 0.3, 2 → 0.6, 3+ → 1.0
  const observerScore = Math.min(observerDiversity / 3, 1);

  // Severity escalation: binary bonus
  const sevScore = severityEscalation ? 1.0 : 0.0;

  const rawScore =
    freqScore * WEIGHTS.frequency +
    timeScore * WEIGHTS.timeConsistency +
    observerScore * WEIGHTS.observerDiversity +
    sevScore * WEIGHTS.severityEscalation;

  // Clamp to 0–1
  return Math.min(Math.max(rawScore, 0), 1);
}

/**
 * Checks if a confidence score meets the minimum threshold.
 */
export function isAboveThreshold(score: number): boolean {
  return score >= MIN_PATTERN_CONFIDENCE;
}
