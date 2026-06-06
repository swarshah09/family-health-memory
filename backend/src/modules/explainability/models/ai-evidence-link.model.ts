import mongoose, { Schema } from "mongoose";

/**
 * AI_EVIDENCE_LINKS — directed graph edges that connect AI-generated
 * entities to their supporting source evidence.
 *
 * Each link represents: sourceEntity --[relationship]--> targetEntity
 *
 * Example chains:
 *   WHATSAPP_MESSAGE --EXTRACTED_FROM--> EXTRACTION_RESULT
 *   EXTRACTION_RESULT --RESOLVED_TO--> PROFILE_RESOLUTION
 *   HEALTH_MEMORY --MAPPED_TO_TIMELINE--> TIMELINE_EVENT
 *   TIMELINE_EVENT --DETECTED_PATTERN_FROM--> DETECTED_PATTERN
 *   DETECTED_PATTERN --GUIDED_BY--> CARE_GUIDANCE
 */
const aiEvidenceLinkSchema = new Schema(
  {
    sourceType: {
      type: String,
      enum: [
        "WHATSAPP_MESSAGE", "VOICE_RECORDING", "VOICE_TRANSCRIPT",
        "EXTRACTION_RESULT", "PROFILE_RESOLUTION", "HEALTH_MEMORY",
        "TIMELINE_EVENT", "CONTEXTUAL_EPISODE", "DETECTED_PATTERN",
        "WEEKLY_DIGEST", "FOLLOWUP_PROMPT", "CARE_GUIDANCE"
      ],
      required: true,
      index: true
    },
    sourceEntityId: { type: String, required: true, index: true },
    targetType: {
      type: String,
      enum: [
        "WHATSAPP_MESSAGE", "VOICE_RECORDING", "VOICE_TRANSCRIPT",
        "EXTRACTION_RESULT", "PROFILE_RESOLUTION", "HEALTH_MEMORY",
        "TIMELINE_EVENT", "CONTEXTUAL_EPISODE", "DETECTED_PATTERN",
        "WEEKLY_DIGEST", "FOLLOWUP_PROMPT", "CARE_GUIDANCE"
      ],
      required: true,
      index: true
    },
    targetEntityId: { type: String, required: true, index: true },
    relationshipType: {
      type: String,
      enum: [
        "DERIVED_FROM", "EXTRACTED_FROM", "RESOLVED_TO",
        "RECORDED_AS", "MAPPED_TO_TIMELINE", "DETECTED_PATTERN_FROM",
        "SUMMARIZED_IN", "PROMPTED_BY", "GUIDED_BY", "TRANSCRIBED_FROM"
      ],
      required: true,
      index: true
    },
    confidence: { type: Number, required: true, min: 0, max: 1 }
  },
  {
    timestamps: true,
    collection: "ai_evidence_links"
  }
);

// Optimized lookups: "what evidence supports this entity?"
aiEvidenceLinkSchema.index({ targetEntityId: 1, targetType: 1 });
// Reverse lookup: "what did this entity produce?"
aiEvidenceLinkSchema.index({ sourceEntityId: 1, sourceType: 1 });
// Relationship-based queries
aiEvidenceLinkSchema.index({ relationshipType: 1, createdAt: -1 });
// Prevent duplicate edges
aiEvidenceLinkSchema.index(
  { sourceEntityId: 1, targetEntityId: 1, relationshipType: 1 },
  { unique: true }
);

export const AIEvidenceLinkModel = mongoose.model("AIEvidenceLink", aiEvidenceLinkSchema);
