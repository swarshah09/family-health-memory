import { FamilyMemberModel } from "../../models.js";
import { patternEngineService } from "../pattern-engine/index.js";
import { timelineService } from "../timeline/index.js";
import { CareGuidanceModel } from "./models/care-guidance.model.js";
import { generateGuidanceCandidates } from "./guidance-generator.js";
import type {
  CareGuidance,
  CareGuidanceGenerationResult
} from "./care-guidance.types.js";
import { GUIDANCE_DISCLAIMER, GUIDANCE_EXPIRY_DAYS } from "./care-guidance.types.js";

function logGuidance(msg: string, fields: Record<string, unknown>): void {
  console.info(`[care-guidance] ${msg}`, { scope: "care-guidance", ...fields });
}

/**
 * Care Guidance Service — generates calm, observational specialist suggestions
 * and urgency-level guidance based on recurring health patterns.
 *
 * Safety constraints (enforced at every level):
 * - NEVER diagnoses conditions
 * - NEVER recommends medication or treatment
 * - NEVER implies medical certainty
 * - NEVER replaces healthcare professionals
 * - Always includes disclaimer
 *
 * Isolated from: direct diagnosis systems, predictive medical AI,
 * treatment recommendation systems.
 */
export class CareGuidanceService {
  /**
   * Generates care guidance for a single profile.
   *
   * 1. Load active patterns + symptom context
   * 2. Generate guidance candidates (specialist mapping + urgency + text)
   * 3. Dedup against existing active guidance
   * 4. Persist new guidance
   */
  async generateGuidance(
    profileId: string,
    familyId: string
  ): Promise<CareGuidanceGenerationResult> {
    const [patterns, symptomContexts] = await Promise.all([
      patternEngineService.getActivePatterns(profileId),
      timelineService.getSymptomContext(profileId)
    ]);

    if (patterns.length === 0) {
      return { profileId, created: 0, skippedDuplicate: 0 };
    }

    const candidates = generateGuidanceCandidates(
      profileId,
      familyId,
      patterns,
      symptomContexts
    );

    let created = 0;
    let skippedDuplicate = 0;

    for (const candidate of candidates) {
      // Check for existing active guidance with same specialist + profile
      const existing = await CareGuidanceModel.findOne({
        profileId,
        suggestedSpecialist: candidate.suggestedSpecialist,
        status: "ACTIVE"
      })
        .select("_id")
        .lean();

      if (existing) {
        skippedDuplicate++;
        continue;
      }

      await CareGuidanceModel.create({
        profileId: candidate.profileId,
        familyId: candidate.familyId,
        relatedPatternIds: candidate.relatedPatternIds,
        suggestedSpecialist: candidate.suggestedSpecialist,
        urgencyLevel: candidate.urgencyLevel,
        guidanceText: candidate.guidanceText,
        disclaimer: GUIDANCE_DISCLAIMER,
        supportingEvidenceIds: candidate.supportingEvidenceIds,
        confidence: candidate.confidence,
        status: "ACTIVE"
      });
      created++;
    }

    if (created > 0) {
      logGuidance("generated", { profileId, created, skippedDuplicate });
    }

    return { profileId, created, skippedDuplicate };
  }

  /**
   * Batch generates guidance across all families. Called by scheduled cron.
   */
  async runScheduledGuidanceGeneration(): Promise<{
    profilesProcessed: number;
    guidanceCreated: number;
  }> {
    const familyIds: string[] = await FamilyMemberModel.distinct("familyId");
    let profilesProcessed = 0;
    let guidanceCreated = 0;

    for (const familyId of familyIds) {
      const members = await FamilyMemberModel.find({ familyId }).select("_id").lean();

      for (const member of members) {
        try {
          const result = await this.generateGuidance(
            member._id.toString(),
            familyId
          );
          profilesProcessed++;
          guidanceCreated += result.created;
        } catch (err) {
          logGuidance("profile guidance failed", {
            profileId: member._id.toString(),
            error: err instanceof Error ? err.message : "unknown"
          });
        }
      }
    }

    // Expire stale guidance
    await this.expireStaleGuidance();

    logGuidance("scheduled generation complete", { profilesProcessed, guidanceCreated });
    return { profilesProcessed, guidanceCreated };
  }

  /**
   * Get active guidance for a profile.
   */
  async getActiveGuidance(profileId: string): Promise<CareGuidance[]> {
    const docs = await CareGuidanceModel.find({
      profileId,
      status: "ACTIVE"
    })
      .sort({ createdAt: -1 })
      .lean();

    return docs.map(mapGuidanceDoc);
  }

  /**
   * Get active guidance for an entire family.
   */
  async getGuidanceForFamily(familyId: string): Promise<CareGuidance[]> {
    const docs = await CareGuidanceModel.find({
      familyId,
      status: "ACTIVE"
    })
      .sort({ createdAt: -1 })
      .lean();

    return docs.map(mapGuidanceDoc);
  }

  /**
   * Dismiss a guidance item (user chose to skip it).
   */
  async dismissGuidance(guidanceId: string): Promise<void> {
    await CareGuidanceModel.updateOne(
      { _id: guidanceId, status: "ACTIVE" },
      { $set: { status: "DISMISSED" } }
    );
  }

  /**
   * Expire stale guidance that hasn't been reconfirmed.
   */
  async expireStaleGuidance(): Promise<number> {
    const cutoff = new Date(
      Date.now() - GUIDANCE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );
    const result = await CareGuidanceModel.updateMany(
      { status: "ACTIVE", createdAt: { $lt: cutoff } },
      { $set: { status: "EXPIRED" } }
    );
    return result.modifiedCount;
  }

  /**
   * Get a single guidance by ID.
   */
  async getGuidanceById(guidanceId: string): Promise<CareGuidance | null> {
    const doc = await CareGuidanceModel.findById(guidanceId).lean();
    if (!doc) return null;
    return mapGuidanceDoc(doc);
  }
}

function mapGuidanceDoc(
  doc: Record<string, unknown> & { _id: { toString(): string } }
): CareGuidance {
  return {
    guidanceId: doc._id.toString(),
    profileId: doc.profileId as string,
    familyId: doc.familyId as string,
    relatedPatternIds: (doc.relatedPatternIds || []) as string[],
    suggestedSpecialist: doc.suggestedSpecialist as string,
    urgencyLevel: doc.urgencyLevel as CareGuidance["urgencyLevel"],
    guidanceText: doc.guidanceText as string,
    disclaimer: doc.disclaimer as string,
    supportingEvidenceIds: (doc.supportingEvidenceIds || []) as string[],
    confidence: doc.confidence as number,
    status: doc.status as CareGuidance["status"],
    createdAt: (doc.createdAt as Date)?.toISOString() || new Date().toISOString()
  };
}

export const careGuidanceService = new CareGuidanceService();
