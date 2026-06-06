import mongoose, { Schema } from "mongoose";

/**
 * HEALTH_MEMORY_RECORDS — structured health observations derived from
 * WhatsApp messages after AI extraction and profile resolution.
 *
 * Each record maintains full traceability back to:
 * - the original WhatsApp message (sourceMessageId)
 * - the AI extraction result (extractionId)
 * - the profile resolution result (resolutionId)
 */
const healthMemoryRecordSchema = new Schema(
  {
    profileId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    createdByUserId: { type: String, required: true, index: true },

    // Traceability — unique per source message to prevent duplicates
    sourceMessageId: { type: String, required: true, unique: true, index: true },
    extractionId: { type: String, required: true },
    resolutionId: { type: String, required: true },

    sourceType: {
      type: String,
      enum: ["SELF", "CAREGIVER", "VOICE", "MANUAL"],
      required: true,
      index: true
    },
    observationType: {
      type: String,
      enum: [
        "SELF_OBSERVATION",
        "CAREGIVER_OBSERVATION",
        "MEDICATION_UPDATE",
        "GENERAL_UPDATE",
        "UNKNOWN"
      ],
      required: true,
      index: true
    },

    content: { type: String, required: true },

    extractedSymptoms: { type: [String], default: [] },
    extractedMedications: { type: [String], default: [] },
    extractedTiming: { type: [String], default: [] },

    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: null
    },
    confidence: { type: Number, required: true, min: 0, max: 1 },

    status: {
      type: String,
      enum: ["ACTIVE", "REVIEW_REQUIRED"],
      required: true,
      default: "ACTIVE",
      index: true
    }
  },
  {
    timestamps: true,
    collection: "health_memory_records"
  }
);

// Compound indexes for common query patterns
healthMemoryRecordSchema.index({ profileId: 1, createdAt: -1 });
healthMemoryRecordSchema.index({ familyId: 1, createdAt: -1 });
healthMemoryRecordSchema.index({ familyId: 1, status: 1 });

export const HealthMemoryRecordModel = mongoose.model(
  "HealthMemoryRecord",
  healthMemoryRecordSchema
);
