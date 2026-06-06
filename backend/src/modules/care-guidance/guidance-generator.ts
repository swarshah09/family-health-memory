import type { DetectedPattern } from "../pattern-engine/pattern.types.js";
import type { UrgencyLevel } from "./care-guidance.types.js";
import type { CareGuidanceCandidate } from "./care-guidance.types.js";
import { GUIDANCE_DISCLAIMER, MIN_OCCURRENCES_FOR_GUIDANCE } from "./care-guidance.types.js";
import { mapSymptomsToSpecialist } from "./specialist-mapper.js";
import { computeUrgencyLevel } from "./urgency-scoring.js";
import type { SymptomContext } from "../timeline/timeline.types.js";

/**
 * Guidance Generator — produces calm, observational care guidance candidates
 * from detected patterns and symptom context.
 *
 * Tone: calm, observational, non-alarming, emotionally supportive.
 *
 * Safety: NEVER diagnoses, prescribes, or implies certainty.
 */

/**
 * Generates care guidance candidates from active patterns.
 *
 * For each qualifying pattern:
 * 1. Map symptoms to specialist type
 * 2. Compute urgency level
 * 3. Generate calm guidance text
 * 4. Build candidate with dedup key
 */
export function generateGuidanceCandidates(
  profileId: string,
  familyId: string,
  patterns: DetectedPattern[],
  symptomContexts: SymptomContext[]
): CareGuidanceCandidate[] {
  const candidates: CareGuidanceCandidate[] = [];

  for (const pattern of patterns) {
    // Skip patterns below occurrence threshold
    if (pattern.occurrenceCount < MIN_OCCURRENCES_FOR_GUIDANCE) continue;

    // Map symptoms to specialist
    const specialist = mapSymptomsToSpecialist(pattern.relatedSymptoms);

    // Compute urgency
    const urgency = computeUrgencyLevel({
      pattern,
      symptomContexts
    });

    // Generate guidance text
    const guidanceText = buildGuidanceText(
      pattern.relatedSymptoms,
      specialist,
      urgency,
      pattern.occurrenceCount
    );

    // Dedup key: specialist + sorted symptoms
    const deduplicationKey = `${specialist}:${[...pattern.relatedSymptoms].sort().join(",")}`;

    candidates.push({
      profileId,
      familyId,
      relatedPatternIds: [pattern.patternId],
      suggestedSpecialist: specialist,
      urgencyLevel: urgency,
      guidanceText,
      supportingEvidenceIds: pattern.supportingTimelineEventIds,
      confidence: pattern.confidence,
      deduplicationKey
    });
  }

  // Deduplicate: keep highest urgency per specialist+symptom combo
  return deduplicateCandidates(candidates);
}

/**
 * Builds calm, observational guidance text.
 *
 * ✅ "Recurring sleep-related observations may be worth discussing with a sleep specialist."
 * ✅ "Persistent joint discomfort observations may warrant orthopedic evaluation."
 * ❌ "You may have insomnia."
 * ❌ "Condition detected: arthritis."
 */
function buildGuidanceText(
  symptoms: string[],
  specialist: string,
  urgency: UrgencyLevel,
  occurrenceCount: number
): string {
  const symptomText = formatSymptomList(symptoms);

  // Select template based on urgency
  const templates = GUIDANCE_TEMPLATES[urgency];
  const template = templates[Math.floor(Math.random() * templates.length)];

  return template
    .replace(/\{symptoms\}/g, symptomText)
    .replace(/\{specialist\}/g, specialist)
    .replace(/\{count\}/g, String(occurrenceCount));
}

/**
 * Guidance templates organized by urgency level.
 * Multiple variants per level for natural diversity.
 *
 * Tone rules:
 * - Always observational ("has been noted", "observations suggest")
 * - Never diagnostic ("you have", "condition detected")
 * - Never prescriptive ("you should take", "start treatment")
 * - Emotionally supportive and calm
 */
const GUIDANCE_TEMPLATES: Record<UrgencyLevel, string[]> = {
  LOW: [
    "Observations of {symptoms} have been noted a few times. If these continue, it may be worth mentioning to a {specialist} during a routine visit.",
    "{symptoms} has appeared in recent observations. This could be something to keep an eye on and discuss with a {specialist} when convenient.",
    "There have been a few mentions of {symptoms} recently. A conversation with a {specialist} could help provide context."
  ],
  MODERATE: [
    "Recurring observations of {symptoms} have been noted {count} times. It may be worth discussing with a {specialist} to better understand these patterns.",
    "Persistent {symptoms}-related observations may warrant a conversation with a {specialist}. These have been noted multiple times recently.",
    "{symptoms} has been mentioned repeatedly over recent weeks. Speaking with a {specialist} could help provide helpful context."
  ],
  HIGH: [
    "Frequent and persistent observations of {symptoms} have been noted {count} times across multiple reports. Discussing these observations with a {specialist} may be particularly worthwhile.",
    "Recurring {symptoms} observations, noted by multiple family members, suggest that a conversation with a {specialist} could be valuable for understanding these patterns better.",
    "The frequency of {symptoms}-related observations has been notable. A {specialist} may be able to provide useful perspective on these recurring patterns."
  ]
};

/**
 * Deduplicates candidates by specialist+symptom combo, keeping highest urgency.
 */
function deduplicateCandidates(
  candidates: CareGuidanceCandidate[]
): CareGuidanceCandidate[] {
  const seen = new Map<string, CareGuidanceCandidate>();
  const urgencyRank: Record<UrgencyLevel, number> = {
    LOW: 1,
    MODERATE: 2,
    HIGH: 3
  };

  for (const candidate of candidates) {
    const existing = seen.get(candidate.deduplicationKey);
    if (
      !existing ||
      urgencyRank[candidate.urgencyLevel] > urgencyRank[existing.urgencyLevel]
    ) {
      // Merge pattern IDs if upgrading
      if (existing) {
        candidate.relatedPatternIds = [
          ...new Set([...existing.relatedPatternIds, ...candidate.relatedPatternIds])
        ];
        candidate.supportingEvidenceIds = [
          ...new Set([...existing.supportingEvidenceIds, ...candidate.supportingEvidenceIds])
        ];
      }
      seen.set(candidate.deduplicationKey, candidate);
    }
  }

  return [...seen.values()].sort(
    (a, b) => urgencyRank[b.urgencyLevel] - urgencyRank[a.urgencyLevel]
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatSymptomList(symptoms: string[]): string {
  const capitalized = symptoms.map(
    (s) => s.charAt(0).toUpperCase() + s.slice(1)
  );
  if (capitalized.length === 0) return "health-related";
  if (capitalized.length === 1) return capitalized[0];
  if (capitalized.length === 2) return `${capitalized[0]} and ${capitalized[1]}`;
  return `${capitalized.slice(0, -1).join(", ")}, and ${capitalized[capitalized.length - 1]}`;
}
