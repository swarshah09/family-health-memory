import { timelineService } from "../timeline/index.js";
import { DetectedPatternModel } from "./models/detected-pattern.model.js";
import {
  detectRecurringSymptoms,
  detectPersistentObservations,
  detectFrequencyIncrease,
  detectCaregiverPatterns
} from "./recurrence-detector.js";
import { detectSymptomClusters } from "./symptom-clustering.js";
import { scorePattern, isAboveThreshold } from "./pattern-scoring.js";
import type {
  DetectedPattern,
  CandidatePattern,
  PatternAnalysisResult
} from "./pattern.types.js";
import { PATTERN_STALE_DAYS } from "./pattern.types.js";

function logPattern(msg: string, fields: Record<string, unknown>): void {
  console.info(`[pattern-engine] ${msg}`, { scope: "pattern-engine", ...fields });
}

/**
 * Pattern Engine Service — detects recurring health observation patterns
 * from timeline events and symptom context data.
 *
 * Safety: identifies observable recurrence only.
 * Never diagnoses, predicts disease, or suggests treatment.
 */
export class PatternEngineService {
  /**
   * Analyzes a profile for all pattern types.
   * 1. Load symptom contexts + recent events
   * 2. Run all detectors
   * 3. Score each candidate
   * 4. Upsert passing patterns
   * 5. Mark stale patterns
   */
  async analyzeProfile(
    profileId: string,
    familyId: string
  ): Promise<PatternAnalysisResult> {
    const [symptomContexts, events] = await Promise.all([
      timelineService.getSymptomContext(profileId),
      timelineService.getTimeline(profileId, { limit: 500 })
    ]);

    if (events.length === 0) {
      return { profileId, patternsCreated: 0, patternsUpdated: 0, patternsStaled: 0 };
    }

    // Run all detectors
    const allCandidates: CandidatePattern[] = [
      ...detectRecurringSymptoms(symptomContexts, events),
      ...detectPersistentObservations(symptomContexts, events),
      ...detectFrequencyIncrease(events),
      ...detectCaregiverPatterns(symptomContexts),
      ...detectSymptomClusters(events)
    ];

    // Score and filter
    const passing = allCandidates
      .map((c) => ({ candidate: c, confidence: scorePattern(c) }))
      .filter(({ confidence }) => isAboveThreshold(confidence));

    // Upsert patterns
    let created = 0;
    let updated = 0;

    for (const { candidate, confidence } of passing) {
      const sortedSymptoms = [...candidate.relatedSymptoms].sort();
      const existing = await DetectedPatternModel.findOne({
        profileId,
        patternType: candidate.patternType,
        relatedSymptoms: sortedSymptoms,
        status: "ACTIVE"
      });

      if (existing) {
        await DetectedPatternModel.updateOne(
          { _id: existing._id },
          {
            $set: {
              occurrenceCount: candidate.occurrenceCount,
              latestOccurrence: candidate.latestOccurrence,
              confidence,
              supportingTimelineEventIds: candidate.supportingTimelineEventIds
            }
          }
        );
        updated++;
      } else {
        await DetectedPatternModel.create({
          profileId,
          familyId,
          patternType: candidate.patternType,
          relatedSymptoms: sortedSymptoms,
          occurrenceCount: candidate.occurrenceCount,
          firstOccurrence: candidate.firstOccurrence,
          latestOccurrence: candidate.latestOccurrence,
          confidence,
          supportingTimelineEventIds: candidate.supportingTimelineEventIds,
          status: "ACTIVE"
        });
        created++;
      }
    }

    // Mark stale patterns
    const staleCutoff = new Date(Date.now() - PATTERN_STALE_DAYS * 24 * 60 * 60 * 1000);
    const staleResult = await DetectedPatternModel.updateMany(
      {
        profileId,
        status: "ACTIVE",
        latestOccurrence: { $lt: staleCutoff }
      },
      { $set: { status: "STALE" } }
    );

    logPattern("analyzed", {
      profileId,
      candidates: allCandidates.length,
      passing: passing.length,
      created,
      updated,
      staled: staleResult.modifiedCount
    });

    return {
      profileId,
      patternsCreated: created,
      patternsUpdated: updated,
      patternsStaled: staleResult.modifiedCount
    };
  }

  /**
   * Returns active patterns for a profile.
   */
  async getActivePatterns(profileId: string): Promise<DetectedPattern[]> {
    const docs = await DetectedPatternModel.find({
      profileId,
      status: "ACTIVE"
    })
      .sort({ latestOccurrence: -1 })
      .lean();

    return docs.map(mapPatternDoc);
  }

  /**
   * Returns active patterns for an entire family.
   */
  async getPatternsForFamily(familyId: string): Promise<DetectedPattern[]> {
    const docs = await DetectedPatternModel.find({
      familyId,
      status: "ACTIVE"
    })
      .sort({ latestOccurrence: -1 })
      .lean();

    return docs.map(mapPatternDoc);
  }

  /**
   * Returns a single pattern by ID with full evidence chain.
   */
  async getPatternById(patternId: string): Promise<DetectedPattern | null> {
    const doc = await DetectedPatternModel.findById(patternId).lean();
    if (!doc) return null;
    return mapPatternDoc(doc);
  }
}

function mapPatternDoc(doc: {
  _id: { toString(): string };
  profileId: string;
  familyId: string;
  patternType: string;
  relatedSymptoms: string[];
  occurrenceCount: number;
  firstOccurrence: Date;
  latestOccurrence: Date;
  confidence: number;
  supportingTimelineEventIds: string[];
  status: string;
  createdAt?: Date;
}): DetectedPattern {
  return {
    patternId: doc._id.toString(),
    profileId: doc.profileId,
    familyId: doc.familyId,
    patternType: doc.patternType as DetectedPattern["patternType"],
    relatedSymptoms: doc.relatedSymptoms || [],
    occurrenceCount: doc.occurrenceCount,
    firstOccurrence: doc.firstOccurrence.toISOString(),
    latestOccurrence: doc.latestOccurrence.toISOString(),
    confidence: doc.confidence,
    supportingTimelineEventIds: doc.supportingTimelineEventIds || [],
    status: doc.status as DetectedPattern["status"],
    createdAt: doc.createdAt?.toISOString() || new Date().toISOString()
  };
}

export const patternEngineService = new PatternEngineService();
