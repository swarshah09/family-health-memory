import mongoose, { Schema } from "mongoose";

/**
 * SYMPTOM_CONTEXTS — running per-symptom-per-profile recurrence tracking.
 * Upserted incrementally as new timeline events arrive.
 */
const symptomContextSchema = new Schema(
  {
    profileId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    symptom: { type: String, required: true, index: true },
    totalOccurrences: { type: Number, required: true, default: 0 },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    latestSeverity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: null
    },
    observerUserIds: { type: [String], default: [] }
  },
  {
    timestamps: true,
    collection: "symptom_contexts"
  }
);

symptomContextSchema.index({ profileId: 1, symptom: 1 }, { unique: true });
symptomContextSchema.index({ profileId: 1, lastSeenAt: -1 });

export const SymptomContextModel = mongoose.model("SymptomContext", symptomContextSchema);
