import mongoose, { Schema } from "mongoose";

/**
 * FOLLOWUP_PROMPTS — calm, contextual follow-up prompts generated from
 * health patterns and recent observations.
 *
 * Tone: caring, lightweight, observational.
 * Safety: never diagnoses, recommends medication, or implies emergencies.
 */
const followupPromptSchema = new Schema(
  {
    profileId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    relatedPatternId: { type: String, default: null },
    followupType: {
      type: String,
      enum: ["SYMPTOM_CHECK", "MEDICATION_CHECK", "WELLNESS_CHECK", "CONTEXT_GAP", "CAREGIVER_FOLLOWUP"],
      required: true,
      index: true
    },
    generatedPrompt: { type: String, required: true },
    triggerReason: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    supportingEvidenceIds: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["PENDING", "DELIVERED", "DISMISSED", "EXPIRED"],
      required: true,
      default: "PENDING",
      index: true
    },
    cooldownExpiresAt: { type: Date, required: true }
  },
  {
    timestamps: true,
    collection: "followup_prompts"
  }
);

followupPromptSchema.index({ profileId: 1, status: 1 });
followupPromptSchema.index({ profileId: 1, followupType: 1, cooldownExpiresAt: 1 });
followupPromptSchema.index({ familyId: 1, status: 1 });
followupPromptSchema.index({ status: 1, createdAt: 1 });

export const FollowupPromptModel = mongoose.model("FollowupPrompt", followupPromptSchema);
