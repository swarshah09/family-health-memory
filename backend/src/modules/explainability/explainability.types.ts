import { z } from "zod";

// ── Entity types (source and target of evidence links) ──────────────────
export const ExplainableEntityTypeSchema = z.enum([
  "WHATSAPP_MESSAGE",
  "VOICE_RECORDING",
  "VOICE_TRANSCRIPT",
  "EXTRACTION_RESULT",
  "PROFILE_RESOLUTION",
  "HEALTH_MEMORY",
  "TIMELINE_EVENT",
  "CONTEXTUAL_EPISODE",
  "DETECTED_PATTERN",
  "WEEKLY_DIGEST",
  "FOLLOWUP_PROMPT",
  "CARE_GUIDANCE"
]);

export type ExplainableEntityType = z.infer<typeof ExplainableEntityTypeSchema>;

// ── Relationship types ──────────────────────────────────────────────────
export const RelationshipTypeSchema = z.enum([
  "DERIVED_FROM",
  "EXTRACTED_FROM",
  "RESOLVED_TO",
  "RECORDED_AS",
  "MAPPED_TO_TIMELINE",
  "DETECTED_PATTERN_FROM",
  "SUMMARIZED_IN",
  "PROMPTED_BY",
  "GUIDED_BY",
  "TRANSCRIBED_FROM"
]);

export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

// ── Evidence link (graph edge) ──────────────────────────────────────────
export const AIEvidenceLinkSchema = z.object({
  evidenceId: z.string(),
  sourceType: ExplainableEntityTypeSchema,
  sourceEntityId: z.string(),
  targetType: ExplainableEntityTypeSchema,
  targetEntityId: z.string(),
  relationshipType: RelationshipTypeSchema,
  confidence: z.number().min(0).max(1),
  createdAt: z.string()
});

export type AIEvidenceLink = z.infer<typeof AIEvidenceLinkSchema>;

// ── Explanation output ──────────────────────────────────────────────────
export const ExplanationSchema = z.object({
  explanationId: z.string(),
  targetType: ExplainableEntityTypeSchema,
  targetEntityId: z.string(),
  explanationText: z.string(),
  supportingEvidence: z.array(z.object({
    entityType: ExplainableEntityTypeSchema,
    entityId: z.string(),
    label: z.string(),
    timestamp: z.string().nullable()
  })),
  confidence: z.number().min(0).max(1),
  createdAt: z.string()
});

export type Explanation = z.infer<typeof ExplanationSchema>;

// ── Supporting evidence item (for UI preparation) ───────────────────────
export type SupportingEvidenceItem = {
  entityType: ExplainableEntityType;
  entityId: string;
  label: string;
  timestamp: string | null;
};

// ── Traceability chain (full path from output to source) ────────────────
export type TraceabilityChain = {
  targetType: ExplainableEntityType;
  targetEntityId: string;
  links: AIEvidenceLink[];
  depth: number;
};

// ── Evidence registration input ─────────────────────────────────────────
export type RegisterEvidenceInput = {
  sourceType: ExplainableEntityType;
  sourceEntityId: string;
  targetType: ExplainableEntityType;
  targetEntityId: string;
  relationshipType: RelationshipType;
  confidence: number;
};

// ── Constants ───────────────────────────────────────────────────────────

/** Maximum depth for recursive traceability chain traversal. */
export const MAX_TRACE_DEPTH = 10;

/** Maximum evidence links returned per query. */
export const MAX_EVIDENCE_LINKS_PER_QUERY = 100;
