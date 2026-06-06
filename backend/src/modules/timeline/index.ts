/**
 * Timeline & Context Engine — transforms health memory records into
 * chronological timelines with contextual episode grouping and
 * symptom recurrence tracking.
 *
 * Pipeline position: memory → **timeline** → pattern engine
 *
 * Isolated from diagnosis, recommendations, alerts, and care guidance.
 */

export { timelineService, TimelineService } from "./timeline.service.js";

export {
  TimelineEventSchema,
  TimelineEventTypeSchema,
  ContextualEpisodeSchema,
  EpisodeStatusSchema,
  SymptomContextSchema,
  EPISODE_PROXIMITY_HOURS,
  EPISODE_INACTIVE_DAYS,
  type TimelineEvent,
  type TimelineEventType,
  type ContextualEpisode,
  type SymptomContext,
  type TimelineProcessResult
} from "./timeline.types.js";

export { buildTimelineEvent, normalizeSymptom } from "./timeline-builder.js";

export {
  updateEpisodesForEvent,
  updateSymptomContext,
  markStaleEpisodes
} from "./timeline-context.service.js";

export { TimelineEventModel } from "./models/timeline-event.model.js";
export { ContextualEpisodeModel } from "./models/contextual-episode.model.js";
export { SymptomContextModel } from "./models/symptom-context.model.js";
