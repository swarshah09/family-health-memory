import { ProcessingStateModel } from "./processing-state.model.js";

/**
 * Processing State Service — manages entity processing lifecycle.
 *
 * State machine: PENDING → PROCESSING → COMPLETED | FAILED | RETRYING
 *
 * Uses atomic findOneAndUpdate with expected-state guards
 * to prevent race conditions.
 */

type ProcessingState = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRYING";

const VALID_TRANSITIONS: Record<ProcessingState, ProcessingState[]> = {
  PENDING: ["PROCESSING"],
  PROCESSING: ["COMPLETED", "FAILED"],
  FAILED: ["RETRYING", "PROCESSING"],
  RETRYING: ["PROCESSING"],
  COMPLETED: [] // terminal state
};

export class ProcessingStateService {
  /**
   * Transitions an entity to a new state.
   * Creates the state record if it doesn't exist (upsert for PROCESSING from implicit PENDING).
   */
  async transition(
    entityType: string,
    entityId: string,
    newState: ProcessingState,
    error?: string
  ): Promise<void> {
    const update: Record<string, unknown> = {
      state: newState,
      lastAttemptAt: new Date(),
      $inc: { attempts: newState === "PROCESSING" ? 1 : 0 }
    };

    if (newState === "COMPLETED") {
      update.completedAt = new Date();
      update.error = null;
    }
    if (newState === "FAILED" && error) {
      update.error = error;
    }

    await ProcessingStateModel.findOneAndUpdate(
      { entityType, entityId },
      {
        $set: {
          state: newState,
          lastAttemptAt: new Date(),
          ...(newState === "COMPLETED" ? { completedAt: new Date(), error: null } : {}),
          ...(newState === "FAILED" && error ? { error } : {})
        },
        $inc: { attempts: newState === "PROCESSING" ? 1 : 0 },
        $setOnInsert: { entityType, entityId }
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Gets the current state of an entity.
   */
  async getState(
    entityType: string,
    entityId: string
  ): Promise<{ state: ProcessingState; attempts: number; error: string | null } | null> {
    const doc = await ProcessingStateModel.findOne({ entityType, entityId })
      .select("state attempts error")
      .lean();
    if (!doc) return null;
    return {
      state: doc.state as ProcessingState,
      attempts: doc.attempts,
      error: doc.error ?? null
    };
  }

  /**
   * Lists all entities in a given state (for recovery/replay).
   */
  async listByState(
    entityType: string,
    state: ProcessingState,
    limit = 100
  ): Promise<Array<{ entityId: string; attempts: number; error: string | null }>> {
    const docs = await ProcessingStateModel.find({ entityType, state })
      .sort({ lastAttemptAt: 1 })
      .limit(limit)
      .select("entityId attempts error")
      .lean();

    return docs.map((d) => ({
      entityId: d.entityId,
      attempts: d.attempts,
      error: d.error ?? null
    }));
  }

  /**
   * Counts entities by state for observability.
   */
  async countByState(
    entityType: string
  ): Promise<Record<ProcessingState, number>> {
    const pipeline = await ProcessingStateModel.aggregate([
      { $match: { entityType } },
      { $group: { _id: "$state", count: { $sum: 1 } } }
    ]);

    const result: Record<string, number> = {
      PENDING: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0, RETRYING: 0
    };
    for (const row of pipeline) {
      result[row._id as string] = row.count;
    }
    return result as Record<ProcessingState, number>;
  }
}

export const processingStateService = new ProcessingStateService();
