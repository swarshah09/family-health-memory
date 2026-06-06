/**
 * Weekly Digest & Health Summary Engine — generates calm, observational
 * weekly summaries for each health profile using longitudinal health
 * memory and detected patterns.
 *
 * Tone: human, supportive, observational.
 * Safety: no diagnosis, treatment recommendations, or alarming language.
 */

export { digestService, DigestService } from "./digest.service.js";

export {
  DigestTypeSchema,
  ObservationTypeSchema,
  KeyObservationSchema,
  WeeklyHealthDigestSchema,
  type DigestType,
  type DigestObservationType,
  type KeyObservation,
  type WeeklyHealthDigest,
  type DigestGenerationResult
} from "./digest.types.js";

export { generateDigestForProfile } from "./digest-generator.js";

export {
  buildSummaryTitle,
  buildSummaryText,
  buildKeyObservation,
  buildNewSymptomObservation,
  buildResolvedSymptomObservation
} from "./digest-summary-builder.js";

export { WeeklyHealthDigestModel } from "./models/weekly-health-digest.model.js";
