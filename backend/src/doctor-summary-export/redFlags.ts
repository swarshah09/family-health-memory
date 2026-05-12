import type { Insight } from "../types.js";
import type { DoctorSummaryRedFlagEvent } from "./types.js";

export function extractRedFlagEventsForWindow(
  insights: Insight[],
  rangeStartMs: number,
  rangeEndMs: number
): DoctorSummaryRedFlagEvent[] {
  return insights
    .filter((ins) => ins.type === "red_flag")
    .filter((ins) => {
      const ts = new Date(ins.createdAt).getTime();
      return ts >= rangeStartMs && ts <= rangeEndMs;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12)
    .map((ins) => ({
      title: ins.title,
      description: ins.summary || ins.description,
      observedAt: ins.createdAt,
      priority: ins.priority,
      evidenceLogIds: [...new Set([...(ins.evidenceLogIds || []), ...(ins.sourceLogIds || [])])].filter(Boolean)
    }));
}
