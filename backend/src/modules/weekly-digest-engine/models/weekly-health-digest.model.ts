import mongoose, { Schema } from "mongoose";

/**
 * WEEKLY_HEALTH_DIGESTS — calm, observational weekly summaries per health profile.
 *
 * Tone: human, supportive, observational.
 * Safety: no diagnosis, treatment, or fear-inducing language.
 */
const weeklyHealthDigestSchema = new Schema(
  {
    profileId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    digestType: {
      type: String,
      enum: ["PERSONAL_DIGEST", "FAMILY_DIGEST"],
      required: true
    },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    summaryTitle: { type: String, required: true },
    summaryText: { type: String, required: true },
    keyObservations: {
      type: [
        {
          observationType: {
            type: String,
            enum: [
              "RECURRING_SYMPTOM",
              "NEW_SYMPTOM",
              "RESOLVED_SYMPTOM",
              "FREQUENCY_CHANGE",
              "CAREGIVER_CONCERN",
              "WELLNESS_CHANGE"
            ],
            required: true
          },
          description: { type: String, required: true },
          relatedSymptoms: { type: [String], default: [] },
          supportingEventIds: { type: [String], default: [] },
          relatedPatternId: { type: String },
          confidence: { type: Number, required: true, min: 0, max: 1 }
        }
      ],
      default: []
    },
    relatedPatterns: { type: [String], default: [] },
    supportingEvidenceIds: { type: [String], default: [] },
    generatedAt: { type: Date, required: true }
  },
  {
    timestamps: true,
    collection: "weekly_health_digests"
  }
);

// One digest per profile per week
weeklyHealthDigestSchema.index({ profileId: 1, periodStart: 1 }, { unique: true });
weeklyHealthDigestSchema.index({ profileId: 1, generatedAt: -1 });
weeklyHealthDigestSchema.index({ familyId: 1, periodStart: -1 });

export const WeeklyHealthDigestModel = mongoose.model(
  "WeeklyHealthDigest",
  weeklyHealthDigestSchema
);
