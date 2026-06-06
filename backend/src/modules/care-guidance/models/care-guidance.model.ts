import mongoose, { Schema } from "mongoose";

/**
 * CARE_GUIDANCE — calm, observational specialist suggestions based on
 * recurring health patterns.
 *
 * Safety:
 * - NEVER diagnoses conditions
 * - NEVER recommends medication or treatment
 * - NEVER implies medical certainty
 * - Always includes informational disclaimer
 */
const careGuidanceSchema = new Schema(
  {
    profileId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    relatedPatternIds: { type: [String], required: true },
    suggestedSpecialist: { type: String, required: true, index: true },
    urgencyLevel: {
      type: String,
      enum: ["LOW", "MODERATE", "HIGH"],
      required: true,
      index: true
    },
    guidanceText: { type: String, required: true },
    disclaimer: { type: String, required: true },
    supportingEvidenceIds: { type: [String], default: [] },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    status: {
      type: String,
      enum: ["ACTIVE", "DISMISSED", "EXPIRED"],
      required: true,
      default: "ACTIVE",
      index: true
    }
  },
  {
    timestamps: true,
    collection: "care_guidance"
  }
);

careGuidanceSchema.index({ profileId: 1, status: 1 });
careGuidanceSchema.index({ profileId: 1, suggestedSpecialist: 1, status: 1 });
careGuidanceSchema.index({ familyId: 1, status: 1 });
careGuidanceSchema.index({ status: 1, createdAt: 1 });

export const CareGuidanceModel = mongoose.model("CareGuidance", careGuidanceSchema);
