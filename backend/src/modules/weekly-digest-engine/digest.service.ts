import { FamilyMemberModel } from "../../models.js";
import { WeeklyHealthDigestModel } from "./models/weekly-health-digest.model.js";
import { generateDigestForProfile } from "./digest-generator.js";
import type { WeeklyHealthDigest, DigestGenerationResult } from "./digest.types.js";

function logDigest(msg: string, fields: Record<string, unknown>): void {
  console.info(`[weekly-digest] ${msg}`, { scope: "weekly-digest", ...fields });
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
 * Weekly Digest Service — generates calm, observational weekly health
 * summaries per profile using timeline events and detected patterns.
 *
 * Safety: no diagnosis, treatment, or fear-inducing language.
 */
export class DigestService {
  /**
   * Generates and stores a digest for a single profile.
   */
  async generateAndStoreDigest(
    profileId: string,
    familyId: string,
    profileName: string,
    period?: { start: Date; end: Date }
  ): Promise<DigestGenerationResult> {
    const periodEnd = period?.end || new Date();
    const periodStart =
      period?.start || new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Duplicate check
    const existing = await WeeklyHealthDigestModel.findOne({
      profileId,
      periodStart
    })
      .select("_id")
      .lean();

    if (existing) {
      return {
        digestId: existing._id.toString(),
        status: "SKIPPED_DUPLICATE",
        observationCount: 0
      };
    }

    const digest = await generateDigestForProfile(
      profileId,
      familyId,
      profileName,
      periodStart,
      periodEnd
    );

    if (digest.keyObservations.length === 0 && digest.supportingEvidenceIds.length === 0) {
      return { digestId: null, status: "SKIPPED_NO_DATA", observationCount: 0 };
    }

    try {
      const doc = await WeeklyHealthDigestModel.create({
        ...digest,
        periodStart,
        periodEnd,
        generatedAt: new Date()
      });

      logDigest("created", {
        digestId: doc._id.toString(),
        profileId,
        observations: digest.keyObservations.length,
        patterns: digest.relatedPatterns.length
      });

      return {
        digestId: doc._id.toString(),
        status: "CREATED",
        observationCount: digest.keyObservations.length
      };
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return { digestId: null, status: "SKIPPED_DUPLICATE", observationCount: 0 };
      }
      throw err;
    }
  }

  /**
   * Batch generates digests for all profiles in a family.
   */
  async generateAllDigestsForFamily(familyId: string): Promise<DigestGenerationResult[]> {
    const members = await FamilyMemberModel.find({ familyId }).select("_id name").lean();
    const results: DigestGenerationResult[] = [];

    for (const member of members) {
      try {
        const result = await this.generateAndStoreDigest(
          member._id.toString(),
          familyId,
          (member.name as string) || "Family member"
        );
        results.push(result);
      } catch (err) {
        logDigest("family member digest failed", {
          familyId,
          memberId: member._id.toString(),
          error: err instanceof Error ? err.message : "unknown"
        });
      }
    }

    return results;
  }

  /**
   * Batch generates digests across ALL families. Called by weekly cron.
   */
  async runScheduledDigestGeneration(): Promise<{
    familiesProcessed: number;
    digestsCreated: number;
  }> {
    // Get distinct family IDs from family members
    const familyIds: string[] = await FamilyMemberModel.distinct("familyId");

    let digestsCreated = 0;

    for (const familyId of familyIds) {
      try {
        const results = await this.generateAllDigestsForFamily(familyId);
        digestsCreated += results.filter((r) => r.status === "CREATED").length;
      } catch (err) {
        logDigest("family digest batch failed", {
          familyId,
          error: err instanceof Error ? err.message : "unknown"
        });
      }
    }

    logDigest("scheduled generation complete", {
      familiesProcessed: familyIds.length,
      digestsCreated
    });

    return { familiesProcessed: familyIds.length, digestsCreated };
  }

  /**
   * List digests for a profile.
   */
  async getDigestsForProfile(
    profileId: string,
    opts?: { limit?: number }
  ): Promise<WeeklyHealthDigest[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 12, 1), 52);
    const docs = await WeeklyHealthDigestModel.find({ profileId })
      .sort({ generatedAt: -1 })
      .limit(limit)
      .lean();

    return docs.map(mapDigestDoc);
  }

  /**
   * Get the most recent digest for a profile.
   */
  async getLatestDigestForProfile(
    profileId: string
  ): Promise<WeeklyHealthDigest | null> {
    const doc = await WeeklyHealthDigestModel.findOne({ profileId })
      .sort({ generatedAt: -1 })
      .lean();

    if (!doc) return null;
    return mapDigestDoc(doc);
  }

  /**
   * List digests for an entire family.
   */
  async getDigestsForFamily(
    familyId: string,
    opts?: { limit?: number }
  ): Promise<WeeklyHealthDigest[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
    const docs = await WeeklyHealthDigestModel.find({ familyId })
      .sort({ periodStart: -1 })
      .limit(limit)
      .lean();

    return docs.map(mapDigestDoc);
  }
}

function mapDigestDoc(doc: Record<string, unknown> & { _id: { toString(): string } }): WeeklyHealthDigest {
  return {
    digestId: doc._id.toString(),
    profileId: doc.profileId as string,
    familyId: doc.familyId as string,
    digestType: doc.digestType as WeeklyHealthDigest["digestType"],
    periodStart: (doc.periodStart as Date).toISOString(),
    periodEnd: (doc.periodEnd as Date).toISOString(),
    summaryTitle: doc.summaryTitle as string,
    summaryText: doc.summaryText as string,
    keyObservations: (doc.keyObservations || []) as WeeklyHealthDigest["keyObservations"],
    relatedPatterns: (doc.relatedPatterns || []) as string[],
    supportingEvidenceIds: (doc.supportingEvidenceIds || []) as string[],
    generatedAt: (doc.generatedAt as Date).toISOString()
  };
}

export const digestService = new DigestService();
