import mongoose, { Schema } from "mongoose";

/**
 * AI_EXTRACTION_RESULTS — structured observation extraction per WhatsApp message.
 */
const aiExtractionResultSchema = new Schema(
  {
    messageId: { type: String, required: true, unique: true, index: true },
    extractedData: { type: Schema.Types.Mixed, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    extractionStatus: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      required: true,
      default: "PENDING",
      index: true
    }
  },
  {
    timestamps: true,
    collection: "ai_extraction_results"
  }
);

export const AIExtractionResultModel = mongoose.model("AIExtractionResult", aiExtractionResultSchema);
