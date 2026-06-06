import mongoose, { Schema } from "mongoose";

/**
 * EXPLANATIONS — human-readable explanations for AI-generated outputs.
 *
 * Each explanation answers:
 * - Why was this generated?
 * - What observations contributed?
 * - What timeline patterns supported it?
 *
 * Prepared for future UI: evidence cards, expandable reasoning,
 * linked observations, supporting timeline references.
 */
const explanationSchema = new Schema(
  {
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
    targetEntityId: { type: String, required: true, unique: true, index: true },
    explanationText: { type: String, required: true },
    supportingEvidence: {
      type: [
        {
          entityType: { type: String, required: true },
          entityId: { type: String, required: true },
          label: { type: String, required: true },
          timestamp: { type: String, default: null }
        }
      ],
      default: []
    },
    confidence: { type: Number, required: true, min: 0, max: 1 }
  },
  {
    timestamps: true,
    collection: "explanations"
  }
);

explanationSchema.index({ targetType: 1, createdAt: -1 });

export const ExplanationModel = mongoose.model("Explanation", explanationSchema);
