/**
 * Explainability & Evidence Layer
 *
 * Ensures every AI-generated pattern, summary, follow-up, and care
 * guidance can be traced back to supporting health observations and
 * timeline events.
 *
 * Answers for every output:
 * - Why was this generated?
 * - What observations contributed?
 * - What timeline patterns supported it?
 *
 * Safety:
 * - Preserves factual traceability
 * - Avoids invented reasoning
 * - Avoids hallucinated evidence
 * - Never hides AI logic
 *
 * Future-proofed for: doctor-facing explainability, audit history,
 * AI confidence visualization, evidence graphs, trust scoring.
 */

export {
  explainabilityService,
  ExplainabilityService
} from "./explainability.service.js";

export {
  traceabilityService,
  TraceabilityService
} from "./traceability.service.js";

export {
  buildEvidenceItem,
  buildPatternExplanation,
  buildGuidanceExplanation,
  buildDigestExplanation,
  buildFollowupExplanation
} from "./evidence-builder.js";

export {
  ExplainableEntityTypeSchema,
  RelationshipTypeSchema,
  AIEvidenceLinkSchema,
  ExplanationSchema,
  MAX_TRACE_DEPTH,
  MAX_EVIDENCE_LINKS_PER_QUERY,
  type ExplainableEntityType,
  type RelationshipType,
  type AIEvidenceLink,
  type Explanation,
  type SupportingEvidenceItem,
  type TraceabilityChain,
  type RegisterEvidenceInput
} from "./explainability.types.js";

export { AIEvidenceLinkModel } from "./models/ai-evidence-link.model.js";
export { ExplanationModel } from "./models/explanation.model.js";
