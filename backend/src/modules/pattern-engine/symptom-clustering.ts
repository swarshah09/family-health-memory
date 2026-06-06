import type { TimelineEvent } from "../timeline/timeline.types.js";
import type { CandidatePattern } from "./pattern.types.js";
import { MIN_CLUSTER_CO_OCCURRENCES } from "./pattern.types.js";

/**
 * Detects multi-symptom clusters — pairs of symptoms that co-occur in
 * MIN_CLUSTER_CO_OCCURRENCES+ timeline events.
 *
 * Builds a co-occurrence matrix from events, then identifies pairs that
 * appear together frequently enough to form a cluster.
 *
 * Pure function: no DB writes.
 */
export function detectSymptomClusters(
  events: TimelineEvent[]
): CandidatePattern[] {
  // Build co-occurrence counts: "symptomA|symptomB" → event IDs
  const coOccurrences = new Map<string, Set<string>>();

  for (const event of events) {
    const symptoms = event.symptoms;
    if (symptoms.length < 2) continue;

    // Generate all unique pairs
    for (let i = 0; i < symptoms.length; i++) {
      for (let j = i + 1; j < symptoms.length; j++) {
        // Sort pair for consistent key
        const pair = [symptoms[i], symptoms[j]].sort();
        const key = pair.join("|");
        if (!coOccurrences.has(key)) {
          coOccurrences.set(key, new Set());
        }
        coOccurrences.get(key)!.add(event.timelineEventId);
      }
    }
  }

  // Filter pairs meeting threshold and build candidates
  const candidates: CandidatePattern[] = [];

  for (const [key, eventIdSet] of coOccurrences) {
    if (eventIdSet.size < MIN_CLUSTER_CO_OCCURRENCES) continue;

    const [symptomA, symptomB] = key.split("|");
    const supportingIds = [...eventIdSet];
    const supportingEvents = events.filter((e) => eventIdSet.has(e.timelineEventId));

    const dates = supportingEvents.map((e) => new Date(e.eventDate).getTime());
    const observers = new Set(supportingEvents.map((e) => e.createdByUserId));

    candidates.push({
      patternType: "MULTI_SYMPTOM_CLUSTER",
      relatedSymptoms: [symptomA, symptomB],
      occurrenceCount: supportingIds.length,
      firstOccurrence: new Date(Math.min(...dates)),
      latestOccurrence: new Date(Math.max(...dates)),
      supportingTimelineEventIds: supportingIds,
      scoringFactors: {
        frequency: supportingIds.length,
        timeConsistency: 0.5,
        observerDiversity: observers.size,
        severityEscalation: false
      }
    });
  }

  return candidates;
}
