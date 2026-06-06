import { ContextualEpisodeModel } from "./models/contextual-episode.model.js";
import { SymptomContextModel } from "./models/symptom-context.model.js";
import { EPISODE_PROXIMITY_HOURS, EPISODE_INACTIVE_DAYS } from "./timeline.types.js";

interface EventInput {
  timelineEventId: string;
  profileId: string;
  familyId: string;
  eventDate: Date;
  symptoms: string[];
  severity: "low" | "medium" | "high" | null;
  createdByUserId: string;
}

/**
 * Updates contextual episodes for each symptom in a new timeline event.
 * For each symptom:
 * - If an ACTIVE episode exists within the proximity window → append
 * - Otherwise → create a new episode
 */
export async function updateEpisodesForEvent(event: EventInput): Promise<number> {
  let updated = 0;
  const cutoff = new Date(event.eventDate.getTime() - EPISODE_PROXIMITY_HOURS * 60 * 60 * 1000);

  for (const symptom of event.symptoms) {
    // Try to find an active episode within the proximity window
    const existing = await ContextualEpisodeModel.findOne({
      profileId: event.profileId,
      primarySymptom: symptom,
      status: "ACTIVE",
      lastOccurrence: { $gte: cutoff }
    }).sort({ lastOccurrence: -1 });

    if (existing) {
      // Append to existing episode
      await ContextualEpisodeModel.updateOne(
        { _id: existing._id },
        {
          $push: { eventIds: event.timelineEventId },
          $inc: { observationCount: 1 },
          $set: {
            lastOccurrence: event.eventDate,
            latestSeverity: event.severity
          },
          $addToSet: {
            relatedSymptoms: { $each: event.symptoms.filter((s) => s !== symptom) }
          }
        }
      );
    } else {
      // Create new episode seeded by this event
      await ContextualEpisodeModel.create({
        profileId: event.profileId,
        familyId: event.familyId,
        primarySymptom: symptom,
        relatedSymptoms: event.symptoms.filter((s) => s !== symptom),
        eventIds: [event.timelineEventId],
        observationCount: 1,
        firstOccurrence: event.eventDate,
        lastOccurrence: event.eventDate,
        latestSeverity: event.severity,
        status: "ACTIVE"
      });
    }
    updated++;
  }

  return updated;
}

/**
 * Upserts the symptom context for each symptom in a timeline event.
 * Tracks recurrence count, first/last seen, severity, and observers.
 */
export async function updateSymptomContext(event: EventInput): Promise<number> {
  let tracked = 0;

  for (const symptom of event.symptoms) {
    await SymptomContextModel.updateOne(
      { profileId: event.profileId, symptom },
      {
        $inc: { totalOccurrences: 1 },
        $min: { firstSeenAt: event.eventDate },
        $max: { lastSeenAt: event.eventDate },
        $set: {
          familyId: event.familyId,
          latestSeverity: event.severity
        },
        $addToSet: { observerUserIds: event.createdByUserId }
      },
      { upsert: true }
    );
    tracked++;
  }

  return tracked;
}

/**
 * Marks stale episodes as INACTIVE.
 * Episodes without new events for EPISODE_INACTIVE_DAYS days are considered stale.
 */
export async function markStaleEpisodes(profileId: string): Promise<number> {
  const cutoff = new Date(Date.now() - EPISODE_INACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const result = await ContextualEpisodeModel.updateMany(
    {
      profileId,
      status: "ACTIVE",
      lastOccurrence: { $lt: cutoff }
    },
    { $set: { status: "INACTIVE" } }
  );
  return result.modifiedCount;
}
