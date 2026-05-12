import type { HealthLog, Insight, WeeklyDigest } from "../types.js";
import type { TimelineNarrativeEvent } from "../timeline-narrative.js";
import type { DoctorSummaryRedFlagEvent } from "./types.js";

export function collectEvidenceLogIds(input: {
  windowLogs: HealthLog[];
  memberInsights: Insight[];
  timelineEvents: TimelineNarrativeEvent[];
  weeklyDigests: WeeklyDigest[];
  redFlags: DoctorSummaryRedFlagEvent[];
}): string[] {
  const ids = new Set<string>();
  for (const log of input.windowLogs) {
    ids.add(log.id);
  }
  for (const ins of input.memberInsights) {
    for (const id of ins.evidenceLogIds || []) if (id) ids.add(id);
    for (const id of ins.sourceLogIds || []) if (id) ids.add(id);
  }
  for (const ev of input.timelineEvents) {
    for (const id of ev.sourceLogIds || []) ids.add(id);
  }
  for (const d of input.weeklyDigests) {
    for (const id of d.sourceLogIds || []) if (id) ids.add(id);
    for (const h of d.highlights || []) {
      for (const id of h.evidenceLogIds || []) if (id) ids.add(id);
    }
  }
  for (const rf of input.redFlags) {
    for (const id of rf.evidenceLogIds) if (id) ids.add(id);
  }
  return [...ids].sort();
}
