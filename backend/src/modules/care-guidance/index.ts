/**
 * Care Guidance & Specialist Suggestion Layer
 *
 * Provides calm, observational care guidance and specialist-type
 * suggestions based on recurring health memory patterns.
 *
 * Safety (enforced at every level):
 * - NEVER diagnoses conditions
 * - NEVER recommends medication or treatment
 * - NEVER implies medical certainty
 * - NEVER replaces healthcare professionals
 * - Always includes informational disclaimer
 *
 * Future-proofed for: doctor summaries, care navigation,
 * specialist directories, appointment preparation.
 */

export {
  careGuidanceService,
  CareGuidanceService
} from "./care-guidance.service.js";

export {
  UrgencyLevelSchema,
  GuidanceStatusSchema,
  CareGuidanceSchema,
  GUIDANCE_DISCLAIMER,
  GUIDANCE_EXPIRY_DAYS,
  MIN_PATTERN_CONFIDENCE_FOR_GUIDANCE,
  MIN_OCCURRENCES_FOR_GUIDANCE,
  type UrgencyLevel,
  type GuidanceStatus,
  type CareGuidance,
  type CareGuidanceCandidate,
  type CareGuidanceGenerationResult
} from "./care-guidance.types.js";

export {
  mapSymptomsToSpecialist,
  mapSymptomsToAllSpecialists
} from "./specialist-mapper.js";

export {
  computeUrgencyLevel,
  computeUrgencyScore
} from "./urgency-scoring.js";

export { generateGuidanceCandidates } from "./guidance-generator.js";
export { CareGuidanceModel } from "./models/care-guidance.model.js";
