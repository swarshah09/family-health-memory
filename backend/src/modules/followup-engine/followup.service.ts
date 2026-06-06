import { FamilyMemberModel } from "../../models.js";
import { timelineService } from "../timeline/index.js";
import { patternEngineService } from "../pattern-engine/index.js";
import { FollowupPromptModel } from "./models/followup-prompt.model.js";
import { evaluateTriggers } from "./contextual-trigger.service.js";
import { generatePromptText } from "./followup-generator.js";
import type {
  FollowupPrompt,
  FollowupGenerationResult,
  FollowupType
} from "./followup.types.js";
import { FOLLOWUP_COOLDOWN_HOURS, FOLLOWUP_EXPIRY_DAYS } from "./followup.types.js";

function logFollowup(msg: string, fields: Record<string, unknown>): void {
  console.info(`[followup-engine] ${msg}`, { scope: "followup-engine", ...fields });
}

/**
 * Follow-up Intelligence Service — generates calm, contextual follow-up
 * prompts based on health patterns and recent observations.
 *
 * Tone: calm, caring, lightweight.
 * Safety: never diagnoses, recommends medication, implies emergencies, or pressures users.
 */
export class FollowupService {
  /**
   * Generates follow-ups for a single profile.
   * 1. Load patterns + symptom context + recent events + existing pending
   * 2. Evaluate triggers (with cooldown/capacity guards)
   * 3. Generate prompt text
   * 4. Persist
   */
  async generateFollowups(
    profileId: string,
    familyId: string
  ): Promise<FollowupGenerationResult> {
    const [patterns, symptomContexts, recentEvents, pendingDocs] = await Promise.all([
      patternEngineService.getActivePatterns(profileId),
      timelineService.getSymptomContext(profileId),
      timelineService.getTimeline(profileId, { limit: 50 }),
      FollowupPromptModel.find({ profileId, status: "PENDING" })
        .select("followupType cooldownExpiresAt")
        .lean()
    ]);

    const existingPending = pendingDocs.map((d) => ({
      followupType: d.followupType as FollowupType,
      cooldownExpiresAt: d.cooldownExpiresAt.toISOString()
    }));

    const candidates = evaluateTriggers({
      profileId,
      familyId,
      activePatterns: patterns.map((p) => ({
        patternId: p.patternId,
        patternType: p.patternType,
        relatedSymptoms: p.relatedSymptoms,
        occurrenceCount: p.occurrenceCount,
        latestOccurrence: p.latestOccurrence,
        confidence: p.confidence
      })),
      symptomContexts: symptomContexts.map((s) => ({
        symptom: s.symptom,
        totalOccurrences: s.totalOccurrences,
        lastSeenAt: s.lastSeenAt,
        observerUserIds: s.observerUserIds
      })),
      recentEvents: recentEvents.map((e) => ({
        timelineEventId: e.timelineEventId,
        eventType: e.eventType,
        eventDate: e.eventDate,
        symptoms: e.symptoms,
        medications: e.medications
      })),
      existingPendingFollowups: existingPending
    });

    let created = 0;
    const cooldownExpiry = new Date(
      Date.now() + FOLLOWUP_COOLDOWN_HOURS * 60 * 60 * 1000
    );

    for (const candidate of candidates) {
      const promptText = generatePromptText(candidate);

      await FollowupPromptModel.create({
        profileId: candidate.profileId,
        familyId: candidate.familyId,
        relatedPatternId: candidate.relatedPatternId || null,
        followupType: candidate.followupType,
        generatedPrompt: promptText,
        triggerReason: candidate.triggerReason,
        confidence: candidate.confidence,
        supportingEvidenceIds: candidate.supportingEvidenceIds,
        status: "PENDING",
        cooldownExpiresAt: cooldownExpiry
      });
      created++;
    }

    if (created > 0) {
      logFollowup("generated", { profileId, created, candidates: candidates.length });
    }

    return {
      profileId,
      created,
      skippedCooldown: 0,
      skippedCapacity: 0
    };
  }

  /**
   * Batch generates follow-ups across all families. Called by weekly cron.
   */
  async runScheduledFollowupGeneration(): Promise<{
    profilesProcessed: number;
    followupsCreated: number;
  }> {
    const familyIds: string[] = await FamilyMemberModel.distinct("familyId");
    let profilesProcessed = 0;
    let followupsCreated = 0;

    for (const familyId of familyIds) {
      const members = await FamilyMemberModel.find({ familyId }).select("_id").lean();

      for (const member of members) {
        try {
          const result = await this.generateFollowups(
            member._id.toString(),
            familyId
          );
          profilesProcessed++;
          followupsCreated += result.created;
        } catch (err) {
          logFollowup("profile followup failed", {
            profileId: member._id.toString(),
            error: err instanceof Error ? err.message : "unknown"
          });
        }
      }
    }

    // Expire stale followups as part of the scheduled run
    await this.expireStaleFollowups();

    logFollowup("scheduled generation complete", { profilesProcessed, followupsCreated });

    return { profilesProcessed, followupsCreated };
  }

  /**
   * List pending follow-ups for a profile.
   */
  async getPendingFollowups(profileId: string): Promise<FollowupPrompt[]> {
    const docs = await FollowupPromptModel.find({
      profileId,
      status: "PENDING"
    })
      .sort({ createdAt: -1 })
      .lean();

    return docs.map(mapFollowupDoc);
  }

  /**
   * List pending follow-ups for an entire family.
   */
  async getPendingFollowupsForFamily(familyId: string): Promise<FollowupPrompt[]> {
    const docs = await FollowupPromptModel.find({
      familyId,
      status: "PENDING"
    })
      .sort({ createdAt: -1 })
      .lean();

    return docs.map(mapFollowupDoc);
  }

  /**
   * Dismiss a follow-up (user chose to skip it).
   */
  async dismissFollowup(followupId: string): Promise<void> {
    await FollowupPromptModel.updateOne(
      { _id: followupId, status: "PENDING" },
      { $set: { status: "DISMISSED" } }
    );
  }

  /**
   * Mark a follow-up as delivered (sent to user via notification/WhatsApp).
   */
  async markDelivered(followupId: string): Promise<void> {
    await FollowupPromptModel.updateOne(
      { _id: followupId, status: "PENDING" },
      { $set: { status: "DELIVERED" } }
    );
  }

  /**
   * Expire stale pending follow-ups that are older than FOLLOWUP_EXPIRY_DAYS.
   */
  async expireStaleFollowups(): Promise<number> {
    const cutoff = new Date(
      Date.now() - FOLLOWUP_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );
    const result = await FollowupPromptModel.updateMany(
      { status: "PENDING", createdAt: { $lt: cutoff } },
      { $set: { status: "EXPIRED" } }
    );
    return result.modifiedCount;
  }
}

function mapFollowupDoc(
  doc: Record<string, unknown> & { _id: { toString(): string } }
): FollowupPrompt {
  return {
    followupId: doc._id.toString(),
    profileId: doc.profileId as string,
    familyId: doc.familyId as string,
    relatedPatternId: (doc.relatedPatternId as string) || undefined,
    followupType: doc.followupType as FollowupPrompt["followupType"],
    generatedPrompt: doc.generatedPrompt as string,
    triggerReason: doc.triggerReason as string,
    confidence: doc.confidence as number,
    supportingEvidenceIds: (doc.supportingEvidenceIds || []) as string[],
    status: doc.status as FollowupPrompt["status"],
    cooldownExpiresAt: (doc.cooldownExpiresAt as Date).toISOString(),
    createdAt: (doc.createdAt as Date)?.toISOString() || new Date().toISOString()
  };
}

export const followupService = new FollowupService();
