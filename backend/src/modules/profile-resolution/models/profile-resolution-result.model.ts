import mongoose, { Schema } from "mongoose";

/**
 * PROFILE_RESOLUTION_RESULTS — health profile ownership for a WhatsApp message.
 */
const profileResolutionResultSchema = new Schema(
  {
    messageId: { type: String, required: true, unique: true, index: true },
    resolvedProfileId: { type: String, index: true, sparse: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    matchedTerms: { type: [String], default: [] },
    resolutionType: {
      type: String,
      enum: ["SELF", "FAMILY_REFERENCE", "NAME_REFERENCE", "UNRESOLVED"],
      required: true,
      index: true
    }
  },
  {
    timestamps: true,
    collection: "profile_resolution_results"
  }
);

export const ProfileResolutionResultModel = mongoose.model(
  "ProfileResolutionResult",
  profileResolutionResultSchema
);
