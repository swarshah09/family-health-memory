import mongoose, { Schema } from "mongoose";

/**
 * CONTEXTUAL_EPISODES — groups of related timeline events sharing a symptom
 * within a time proximity window. Represents a health "episode" like
 * "recurring dizziness over 3 days".
 */
const contextualEpisodeSchema = new Schema(
  {
    profileId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    primarySymptom: { type: String, required: true, index: true },
    relatedSymptoms: { type: [String], default: [] },
    eventIds: { type: [String], default: [] },
    observationCount: { type: Number, required: true, default: 1 },
    firstOccurrence: { type: Date, required: true, index: true },
    lastOccurrence: { type: Date, required: true },
    latestSeverity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: null
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      required: true,
      default: "ACTIVE",
      index: true
    }
  },
  {
    timestamps: true,
    collection: "contextual_episodes"
  }
);

contextualEpisodeSchema.index({ profileId: 1, primarySymptom: 1, status: 1 });
contextualEpisodeSchema.index({ profileId: 1, lastOccurrence: -1 });

export const ContextualEpisodeModel = mongoose.model("ContextualEpisode", contextualEpisodeSchema);
