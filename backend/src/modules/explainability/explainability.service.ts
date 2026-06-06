import { ExplanationModel } from "./models/explanation.model.js";
import { traceabilityService } from "./traceability.service.js";
import {
  buildEvidenceItem,
  buildPatternExplanation,
  buildGuidanceExplanation,
  buildDigestExplanation,
  buildFollowupExplanation
} from "./evidence-builder.js";
import type {
  Explanation,
  ExplainableEntityType,
  SupportingEvidenceItem,
  TraceabilityChain
} from "./explainability.types.js";
import type { DetectedPattern } from "../pattern-engine/pattern.types.js";
import type { CareGuidance } from "../care-guidance/care-guidance.types.js";

function logExplain(msg: string, fields: Record<string, unknown>): void {
  console.info(`[explainability] ${msg}`, { scope: "explainability", ...fields });
}

/**
 * Explainability Service — the public API for generating, storing, and
 * retrieving explanations for all AI-generated outputs.
 *
 * Every explanation answers:
 * - Why was this generated?
 * - What observations contributed?
 * - What timeline patterns supported it?
 *
 * Safety:
 * - Preserves factual traceability
 * - Avoids invented reasoning
 * - Avoids hallucinated evidence
 * - Never hides AI logic
 */
export class ExplainabilityService {
  /**
   * Generates and stores an explanation for a detected pattern.
   */
  async explainPattern(
    pattern: DetectedPattern,
    observerCount: number
  ): Promise<Explanation> {
    const explanationText = buildPatternExplanation(
      pattern.relatedSymptoms,
      pattern.occurrenceCount,
      pattern.firstOccurrence,
      pattern.latestOccurrence,
      observerCount
    );

    const supportingEvidence: SupportingEvidenceItem[] =
      pattern.supportingTimelineEventIds.map((eventId) =>
        buildEvidenceItem("TIMELINE_EVENT", eventId, "Supporting timeline event")
      );

    return this.upsertExplanation(
      "DETECTED_PATTERN",
      pattern.patternId,
      explanationText,
      supportingEvidence,
      pattern.confidence
    );
  }

  /**
   * Generates and stores an explanation for care guidance.
   */
  async explainGuidance(guidance: CareGuidance): Promise<Explanation> {
    const explanationText = buildGuidanceExplanation(
      guidance.suggestedSpecialist,
      [], // symptoms extracted from related patterns
      guidance.relatedPatternIds.length,
      guidance.urgencyLevel
    );

    const supportingEvidence: SupportingEvidenceItem[] = [
      ...guidance.relatedPatternIds.map((patternId) =>
        buildEvidenceItem("DETECTED_PATTERN", patternId, "Related health pattern")
      ),
      ...guidance.supportingEvidenceIds.map((eventId) =>
        buildEvidenceItem("TIMELINE_EVENT", eventId, "Supporting timeline event")
      )
    ];

    return this.upsertExplanation(
      "CARE_GUIDANCE",
      guidance.guidanceId,
      explanationText,
      supportingEvidence,
      guidance.confidence
    );
  }

  /**
   * Generates and stores an explanation for a weekly digest.
   */
  async explainDigest(
    digestId: string,
    profileName: string,
    eventCount: number,
    patternCount: number,
    periodStart: string,
    periodEnd: string,
    confidence: number
  ): Promise<Explanation> {
    const explanationText = buildDigestExplanation(
      profileName,
      eventCount,
      patternCount,
      periodStart,
      periodEnd
    );

    return this.upsertExplanation(
      "WEEKLY_DIGEST",
      digestId,
      explanationText,
      [],
      confidence
    );
  }

  /**
   * Generates and stores an explanation for a follow-up prompt.
   */
  async explainFollowup(
    followupId: string,
    symptoms: string[],
    lastSeenDaysAgo: number,
    triggerReason: string,
    confidence: number
  ): Promise<Explanation> {
    const explanationText = buildFollowupExplanation(
      symptoms,
      lastSeenDaysAgo,
      triggerReason
    );

    return this.upsertExplanation(
      "FOLLOWUP_PROMPT",
      followupId,
      explanationText,
      [],
      confidence
    );
  }

  /**
   * Retrieves the explanation for any AI-generated entity.
   */
  async getExplanation(targetEntityId: string): Promise<Explanation | null> {
    const doc = await ExplanationModel.findOne({ targetEntityId }).lean();
    if (!doc) return null;
    return mapExplanationDoc(doc);
  }

  /**
   * Retrieves all explanations for a given entity type (e.g., all pattern explanations).
   */
  async getExplanationsByType(
    targetType: ExplainableEntityType,
    limit = 50
  ): Promise<Explanation[]> {
    const docs = await ExplanationModel.find({ targetType })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs.map(mapExplanationDoc);
  }

  /**
   * Gets the full traceability chain for an entity — from output back to source.
   */
  async getTraceabilityChain(
    targetEntityId: string,
    targetType: ExplainableEntityType
  ): Promise<TraceabilityChain> {
    return traceabilityService.traceBack(targetEntityId, targetType);
  }

  /**
   * Registers evidence links for the processing pipeline.
   * Called after each message processing step completes.
   */
  async registerPipelineEvidence(chain: {
    messageId: string;
    extractionId?: string;
    resolutionId?: string;
    memoryId?: string;
    timelineEventId?: string;
    patternId?: string;
    voiceRecordingId?: string;
    voiceTranscriptId?: string;
    confidence: number;
  }): Promise<number> {
    return traceabilityService.registerPipelineChain(chain);
  }

  /**
   * Registers a single evidence link between two entities.
   */
  async registerEvidenceLink(
    sourceType: ExplainableEntityType,
    sourceEntityId: string,
    targetType: ExplainableEntityType,
    targetEntityId: string,
    relationshipType: string,
    confidence: number
  ): Promise<string | null> {
    return traceabilityService.registerLink({
      sourceType,
      sourceEntityId,
      targetType,
      targetEntityId,
      relationshipType: relationshipType as import("./explainability.types.js").RelationshipType,
      confidence
    });
  }

  // ── Internal ────────────────────────────────────────────────────────

  private async upsertExplanation(
    targetType: ExplainableEntityType,
    targetEntityId: string,
    explanationText: string,
    supportingEvidence: SupportingEvidenceItem[],
    confidence: number
  ): Promise<Explanation> {
    const result = await ExplanationModel.findOneAndUpdate(
      { targetEntityId },
      {
        $set: {
          targetType,
          explanationText,
          supportingEvidence,
          confidence
        }
      },
      { upsert: true, new: true, lean: true }
    );

    logExplain("upserted", {
      targetType,
      targetEntityId,
      evidenceCount: supportingEvidence.length
    });

    return mapExplanationDoc(result as Record<string, unknown> & { _id: { toString(): string } });
  }
}

// ── Mapper ──────────────────────────────────────────────────────────────

function mapExplanationDoc(
  doc: Record<string, unknown> & { _id: { toString(): string } }
): Explanation {
  const evidence = Array.isArray(doc.supportingEvidence)
    ? (doc.supportingEvidence as SupportingEvidenceItem[])
    : [];

  return {
    explanationId: doc._id.toString(),
    targetType: doc.targetType as Explanation["targetType"],
    targetEntityId: doc.targetEntityId as string,
    explanationText: doc.explanationText as string,
    supportingEvidence: evidence.map((e) => ({
      entityType: e.entityType,
      entityId: e.entityId,
      label: e.label,
      timestamp: e.timestamp || null
    })),
    confidence: doc.confidence as number,
    createdAt: (doc.createdAt as Date)?.toISOString() || new Date().toISOString()
  };
}

export const explainabilityService = new ExplainabilityService();
