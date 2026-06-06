/**
 * Pattern & Recurrence Detection Engine — detects recurring health
 * observation patterns from timeline events and symptom context data.
 *
 * Pipeline position: memory → timeline → **pattern engine**
 *
 * Safety: identifies observable recurrence only.
 * Never diagnoses, predicts disease, or suggests treatment.
 */

export {
  patternEngineService,
  PatternEngineService
} from "./pattern-engine.service.js";

export {
  PatternTypeSchema,
  PatternStatusSchema,
  DetectedPatternSchema,
  MIN_RECURRENCE_COUNT,
  PERSISTENCE_DAYS,
  FREQUENCY_WINDOW_DAYS,
  MIN_CLUSTER_CO_OCCURRENCES,
  MIN_CAREGIVER_OBSERVERS,
  MIN_PATTERN_CONFIDENCE,
  PATTERN_STALE_DAYS,
  type PatternType,
  type PatternStatus,
  type DetectedPattern,
  type CandidatePattern,
  type PatternAnalysisResult
} from "./pattern.types.js";

export {
  detectRecurringSymptoms,
  detectPersistentObservations,
  detectFrequencyIncrease,
  detectCaregiverPatterns
} from "./recurrence-detector.js";

export { detectSymptomClusters } from "./symptom-clustering.js";
export { scorePattern, isAboveThreshold } from "./pattern-scoring.js";
export { DetectedPatternModel } from "./models/detected-pattern.model.js";
