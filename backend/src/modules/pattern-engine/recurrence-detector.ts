import type { SymptomContext, TimelineEvent } from "../timeline/timeline.types.js";
import type { CandidatePattern } from "./pattern.types.js";
import {
  MIN_RECURRENCE_COUNT,
  PERSISTENCE_DAYS,
  FREQUENCY_WINDOW_DAYS,
  MIN_CAREGIVER_OBSERVERS
} from "./pattern.types.js";

/**
 * Detects recurring symptoms — symptoms with MIN_RECURRENCE_COUNT+ occurrences.
 *
 * Pure function: reads data, produces candidates. No DB writes.
 */
export function detectRecurringSymptoms(
  contexts: SymptomContext[],
  events: TimelineEvent[]
): CandidatePattern[] {
  const candidates: CandidatePattern[] = [];

  for (const ctx of contexts) {
    if (ctx.totalOccurrences < MIN_RECURRENCE_COUNT) continue;

    const supportingEvents = events
      .filter((e) => e.symptoms.includes(ctx.symptom))
      .map((e) => e.timelineEventId);

    const observerCount = ctx.observerUserIds.length;

    candidates.push({
      patternType: "RECURRING_SYMPTOM",
      relatedSymptoms: [ctx.symptom],
      occurrenceCount: ctx.totalOccurrences,
      firstOccurrence: new Date(ctx.firstSeenAt),
      latestOccurrence: new Date(ctx.lastSeenAt),
      supportingTimelineEventIds: supportingEvents,
      scoringFactors: {
        frequency: ctx.totalOccurrences,
        timeConsistency: computeTimeConsistency(supportingEvents.length, ctx.firstSeenAt, ctx.lastSeenAt),
        observerDiversity: observerCount,
        severityEscalation: false
      }
    });
  }

  return candidates;
}

/**
 * Detects persistent observations — symptoms spanning PERSISTENCE_DAYS+ days.
 */
export function detectPersistentObservations(
  contexts: SymptomContext[],
  events: TimelineEvent[]
): CandidatePattern[] {
  const candidates: CandidatePattern[] = [];
  const thresholdMs = PERSISTENCE_DAYS * 24 * 60 * 60 * 1000;

  for (const ctx of contexts) {
    const span = new Date(ctx.lastSeenAt).getTime() - new Date(ctx.firstSeenAt).getTime();
    if (span < thresholdMs) continue;

    const supportingEvents = events
      .filter((e) => e.symptoms.includes(ctx.symptom))
      .map((e) => e.timelineEventId);

    candidates.push({
      patternType: "PERSISTENT_OBSERVATION",
      relatedSymptoms: [ctx.symptom],
      occurrenceCount: ctx.totalOccurrences,
      firstOccurrence: new Date(ctx.firstSeenAt),
      latestOccurrence: new Date(ctx.lastSeenAt),
      supportingTimelineEventIds: supportingEvents,
      scoringFactors: {
        frequency: ctx.totalOccurrences,
        timeConsistency: computeTimeConsistency(supportingEvents.length, ctx.firstSeenAt, ctx.lastSeenAt),
        observerDiversity: ctx.observerUserIds.length,
        severityEscalation: false
      }
    });
  }

  return candidates;
}

/**
 * Detects frequency increases — symptoms appearing more often in recent period
 * versus prior period within a rolling window.
 */
export function detectFrequencyIncrease(
  events: TimelineEvent[]
): CandidatePattern[] {
  const candidates: CandidatePattern[] = [];
  const now = Date.now();
  const windowMs = FREQUENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const halfWindowMs = windowMs / 2;
  const windowStart = now - windowMs;
  const midpoint = now - halfWindowMs;

  // Group events by symptom within the window
  const symptomEvents = new Map<string, { first: TimelineEvent[]; second: TimelineEvent[] }>();

  for (const event of events) {
    const eventTime = new Date(event.eventDate).getTime();
    if (eventTime < windowStart) continue;

    for (const symptom of event.symptoms) {
      if (!symptomEvents.has(symptom)) {
        symptomEvents.set(symptom, { first: [], second: [] });
      }
      const bucket = symptomEvents.get(symptom)!;
      if (eventTime < midpoint) {
        bucket.first.push(event);
      } else {
        bucket.second.push(event);
      }
    }
  }

  for (const [symptom, buckets] of symptomEvents) {
    const firstCount = buckets.first.length;
    const secondCount = buckets.second.length;

    // Frequency increase: second half has 50%+ more mentions and at least 2
    if (secondCount >= 2 && firstCount > 0 && secondCount > firstCount * 1.5) {
      const allEvents = [...buckets.first, ...buckets.second];

      candidates.push({
        patternType: "FREQUENCY_INCREASE",
        relatedSymptoms: [symptom],
        occurrenceCount: allEvents.length,
        firstOccurrence: new Date(Math.min(...allEvents.map((e) => new Date(e.eventDate).getTime()))),
        latestOccurrence: new Date(Math.max(...allEvents.map((e) => new Date(e.eventDate).getTime()))),
        supportingTimelineEventIds: allEvents.map((e) => e.timelineEventId),
        scoringFactors: {
          frequency: allEvents.length,
          timeConsistency: secondCount / Math.max(firstCount, 1),
          observerDiversity: new Set(allEvents.map((e) => e.createdByUserId)).size,
          severityEscalation: checkSeverityEscalation(allEvents)
        }
      });
    }
  }

  return candidates;
}

/**
 * Detects caregiver patterns — symptoms observed by multiple distinct caregivers.
 */
export function detectCaregiverPatterns(
  contexts: SymptomContext[]
): CandidatePattern[] {
  const candidates: CandidatePattern[] = [];

  for (const ctx of contexts) {
    if (ctx.observerUserIds.length < MIN_CAREGIVER_OBSERVERS) continue;

    candidates.push({
      patternType: "CAREGIVER_PATTERN",
      relatedSymptoms: [ctx.symptom],
      occurrenceCount: ctx.totalOccurrences,
      firstOccurrence: new Date(ctx.firstSeenAt),
      latestOccurrence: new Date(ctx.lastSeenAt),
      supportingTimelineEventIds: [],
      scoringFactors: {
        frequency: ctx.totalOccurrences,
        timeConsistency: 0.5,
        observerDiversity: ctx.observerUserIds.length,
        severityEscalation: false
      }
    });
  }

  return candidates;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function computeTimeConsistency(
  eventCount: number,
  firstSeen: string,
  lastSeen: string
): number {
  const spanDays =
    (new Date(lastSeen).getTime() - new Date(firstSeen).getTime()) /
    (24 * 60 * 60 * 1000);
  if (spanDays <= 0 || eventCount <= 1) return 0;
  // Higher consistency = more evenly spaced events
  const avgInterval = spanDays / (eventCount - 1);
  // Normalize: 1 event/day = 1.0, less frequent = lower
  return Math.min(1 / Math.max(avgInterval, 0.1), 1);
}

function checkSeverityEscalation(events: TimelineEvent[]): boolean {
  const severityOrder = { low: 1, medium: 2, high: 3 };
  const severities = events
    .filter((e) => e.severity !== null)
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
    .map((e) => severityOrder[e.severity!] || 0);

  if (severities.length < 2) return false;
  return severities[severities.length - 1] > severities[0];
}
