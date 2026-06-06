import crypto from "node:crypto";
import { IdempotencyKeyModel } from "./idempotency.model.js";

/**
 * Idempotency Service — prevents duplicate processing using
 * atomic check-and-set with MongoDB.
 *
 * Key generation: SHA-256 hash of entityType + entityId.
 * TTL: 30 days (auto-cleaned by MongoDB TTL index).
 */

const IDEMPOTENCY_TTL_DAYS = 30;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

export class IdempotencyService {
  /**
   * Generates an idempotency key from entity type and ID.
   */
  generateKey(entityType: string, entityId: string): string {
    return crypto
      .createHash("sha256")
      .update(`${entityType}:${entityId}`)
      .digest("hex");
  }

  /**
   * Attempts to acquire an idempotency lock.
   *
   * Returns:
   * - { acquired: true } if this is the first processing attempt
   * - { acquired: false, status, result } if already processed/processing
   */
  async acquire(
    entityType: string,
    entityId: string
  ): Promise<
    | { acquired: true }
    | { acquired: false; status: string; result: unknown }
  > {
    const key = this.generateKey(entityType, entityId);
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_DAYS * 24 * 60 * 60 * 1000);

    try {
      await IdempotencyKeyModel.create({
        key,
        entityType,
        entityId,
        status: "PROCESSING",
        expiresAt
      });
      return { acquired: true };
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const existing = await IdempotencyKeyModel.findOne({ key })
          .select("status result")
          .lean();
        return {
          acquired: false,
          status: existing?.status ?? "UNKNOWN",
          result: existing?.result ?? null
        };
      }
      throw err;
    }
  }

  /**
   * Marks an idempotency key as completed with its result.
   */
  async complete(entityType: string, entityId: string, result?: unknown): Promise<void> {
    const key = this.generateKey(entityType, entityId);
    await IdempotencyKeyModel.updateOne(
      { key },
      { $set: { status: "COMPLETED", result: result ?? null } }
    );
  }

  /**
   * Marks an idempotency key as failed (allows retry).
   */
  async fail(entityType: string, entityId: string): Promise<void> {
    const key = this.generateKey(entityType, entityId);
    // Remove the key so the job can be retried
    await IdempotencyKeyModel.deleteOne({ key });
  }

  /**
   * Checks if an entity has already been processed.
   */
  async isProcessed(entityType: string, entityId: string): Promise<boolean> {
    const key = this.generateKey(entityType, entityId);
    const doc = await IdempotencyKeyModel.findOne({ key, status: "COMPLETED" })
      .select("_id")
      .lean();
    return !!doc;
  }
}

export const idempotencyService = new IdempotencyService();
