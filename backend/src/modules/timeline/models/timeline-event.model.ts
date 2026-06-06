import mongoose, { Schema } from "mongoose";

/**
 * TIMELINE_EVENTS — normalized chronological health events derived from
 * health memory records. One event per memory record.
 */
const timelineEventSchema = new Schema(
  {
    profileId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    sourceMemoryId: { type: String, required: true, unique: true, index: true },
    eventType: {
      type: String,
      enum: ["SYMPTOM_OBSERVATION", "MEDICATION_UPDATE", "GENERAL_UPDATE", "CAREGIVER_OBSERVATION"],
      required: true,
      index: true
    },
    eventDate: { type: Date, required: true, index: true },
    symptoms: { type: [String], default: [] },
    medications: { type: [String], default: [] },
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: null
    },
    createdByUserId: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["SELF", "CAREGIVER", "VOICE", "MANUAL"],
      required: true
    }
  },
  {
    timestamps: true,
    collection: "timeline_events"
  }
);

timelineEventSchema.index({ profileId: 1, eventDate: -1 });
timelineEventSchema.index({ profileId: 1, symptoms: 1 });
timelineEventSchema.index({ familyId: 1, eventDate: -1 });

export const TimelineEventModel = mongoose.model("TimelineEvent", timelineEventSchema);
