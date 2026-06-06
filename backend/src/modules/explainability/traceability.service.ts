import { AIEvidenceLinkModel } from "./models/ai-evidence-link.model.js";
import type {
  AIEvidenceLink,
  ExplainableEntityType,
  RegisterEvidenceInput,
  TraceabilityChain
} from "./explainability.types.js";
import { MAX_TRACE_DEPTH, MAX_EVIDENCE_LINKS_PER_QUERY } from "./explainability.types.js";

/**
 * Traceability Service — manages the evidence graph and supports
 * traversal from any AI-generated output back to its source observations.
 *
 * Safety:
 * - Preserves factual traceability only
 * - Never invents links
 * - Never hides traversal paths
 *
 * Performance:
 * - Indexed lookups on source/target entity IDs
 * - Bounded depth traversal
 * - Duplicate-safe registration (unique compound index)
 */

function logTrace(msg: string, fields: Record<string, unknown>): void {
  console.info(`[traceability] ${msg}`, { scope: "traceability", ...fields });
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

export class TraceabilityService {
  /**
   * Registers a single evidence link in the graph.
   * Idempotent — duplicate links are silently ignored.
   */
  async registerLink(input: RegisterEvidenceInput): Promise<string | null> {
    try {
      const doc = await AIEvidenceLinkModel.create({
        sourceType: input.sourceType,
        sourceEntityId: input.sourceEntityId,
        targetType: input.targetType,
        targetEntityId: input.targetEntityId,
        relationshipType: input.relationshipType,
        confidence: input.confidence
      });
      return doc._id.toString();
    } catch (err) {
      if (isDuplicateKeyError(err)) return null;
      throw err;
    }
  }

  /**
   * Registers multiple evidence links in batch. Continues on individual failures.
   */
  async registerLinks(inputs: RegisterEvidenceInput[]): Promise<number> {
    let registered = 0;
    for (const input of inputs) {
      const id = await this.registerLink(input);
      if (id) registered++;
    }
    return registered;
  }

  /**
   * Registers the standard pipeline evidence chain for a processed message.
   *
   * Chain: message → extraction → resolution → memory → timeline → pattern
   */
  async registerPipelineChain(chain: {
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
    const links: RegisterEvidenceInput[] = [];
    const c = chain.confidence;

    // Voice chain (if applicable)
    if (chain.voiceRecordingId) {
      links.push({
        sourceType: "WHATSAPP_MESSAGE",
        sourceEntityId: chain.messageId,
        targetType: "VOICE_RECORDING",
        targetEntityId: chain.voiceRecordingId,
        relationshipType: "DERIVED_FROM",
        confidence: c
      });
    }
    if (chain.voiceRecordingId && chain.voiceTranscriptId) {
      links.push({
        sourceType: "VOICE_RECORDING",
        sourceEntityId: chain.voiceRecordingId,
        targetType: "VOICE_TRANSCRIPT",
        targetEntityId: chain.voiceTranscriptId,
        relationshipType: "TRANSCRIBED_FROM",
        confidence: c
      });
    }

    // Core pipeline chain
    if (chain.extractionId) {
      links.push({
        sourceType: "WHATSAPP_MESSAGE",
        sourceEntityId: chain.messageId,
        targetType: "EXTRACTION_RESULT",
        targetEntityId: chain.extractionId,
        relationshipType: "EXTRACTED_FROM",
        confidence: c
      });
    }
    if (chain.extractionId && chain.resolutionId) {
      links.push({
        sourceType: "EXTRACTION_RESULT",
        sourceEntityId: chain.extractionId,
        targetType: "PROFILE_RESOLUTION",
        targetEntityId: chain.resolutionId,
        relationshipType: "RESOLVED_TO",
        confidence: c
      });
    }
    if (chain.resolutionId && chain.memoryId) {
      links.push({
        sourceType: "PROFILE_RESOLUTION",
        sourceEntityId: chain.resolutionId,
        targetType: "HEALTH_MEMORY",
        targetEntityId: chain.memoryId,
        relationshipType: "RECORDED_AS",
        confidence: c
      });
    }
    if (chain.memoryId && chain.timelineEventId) {
      links.push({
        sourceType: "HEALTH_MEMORY",
        sourceEntityId: chain.memoryId,
        targetType: "TIMELINE_EVENT",
        targetEntityId: chain.timelineEventId,
        relationshipType: "MAPPED_TO_TIMELINE",
        confidence: c
      });
    }
    if (chain.timelineEventId && chain.patternId) {
      links.push({
        sourceType: "TIMELINE_EVENT",
        sourceEntityId: chain.timelineEventId,
        targetType: "DETECTED_PATTERN",
        targetEntityId: chain.patternId,
        relationshipType: "DETECTED_PATTERN_FROM",
        confidence: c
      });
    }

    return this.registerLinks(links);
  }

  /**
   * Finds all evidence links that point TO a given entity.
   * "What supports this entity?"
   */
  async getEvidenceFor(
    targetEntityId: string,
    targetType?: ExplainableEntityType
  ): Promise<AIEvidenceLink[]> {
    const filter: Record<string, unknown> = { targetEntityId };
    if (targetType) filter.targetType = targetType;

    const docs = await AIEvidenceLinkModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(MAX_EVIDENCE_LINKS_PER_QUERY)
      .lean();

    return docs.map(mapLinkDoc);
  }

  /**
   * Finds all evidence links that originate FROM a given entity.
   * "What did this entity produce?"
   */
  async getEvidenceFrom(
    sourceEntityId: string,
    sourceType?: ExplainableEntityType
  ): Promise<AIEvidenceLink[]> {
    const filter: Record<string, unknown> = { sourceEntityId };
    if (sourceType) filter.sourceType = sourceType;

    const docs = await AIEvidenceLinkModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(MAX_EVIDENCE_LINKS_PER_QUERY)
      .lean();

    return docs.map(mapLinkDoc);
  }

  /**
   * Traverses the evidence graph backwards from a target entity,
   * building a full traceability chain back to source observations.
   *
   * Uses BFS with depth limiting to prevent infinite loops.
   */
  async traceBack(
    targetEntityId: string,
    targetType: ExplainableEntityType,
    maxDepth = MAX_TRACE_DEPTH
  ): Promise<TraceabilityChain> {
    const allLinks: AIEvidenceLink[] = [];
    const visited = new Set<string>();
    const queue: { entityId: string; depth: number }[] = [
      { entityId: targetEntityId, depth: 0 }
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.entityId) || current.depth >= maxDepth) continue;
      visited.add(current.entityId);

      // Find all links pointing TO this entity (i.e., entity is the target)
      const incomingLinks = await AIEvidenceLinkModel.find({
        targetEntityId: current.entityId
      })
        .limit(MAX_EVIDENCE_LINKS_PER_QUERY)
        .lean();

      for (const link of incomingLinks) {
        const mapped = mapLinkDoc(link);
        allLinks.push(mapped);

        if (!visited.has(mapped.sourceEntityId)) {
          queue.push({
            entityId: mapped.sourceEntityId,
            depth: current.depth + 1
          });
        }
      }
    }

    return {
      targetType,
      targetEntityId,
      links: allLinks,
      depth: allLinks.length > 0 ? Math.max(...allLinks.map((_, i) => i + 1)) : 0
    };
  }

  /**
   * Counts all evidence links in the system (for monitoring).
   */
  async countLinks(): Promise<number> {
    return AIEvidenceLinkModel.countDocuments();
  }
}

// ── Mapper ──────────────────────────────────────────────────────────────

function mapLinkDoc(
  doc: Record<string, unknown> & { _id: { toString(): string } }
): AIEvidenceLink {
  return {
    evidenceId: doc._id.toString(),
    sourceType: doc.sourceType as AIEvidenceLink["sourceType"],
    sourceEntityId: doc.sourceEntityId as string,
    targetType: doc.targetType as AIEvidenceLink["targetType"],
    targetEntityId: doc.targetEntityId as string,
    relationshipType: doc.relationshipType as AIEvidenceLink["relationshipType"],
    confidence: doc.confidence as number,
    createdAt: (doc.createdAt as Date)?.toISOString() || new Date().toISOString()
  };
}

export const traceabilityService = new TraceabilityService();
