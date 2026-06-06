import mongoose, { Schema } from "mongoose";

/**
 * PROCESSING_STATES — tracks the lifecycle of every processable entity.
 *
 * Lifecycle: PENDING → PROCESSING → COMPLETED | FAILED | RETRYING
 *
 * Used for:
 * - State machine enforcement (atomic transitions)
 * - Failure recovery (replay failed jobs)
 * - Observability (processing latency, success rates)
 */
const processingStateSchema = new Schema(
  {
    entityType: {
      type: String,
      required: true,
      enum: [
        "WHATSAPP_MESSAGE", "VOICE_TRANSCRIPTION", "AI_EXTRACTION",
        "PROFILE_RESOLUTION", "HEALTH_MEMORY", "TIMELINE_EVENT",
        "BATCH_JOB"
      ],
      index: true
    },
    entityId: { type: String, required: true },
    state: {
      type: String,
      required: true,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "RETRYING"],
      index: true
    },
    attempts: { type: Number, required: true, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    error: { type: String, default: null },
    completedAt: { type: Date, default: null }
  },
  {
    timestamps: true,
    collection: "processing_states"
  }
);

processingStateSchema.index({ entityType: 1, entityId: 1 }, { unique: true });
processingStateSchema.index({ state: 1, entityType: 1 });
processingStateSchema.index({ lastAttemptAt: 1 });

export const ProcessingStateModel = mongoose.model("ProcessingState", processingStateSchema);
