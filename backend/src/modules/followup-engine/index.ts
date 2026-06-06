/**
 * Follow-up Intelligence System — generates calm, contextual follow-up
 * prompts based on health patterns and recent observations.
 *
 * Tone: calm, caring, lightweight, observational.
 * Safety: never diagnoses, recommends medication, implies emergencies,
 * or pressures users.
 */

export { followupService, FollowupService } from "./followup.service.js";

export {
  FollowupTypeSchema,
  FollowupStatusSchema,
  FollowupPromptSchema,
  FOLLOWUP_COOLDOWN_HOURS,
  MAX_PENDING_PER_PROFILE,
  MIN_FOLLOWUP_CONFIDENCE,
  FOLLOWUP_EXPIRY_DAYS,
  WELLNESS_CHECK_SILENCE_DAYS,
  type FollowupType,
  type FollowupStatus,
  type FollowupPrompt,
  type CandidateFollowup,
  type FollowupTriggerInput,
  type FollowupGenerationResult
} from "./followup.types.js";

export { evaluateTriggers } from "./contextual-trigger.service.js";
export { generatePromptText } from "./followup-generator.js";
export { FollowupPromptModel } from "./models/followup-prompt.model.js";
