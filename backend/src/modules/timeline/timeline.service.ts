import type { HealthMemoryRecord } from "../health-memory/health-memory.types.js";
import { TimelineEventModel } from "./models/timeline-event.model.js";
import { ContextualEpisodeModel } from "./models/contextual-episode.model.js";
import { SymptomContextModel } from "./models/symptom-context.model.js";
import { buildTimelineEvent } from "./timeline-builder.js";
import {
  updateEpisodesForEvent,
  updateSymptomContext,
  markStaleEpisodes
} from "./timeline-context.service.js";
import type {
  TimelineEvent,
  ContextualEpisode,
  SymptomContext,
  TimelineProcessResult
} from "./timeline.types.js";

function logTimeline(msg: string, fields: Record<string, unknown>): void {
  console.info(`[timeline] ${msg}`, { scope: "timeline", ...fields });
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
 * Timeline Service — transforms health memory records into chronological
 * timeline events with contextual episode grouping and symptom tracking.
 *
 * Isolated from diagnosis, recommendations, alerts, and care guidance.
 */
export class TimelineService {
  /**
   * Processes a health memory record into the timeline system.
   * 1. Build normalized event → 2. Persist → 3. Episode grouping → 4. Symptom context → 5. Stale cleanup
   */
  async processMemoryRecord(record: HealthMemoryRecord): Promise<TimelineProcessResult> {
    // Duplicate guard
    const existing = await TimelineEventModel.findOne({
      sourceMemoryId: record.memoryId
    })
      .select("_id")
      .lean();

    if (existing) {
      return {
        timelineEventId: existing._id.toString(),
        status: "SKIPPED_DUPLICATE",
        episodesUpdated: 0,
        symptomsTracked: 0
      };
    }

    const eventData = buildTimelineEvent(record);

    // Persist timeline event
    let doc;
    try {
      doc = await TimelineEventModel.create(eventData);
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return {
          timelineEventId: null,
          status: "SKIPPED_DUPLICATE",
          episodesUpdated: 0,
          symptomsTracked: 0
        };
      }
      throw err;
    }

    const eventId = doc._id.toString();

    // Episode grouping + symptom context
    const eventInput = {
      timelineEventId: eventId,
      profileId: record.profileId,
      familyId: record.familyId,
      eventDate: new Date(record.createdAt),
      symptoms: eventData.symptoms,
      severity: record.severity,
      createdByUserId: record.createdByUserId
    };

    const episodesUpdated = await updateEpisodesForEvent(eventInput);
    const symptomsTracked = await updateSymptomContext(eventInput);

    // Lightweight stale cleanup (non-critical)
    markStaleEpisodes(record.profileId).catch(() => {});

    logTimeline("processed", {
      memoryId: record.memoryId,
      eventId,
      symptoms: eventData.symptoms.length,
      episodes: episodesUpdated
    });

    return {
      timelineEventId: eventId,
      status: "CREATED",
      episodesUpdated,
      symptomsTracked
    };
  }

  /**
   * Returns chronological timeline events for a profile.
   */
  async getTimeline(
    profileId: string,
    opts?: { limit?: number; since?: Date; until?: Date }
  ): Promise<TimelineEvent[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 1000);
    const filter: Record<string, unknown> = { profileId };
    if (opts?.since || opts?.until) {
      const range: Record<string, Date> = {};
      if (opts.since) range.$gte = opts.since;
      if (opts.until) range.$lte = opts.until;
      filter.eventDate = range;
    }

    const docs = await TimelineEventModel.find(filter)
      .sort({ eventDate: -1 })
      .limit(limit)
      .lean();

    return docs.map((d) => ({
      timelineEventId: d._id.toString(),
      profileId: d.profileId,
      familyId: d.familyId,
      sourceMemoryId: d.sourceMemoryId,
      eventType: d.eventType as TimelineEvent["eventType"],
      eventDate: d.eventDate.toISOString(),
      symptoms: (d.symptoms as string[]) || [],
      medications: (d.medications as string[]) || [],
      severity: (d.severity as TimelineEvent["severity"]) ?? null,
      createdByUserId: d.createdByUserId,
      sourceType: d.sourceType as TimelineEvent["sourceType"],
      createdAt: d.createdAt?.toISOString() || new Date().toISOString()
    }));
  }

  /**
   * Returns active contextual episodes for a profile.
   */
  async getActiveEpisodes(profileId: string): Promise<ContextualEpisode[]> {
    const docs = await ContextualEpisodeModel.find({
      profileId,
      status: "ACTIVE"
    })
      .sort({ lastOccurrence: -1 })
      .lean();

    return docs.map((d) => ({
      episodeId: d._id.toString(),
      profileId: d.profileId,
      familyId: d.familyId,
      primarySymptom: d.primarySymptom,
      relatedSymptoms: (d.relatedSymptoms as string[]) || [],
      eventIds: (d.eventIds as string[]) || [],
      observationCount: d.observationCount,
      firstOccurrence: d.firstOccurrence.toISOString(),
      lastOccurrence: d.lastOccurrence.toISOString(),
      latestSeverity: (d.latestSeverity as ContextualEpisode["latestSeverity"]) ?? null,
      status: d.status as ContextualEpisode["status"]
    }));
  }

  /**
   * Returns all tracked symptom contexts for a profile.
   */
  async getSymptomContext(profileId: string): Promise<SymptomContext[]> {
    const docs = await SymptomContextModel.find({ profileId })
      .sort({ lastSeenAt: -1 })
      .lean();

    return docs.map((d) => ({
      profileId: d.profileId,
      familyId: d.familyId,
      symptom: d.symptom,
      totalOccurrences: d.totalOccurrences,
      firstSeenAt: d.firstSeenAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
      latestSeverity: (d.latestSeverity as SymptomContext["latestSeverity"]) ?? null,
      observerUserIds: (d.observerUserIds as string[]) || []
    }));
  }

  /**
   * Lightweight summary for downstream consumers (digest, pattern engine, AI).
   */
  async getTimelineSummaryForProfile(
    profileId: string
  ): Promise<{
    totalEvents: number;
    activeEpisodes: number;
    uniqueSymptoms: number;
    latestEventDate: string | null;
  }> {
    const [totalEvents, activeEpisodes, symptomDocs] = await Promise.all([
      TimelineEventModel.countDocuments({ profileId }),
      ContextualEpisodeModel.countDocuments({ profileId, status: "ACTIVE" }),
      SymptomContextModel.find({ profileId }).select("symptom").lean()
    ]);

    const latestEvent = await TimelineEventModel.findOne({ profileId })
      .sort({ eventDate: -1 })
      .select("eventDate")
      .lean();

    return {
      totalEvents,
      activeEpisodes,
      uniqueSymptoms: symptomDocs.length,
      latestEventDate: latestEvent?.eventDate?.toISOString() || null
    };
  }
}

export const timelineService = new TimelineService();
