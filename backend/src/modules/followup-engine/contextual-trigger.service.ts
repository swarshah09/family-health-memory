import type { CandidateFollowup, FollowupTriggerInput } from "./followup.types.js";
import {
  WELLNESS_CHECK_SILENCE_DAYS,
  MIN_FOLLOWUP_CONFIDENCE,
  MAX_PENDING_PER_PROFILE
} from "./followup.types.js";

/**
 * Evaluates follow-up triggers from active patterns, symptom contexts,
 * and recent timeline events.
 *
 * Guards:
 * - Cooldown: skips if same type has a non-expired cooldown
 * - Capacity: skips if max pending followups reached
 * - Confidence: skips below threshold
 */
export function evaluateTriggers(input: FollowupTriggerInput): CandidateFollowup[] {
  const candidates: CandidateFollowup[] = [];
  const now = Date.now();

  // Check capacity
  const pendingCount = input.existingPendingFollowups.length;
  if (pendingCount >= MAX_PENDING_PER_PROFILE) {
    return [];
  }

  // Active cooldowns by type
  const activeCooldowns = new Set(
    input.existingPendingFollowups
      .filter((f) => new Date(f.cooldownExpiresAt).getTime() > now)
      .map((f) => f.followupType)
  );

  const remaining = MAX_PENDING_PER_PROFILE - pendingCount;

  // 1. Recurring symptom patterns → SYMPTOM_CHECK
  for (const pattern of input.activePatterns) {
    if (candidates.length >= remaining) break;
    if (pattern.patternType !== "RECURRING_SYMPTOM" && pattern.patternType !== "PERSISTENT_OBSERVATION")
      continue;
    if (activeCooldowns.has("SYMPTOM_CHECK")) continue;
    if (pattern.confidence < MIN_FOLLOWUP_CONFIDENCE) continue;

    candidates.push({
      profileId: input.profileId,
      familyId: input.familyId,
      relatedPatternId: pattern.patternId,
      followupType: "SYMPTOM_CHECK",
      triggerReason: `Recurring pattern detected for ${pattern.relatedSymptoms.join(", ")} (${pattern.occurrenceCount} occurrences)`,
      confidence: pattern.confidence,
      supportingEvidenceIds: [],
      symptomContext: pattern.relatedSymptoms[0]
    });
    activeCooldowns.add("SYMPTOM_CHECK");
  }

  // 2. Medication-related events without recent follow-up → MEDICATION_CHECK
  if (candidates.length < remaining && !activeCooldowns.has("MEDICATION_CHECK")) {
    const recentMedEvents = input.recentEvents.filter(
      (e) => e.eventType === "MEDICATION_UPDATE" && e.medications.length > 0
    );
    if (recentMedEvents.length > 0) {
      const latest = recentMedEvents[0];
      candidates.push({
        profileId: input.profileId,
        familyId: input.familyId,
        followupType: "MEDICATION_CHECK",
        triggerReason: `Recent medication update: ${latest.medications.join(", ")}`,
        confidence: 0.65,
        supportingEvidenceIds: [latest.timelineEventId],
        symptomContext: latest.medications[0]
      });
    }
  }

  // 3. Silence detection → WELLNESS_CHECK
  if (candidates.length < remaining && !activeCooldowns.has("WELLNESS_CHECK")) {
    const silenceThreshold = now - WELLNESS_CHECK_SILENCE_DAYS * 24 * 60 * 60 * 1000;
    const hasRecentEvent = input.recentEvents.some(
      (e) => new Date(e.eventDate).getTime() > silenceThreshold
    );

    if (!hasRecentEvent && input.recentEvents.length > 0) {
      candidates.push({
        profileId: input.profileId,
        familyId: input.familyId,
        followupType: "WELLNESS_CHECK",
        triggerReason: `No observations for ${WELLNESS_CHECK_SILENCE_DAYS}+ days`,
        confidence: 0.55,
        supportingEvidenceIds: []
      });
    }
  }

  // 4. Caregiver patterns → CAREGIVER_FOLLOWUP
  if (candidates.length < remaining && !activeCooldowns.has("CAREGIVER_FOLLOWUP")) {
    const caregiverPatterns = input.activePatterns.filter(
      (p) => p.patternType === "CAREGIVER_PATTERN"
    );
    if (caregiverPatterns.length > 0) {
      const pattern = caregiverPatterns[0];
      candidates.push({
        profileId: input.profileId,
        familyId: input.familyId,
        relatedPatternId: pattern.patternId,
        followupType: "CAREGIVER_FOLLOWUP",
        triggerReason: `Multiple family members noted ${pattern.relatedSymptoms.join(", ")}`,
        confidence: pattern.confidence,
        supportingEvidenceIds: [],
        symptomContext: pattern.relatedSymptoms[0]
      });
    }
  }

  return candidates;
}
