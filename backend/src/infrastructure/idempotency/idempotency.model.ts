import mongoose, { Schema } from "mongoose";

/**
 * IDEMPOTENCY_KEYS — prevents duplicate processing.
 *
 * Used for:
 * - Repeated webhook events (Meta retries)
 * - Duplicate AI extraction jobs
 * - Queue replay safety
 *
 * TTL index auto-removes expired keys after 30 days.
 */
const idempotencyKeySchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true },
    status: {
      type: String,
      enum: ["PROCESSING", "COMPLETED", "FAILED"],
      required: true
    },
    result: { type: Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, required: true, index: true }
  },
  {
    timestamps: true,
    collection: "idempotency_keys"
  }
);

// TTL index: MongoDB automatically removes documents when expiresAt passes
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyKeyModel = mongoose.model("IdempotencyKey", idempotencyKeySchema);
