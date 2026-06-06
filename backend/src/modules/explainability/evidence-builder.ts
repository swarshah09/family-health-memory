import type {
  ExplainableEntityType,
  SupportingEvidenceItem
} from "./explainability.types.js";

/**
 * Evidence Builder — constructs human-readable evidence items and
 * explanation text from entity data.
 *
 * Safety:
 * - Preserves factual traceability
 * - Avoids invented reasoning
 * - Avoids hallucinated evidence
 * - Never hides AI logic
 */

// ── Human-readable entity labels ────────────────────────────────────────

const ENTITY_LABELS: Record<ExplainableEntityType, string> = {
  WHATSAPP_MESSAGE: "WhatsApp message",
  VOICE_RECORDING: "Voice recording",
  VOICE_TRANSCRIPT: "Voice transcript",
  EXTRACTION_RESULT: "Health observation extraction",
  PROFILE_RESOLUTION: "Profile resolution",
  HEALTH_MEMORY: "Health memory record",
  TIMELINE_EVENT: "Timeline event",
  CONTEXTUAL_EPISODE: "Health episode",
  DETECTED_PATTERN: "Detected pattern",
  WEEKLY_DIGEST: "Weekly health digest",
  FOLLOWUP_PROMPT: "Follow-up prompt",
  CARE_GUIDANCE: "Care guidance"
};

/**
 * Creates a human-readable supporting evidence item.
 */
export function buildEvidenceItem(
  entityType: ExplainableEntityType,
  entityId: string,
  customLabel?: string,
  timestamp?: string | null
): SupportingEvidenceItem {
  return {
    entityType,
    entityId,
    label: customLabel || ENTITY_LABELS[entityType],
    timestamp: timestamp || null
  };
}

/**
 * Builds a human-readable explanation text for a detected pattern.
 *
 * Example outputs:
 * - "This observation was generated because dizziness-related mentions
 *    appeared 5 times over the last 2 weeks."
 * - "Based on repeated sleep-related observations and caregiver notes."
 */
export function buildPatternExplanation(
  symptoms: string[],
  occurrenceCount: number,
  firstOccurrence: string,
  latestOccurrence: string,
  observerCount: number
): string {
  const symptomText = formatSymptomList(symptoms);
  const span = computeSpanDescription(firstOccurrence, latestOccurrence);
  const parts: string[] = [];

  parts.push(
    `${symptomText}-related mentions appeared ${occurrenceCount} time${occurrenceCount > 1 ? "s" : ""} ${span}.`
  );

  if (observerCount > 1) {
    parts.push(`Noted by ${observerCount} different family members.`);
  }

  return `This pattern was identified because ${parts.join(" ")}`;
}

/**
 * Builds explanation text for care guidance.
 */
export function buildGuidanceExplanation(
  specialist: string,
  symptoms: string[],
  patternCount: number,
  urgency: string
): string {
  const symptomText = formatSymptomList(symptoms);
  const urgencyDesc = urgency === "HIGH"
    ? "frequent and persistent"
    : urgency === "MODERATE"
      ? "recurring"
      : "occasional";

  return (
    `This suggestion was generated based on ${urgencyDesc} observations of ${symptomText}, ` +
    `supported by ${patternCount} detected pattern${patternCount > 1 ? "s" : ""}. ` +
    `A ${specialist} may be able to provide helpful context.`
  );
}

/**
 * Builds explanation text for a weekly digest.
 */
export function buildDigestExplanation(
  profileName: string,
  eventCount: number,
  patternCount: number,
  periodStart: string,
  periodEnd: string
): string {
  return (
    `This weekly summary for ${profileName} covers the period from ` +
    `${formatDate(periodStart)} to ${formatDate(periodEnd)}. ` +
    `It includes ${eventCount} health observation${eventCount > 1 ? "s" : ""} ` +
    `and ${patternCount} identified pattern${patternCount > 1 ? "s" : ""}.`
  );
}

/**
 * Builds explanation text for a follow-up prompt.
 */
export function buildFollowupExplanation(
  symptoms: string[],
  lastSeenDaysAgo: number,
  triggerReason: string
): string {
  const symptomText = formatSymptomList(symptoms);

  if (lastSeenDaysAgo > 0) {
    return (
      `This follow-up was prompted because ${symptomText} was last mentioned ` +
      `${lastSeenDaysAgo} day${lastSeenDaysAgo > 1 ? "s" : ""} ago. ` +
      `Trigger: ${triggerReason}.`
    );
  }

  return `This follow-up was prompted based on ${symptomText} observations. Trigger: ${triggerReason}.`;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatSymptomList(symptoms: string[]): string {
  if (symptoms.length === 0) return "health-related";
  if (symptoms.length === 1) return symptoms[0];
  if (symptoms.length === 2) return `${symptoms[0]} and ${symptoms[1]}`;
  return `${symptoms.slice(0, -1).join(", ")}, and ${symptoms[symptoms.length - 1]}`;
}

function computeSpanDescription(first: string, latest: string): string {
  const days = Math.ceil(
    (new Date(latest).getTime() - new Date(first).getTime()) / (24 * 60 * 60 * 1000)
  );
  if (days <= 1) return "within the last day";
  if (days <= 7) return `over the last ${days} days`;
  if (days <= 14) return "over the last 2 weeks";
  if (days <= 30) return `over the last ${Math.ceil(days / 7)} weeks`;
  return `over the last ${Math.ceil(days / 30)} month${Math.ceil(days / 30) > 1 ? "s" : ""}`;
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return isoString;
  }
}
