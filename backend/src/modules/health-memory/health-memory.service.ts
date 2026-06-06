import { HealthMemoryRecordModel } from "./models/health-memory-record.model.js";
import { mapToHealthMemory } from "./health-memory.mapper.js";
import { runAllValidations } from "./health-memory.validation.js";
import type {
  HealthMemoryCreateInput,
  HealthMemoryCreateResult,
  HealthMemoryRecord
} from "./health-memory.types.js";

function logMemory(
  level: "info" | "warn",
  msg: string,
  fields: Record<string, unknown>
): void {
  const line = { scope: "health-memory", ...fields };
  if (level === "warn") console.warn(`[health-memory] ${msg}`, line);
  else console.info(`[health-memory] ${msg}`, line);
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

/**
 * Health Memory Service — creates structured, traceable health memory
 * records from resolved WhatsApp observations.
 *
 * Isolated from insights, trends, reminders, care guidance, and AI recommendations.
 */
export class HealthMemoryService {
  /**
   * Attempts to create a health memory record from a completed pipeline result.
   *
   * Pipeline order: ingestion → extraction → resolution → **memory creation**.
   *
   * Guards:
   * 1. Duplicate prevention (unique sourceMessageId)
   * 2. Unresolved profile skip
   * 3. Validation (ownership, permissions, confidence)
   */
  async createFromPipelineResult(
    input: HealthMemoryCreateInput
  ): Promise<HealthMemoryCreateResult> {
    const { resolution } = input;

    // 1. Duplicate prevention — idempotent on the source message
    const existing = await HealthMemoryRecordModel.findOne({
      sourceMessageId: input.messageId
    })
      .select("_id")
      .lean();

    if (existing) {
      logMemory("info", "duplicate skipped", {
        messageId: input.messageId,
        existingMemoryId: existing._id.toString()
      });
      return {
        memoryId: existing._id.toString(),
        status: "SKIPPED_DUPLICATE",
        reason: "Health memory record already exists for this message"
      };
    }

    // 2. Unresolved profile — cannot create memory without a target profile
    if (!resolution.resolvedProfileId) {
      logMemory("info", "unresolved profile skipped", {
        messageId: input.messageId,
        resolutionType: resolution.resolutionType,
        terms: resolution.matchedTerms
      });
      return {
        memoryId: null,
        status: "SKIPPED_UNRESOLVED",
        reason: `Profile unresolved: ${resolution.matchedTerms.join(", ") || "no signal"}`
      };
    }

    const resolvedProfileId = resolution.resolvedProfileId;

    // 3. Validation — ownership, permissions, confidence
    const validation = await runAllValidations(input, resolvedProfileId);

    if (!validation.valid) {
      // Save as REVIEW_REQUIRED so a human can audit later
      const mapped = mapToHealthMemory(input, resolvedProfileId);
      try {
        const reviewDoc = await HealthMemoryRecordModel.create({
          ...mapped,
          status: "REVIEW_REQUIRED"
        });

        logMemory("warn", "validation failed — marked for review", {
          messageId: input.messageId,
          memoryId: reviewDoc._id.toString(),
          reason: validation.reason
        });

        return {
          memoryId: reviewDoc._id.toString(),
          status: "SKIPPED_VALIDATION",
          reason: validation.reason
        };
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          return {
            memoryId: null,
            status: "SKIPPED_DUPLICATE",
            reason: "Concurrent duplicate during validation-failed insert"
          };
        }
        throw err;
      }
    }

    // 4. Map pipeline output → memory record
    const mapped = mapToHealthMemory(input, resolvedProfileId);

    // 5. Persist
    try {
      const doc = await HealthMemoryRecordModel.create(mapped);

      logMemory("info", "created", {
        messageId: input.messageId,
        memoryId: doc._id.toString(),
        profileId: resolvedProfileId,
        sourceType: mapped.sourceType,
        observationType: mapped.observationType,
        confidence: mapped.confidence,
        symptoms: mapped.extractedSymptoms.length,
        medications: mapped.extractedMedications.length
      });

      return {
        memoryId: doc._id.toString(),
        status: "CREATED"
      };
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        logMemory("info", "concurrent duplicate caught", {
          messageId: input.messageId
        });
        return {
          memoryId: null,
          status: "SKIPPED_DUPLICATE",
          reason: "Concurrent duplicate insert"
        };
      }
      throw err;
    }
  }

  /**
   * Lookup a health memory record by its source WhatsApp message ID.
   */
  async getByMessageId(messageId: string): Promise<HealthMemoryRecord | null> {
    const doc = await HealthMemoryRecordModel.findOne({
      sourceMessageId: messageId
    }).lean();
    if (!doc) return null;

    return {
      memoryId: doc._id.toString(),
      profileId: doc.profileId,
      familyId: doc.familyId,
      createdByUserId: doc.createdByUserId,
      sourceMessageId: doc.sourceMessageId,
      extractionId: doc.extractionId,
      resolutionId: doc.resolutionId,
      sourceType: doc.sourceType as HealthMemoryRecord["sourceType"],
      observationType: doc.observationType as HealthMemoryRecord["observationType"],
      content: doc.content,
      extractedSymptoms: (doc.extractedSymptoms as string[]) || [],
      extractedMedications: (doc.extractedMedications as string[]) || [],
      extractedTiming: (doc.extractedTiming as string[]) || [],
      severity: (doc.severity as HealthMemoryRecord["severity"]) ?? null,
      confidence: doc.confidence,
      status: doc.status as HealthMemoryRecord["status"],
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString()
    };
  }

  /**
   * List health memory records for a specific profile (timeline view).
   */
  async listForProfile(
    profileId: string,
    opts?: { limit?: number; since?: Date }
  ): Promise<HealthMemoryRecord[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
    const filter: Record<string, unknown> = {
      profileId,
      status: "ACTIVE"
    };
    if (opts?.since) {
      filter.createdAt = { $gte: opts.since };
    }

    const docs = await HealthMemoryRecordModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return docs.map((doc) => ({
      memoryId: doc._id.toString(),
      profileId: doc.profileId,
      familyId: doc.familyId,
      createdByUserId: doc.createdByUserId,
      sourceMessageId: doc.sourceMessageId,
      extractionId: doc.extractionId,
      resolutionId: doc.resolutionId,
      sourceType: doc.sourceType as HealthMemoryRecord["sourceType"],
      observationType: doc.observationType as HealthMemoryRecord["observationType"],
      content: doc.content,
      extractedSymptoms: (doc.extractedSymptoms as string[]) || [],
      extractedMedications: (doc.extractedMedications as string[]) || [],
      extractedTiming: (doc.extractedTiming as string[]) || [],
      severity: (doc.severity as HealthMemoryRecord["severity"]) ?? null,
      confidence: doc.confidence,
      status: doc.status as HealthMemoryRecord["status"],
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString()
    }));
  }

  /**
   * List records pending human review for a family.
   */
  async listPendingReview(
    familyId: string,
    limit = 50
  ): Promise<HealthMemoryRecord[]> {
    const docs = await HealthMemoryRecordModel.find({
      familyId,
      status: "REVIEW_REQUIRED"
    })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 200))
      .lean();

    return docs.map((doc) => ({
      memoryId: doc._id.toString(),
      profileId: doc.profileId,
      familyId: doc.familyId,
      createdByUserId: doc.createdByUserId,
      sourceMessageId: doc.sourceMessageId,
      extractionId: doc.extractionId,
      resolutionId: doc.resolutionId,
      sourceType: doc.sourceType as HealthMemoryRecord["sourceType"],
      observationType: doc.observationType as HealthMemoryRecord["observationType"],
      content: doc.content,
      extractedSymptoms: (doc.extractedSymptoms as string[]) || [],
      extractedMedications: (doc.extractedMedications as string[]) || [],
      extractedTiming: (doc.extractedTiming as string[]) || [],
      severity: (doc.severity as HealthMemoryRecord["severity"]) ?? null,
      confidence: doc.confidence,
      status: doc.status as HealthMemoryRecord["status"],
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString()
    }));
  }
}

export const healthMemoryService = new HealthMemoryService();
