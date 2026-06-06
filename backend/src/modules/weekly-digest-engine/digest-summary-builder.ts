import type { DetectedPattern } from "../pattern-engine/pattern.types.js";
import type { TimelineEvent } from "../timeline/timeline.types.js";
import type { KeyObservation, DigestObservationType } from "./digest.types.js";

/**
 * Builds a calm, human-readable summary title for a weekly digest.
 */
export function buildSummaryTitle(
  profileName: string,
  periodStart: Date
): string {
  const month = periodStart.toLocaleString("en-US", { month: "long" });
  const day = periodStart.getDate();
  return `Week of ${month} ${day} — Health Summary for ${profileName}`;
}

/**
 * Builds a calm 2–4 sentence summary from key observations.
 *
 * Tone: observational, supportive, never alarming.
 */
export function buildSummaryText(observations: KeyObservation[]): string {
  if (observations.length === 0) {
    return "No notable health observations were recorded this week. Everything looks steady.";
  }

  const sentences: string[] = [];

  const recurring = observations.filter((o) => o.observationType === "RECURRING_SYMPTOM");
  const newObs = observations.filter((o) => o.observationType === "NEW_SYMPTOM");
  const resolved = observations.filter((o) => o.observationType === "RESOLVED_SYMPTOM");
  const frequency = observations.filter((o) => o.observationType === "FREQUENCY_CHANGE");

  if (recurring.length > 0) {
    const symptoms = recurring.flatMap((o) => o.relatedSymptoms);
    const unique = [...new Set(symptoms)];
    if (unique.length === 1) {
      sentences.push(`${capitalize(unique[0])} continued to be mentioned this week.`);
    } else {
      sentences.push(`A few recurring observations were noted, including ${formatList(unique)}.`);
    }
  }

  if (newObs.length > 0) {
    const symptoms = [...new Set(newObs.flatMap((o) => o.relatedSymptoms))];
    sentences.push(`${formatList(symptoms.map(capitalize))} appeared for the first time this week.`);
  }

  if (resolved.length > 0) {
    const symptoms = [...new Set(resolved.flatMap((o) => o.relatedSymptoms))];
    sentences.push(
      `${formatList(symptoms.map(capitalize))} was not reported this week after appearing previously.`
    );
  }

  if (frequency.length > 0 && sentences.length < 3) {
    sentences.push("Some observation patterns showed changes in frequency compared to the prior week.");
  }

  if (sentences.length === 0) {
    sentences.push("A few health observations were recorded this week.");
  }

  return sentences.slice(0, 4).join(" ");
}

/**
 * Builds a key observation from a detected pattern and related events.
 *
 * Tone rules:
 * ✅ "Sleep-related complaints appeared more frequently this week."
 * ❌ No diagnosis, certainty claims, or fear-inducing wording.
 */
export function buildKeyObservation(
  pattern: DetectedPattern,
  events: TimelineEvent[]
): KeyObservation {
  const { patternType, relatedSymptoms, occurrenceCount, confidence } = pattern;

  let observationType: DigestObservationType;
  let description: string;

  const symptomText = formatList(relatedSymptoms.map(capitalize));

  switch (patternType) {
    case "RECURRING_SYMPTOM":
      observationType = "RECURRING_SYMPTOM";
      description = `${symptomText} was mentioned ${occurrenceCount} times recently.`;
      break;

    case "PERSISTENT_OBSERVATION":
      observationType = "RECURRING_SYMPTOM";
      description = `${symptomText}-related observations have persisted over several days.`;
      break;

    case "FREQUENCY_INCREASE":
      observationType = "FREQUENCY_CHANGE";
      description = `Reports of ${symptomText.toLowerCase()} increased compared to the prior period.`;
      break;

    case "MULTI_SYMPTOM_CLUSTER":
      observationType = "RECURRING_SYMPTOM";
      description = `${symptomText} have been appearing together in recent observations.`;
      break;

    case "CAREGIVER_PATTERN":
      observationType = "CAREGIVER_CONCERN";
      description = `Multiple family members have noted ${symptomText.toLowerCase()} recently.`;
      break;

    default:
      observationType = "WELLNESS_CHANGE";
      description = "Some health observation patterns were noted this week.";
  }

  const supportingEventIds = events
    .filter((e) =>
      e.symptoms.some((s) => relatedSymptoms.includes(s))
    )
    .map((e) => e.timelineEventId);

  return {
    observationType,
    description,
    relatedSymptoms: [...relatedSymptoms],
    supportingEventIds,
    relatedPatternId: pattern.patternId,
    confidence
  };
}

/**
 * Builds a "new symptom" observation for symptoms seen this period but not before.
 */
export function buildNewSymptomObservation(
  symptom: string,
  supportingEventIds: string[]
): KeyObservation {
  return {
    observationType: "NEW_SYMPTOM",
    description: `${capitalize(symptom)} was observed for the first time this week.`,
    relatedSymptoms: [symptom],
    supportingEventIds,
    confidence: 0.7
  };
}

/**
 * Builds a "resolved symptom" observation for symptoms not seen this period.
 */
export function buildResolvedSymptomObservation(symptom: string): KeyObservation {
  return {
    observationType: "RESOLVED_SYMPTOM",
    description: `${capitalize(symptom)} was not reported this week after appearing previously.`,
    relatedSymptoms: [symptom],
    supportingEventIds: [],
    confidence: 0.6
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
