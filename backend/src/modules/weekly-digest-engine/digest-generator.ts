import { timelineService } from "../timeline/index.js";
import { patternEngineService } from "../pattern-engine/index.js";
import {
  buildSummaryTitle,
  buildSummaryText,
  buildKeyObservation,
  buildNewSymptomObservation,
  buildResolvedSymptomObservation
} from "./digest-summary-builder.js";
import type { KeyObservation, WeeklyHealthDigest } from "./digest.types.js";

/**
 * Generates a weekly health digest for a single profile.
 *
 * 1. Fetch timeline events in the period
 * 2. Fetch active patterns
 * 3. Compare with prior period (new / resolved symptoms)
 * 4. Build key observations
 * 5. Assemble the digest (does NOT persist — the service handles that)
 */
export async function generateDigestForProfile(
  profileId: string,
  familyId: string,
  profileName: string,
  periodStart: Date,
  periodEnd: Date
): Promise<Omit<WeeklyHealthDigest, "digestId" | "generatedAt">> {
  // Current period events
  const currentEvents = await timelineService.getTimeline(profileId, {
    since: periodStart,
    until: periodEnd,
    limit: 500
  });

  // Prior period events (for comparison)
  const priorStart = new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const priorEvents = await timelineService.getTimeline(profileId, {
    since: priorStart,
    until: periodStart,
    limit: 500
  });

  // Active patterns
  const patterns = await patternEngineService.getActivePatterns(profileId);

  // Symptom sets for comparison
  const currentSymptoms = new Set(currentEvents.flatMap((e) => e.symptoms));
  const priorSymptoms = new Set(priorEvents.flatMap((e) => e.symptoms));

  const observations: KeyObservation[] = [];

  // Pattern-based observations
  for (const pattern of patterns) {
    observations.push(buildKeyObservation(pattern, currentEvents));
  }

  // New symptoms (in current but not in prior)
  for (const symptom of currentSymptoms) {
    if (!priorSymptoms.has(symptom)) {
      const supportingIds = currentEvents
        .filter((e) => e.symptoms.includes(symptom))
        .map((e) => e.timelineEventId);
      observations.push(buildNewSymptomObservation(symptom, supportingIds));
    }
  }

  // Resolved symptoms (in prior but not in current)
  for (const symptom of priorSymptoms) {
    if (!currentSymptoms.has(symptom)) {
      observations.push(buildResolvedSymptomObservation(symptom));
    }
  }

  // Deduplicate by symptom (keep highest confidence)
  const deduped = deduplicateObservations(observations);

  // Build summary
  const summaryTitle = buildSummaryTitle(profileName, periodStart);
  const summaryText = buildSummaryText(deduped);

  return {
    profileId,
    familyId,
    digestType: "PERSONAL_DIGEST",
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    summaryTitle,
    summaryText,
    keyObservations: deduped,
    relatedPatterns: patterns.map((p) => p.patternId),
    supportingEvidenceIds: currentEvents.map((e) => e.sourceMemoryId)
  };
}

/**
 * Removes duplicate observations for the same symptom, keeping highest confidence.
 */
function deduplicateObservations(observations: KeyObservation[]): KeyObservation[] {
  const seen = new Map<string, KeyObservation>();

  for (const obs of observations) {
    const key = `${obs.observationType}:${obs.relatedSymptoms.sort().join(",")}`;
    const existing = seen.get(key);
    if (!existing || obs.confidence > existing.confidence) {
      seen.set(key, obs);
    }
  }

  return [...seen.values()].sort((a, b) => b.confidence - a.confidence);
}
