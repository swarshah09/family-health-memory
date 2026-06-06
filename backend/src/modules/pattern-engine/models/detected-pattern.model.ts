import mongoose, { Schema } from "mongoose";

/**
 * DETECTED_PATTERNS — recurring health observation patterns detected from
 * timeline events and symptom context data.
 *
 * Safety: these are observable recurrence patterns only — no diagnosis,
 * disease prediction, or treatment suggestions.
 */
const detectedPatternSchema = new Schema(
  {
    profileId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    patternType: {
      type: String,
      enum: [
        "RECURRING_SYMPTOM",
        "PERSISTENT_OBSERVATION",
        "FREQUENCY_INCREASE",
        "MULTI_SYMPTOM_CLUSTER",
        "CAREGIVER_PATTERN"
      ],
      required: true,
      index: true
    },
    relatedSymptoms: { type: [String], required: true },
    occurrenceCount: { type: Number, required: true, default: 0 },
    firstOccurrence: { type: Date, required: true },
    latestOccurrence: { type: Date, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    supportingTimelineEventIds: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["ACTIVE", "STALE"],
      required: true,
      default: "ACTIVE",
      index: true
    }
  },
  {
    timestamps: true,
    collection: "detected_patterns"
  }
);

detectedPatternSchema.index({ profileId: 1, patternType: 1, status: 1 });
detectedPatternSchema.index({ profileId: 1, latestOccurrence: -1 });
detectedPatternSchema.index({ familyId: 1, status: 1 });
// Composite key for upsert: one active pattern per type per symptom set per profile
detectedPatternSchema.index(
  { profileId: 1, patternType: 1, relatedSymptoms: 1 },
  { name: "pattern_upsert_key" }
);

export const DetectedPatternModel = mongoose.model("DetectedPattern", detectedPatternSchema);
