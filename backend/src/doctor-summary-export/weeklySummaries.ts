import type { WeeklyDigest } from "../types.js";
import type { DoctorSummaryWeeklyBlock } from "./types.js";

function digestEvidenceIds(d: WeeklyDigest): string[] {
  const ids = new Set<string>();
  for (const id of d.sourceLogIds || []) {
    if (id) ids.add(id);
  }
  for (const h of d.highlights || []) {
    for (const id of h.evidenceLogIds || []) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Overlapping digest weeks for the covered range; dedupes by calendar week start (keeps latest generated).
 */
export function buildWeeklySummaryBlocks(
  digests: WeeklyDigest[],
  rangeStartMs: number,
  rangeEndMs: number
): DoctorSummaryWeeklyBlock[] {
  const overlapping = digests.filter((d) => {
    if (!d.weekStart || !d.weekEnd) return false;
    const ws = new Date(d.weekStart).getTime();
    const we = new Date(d.weekEnd).getTime();
    return we >= rangeStartMs && ws <= rangeEndMs;
  });

  const byWeekStart = new Map<string, WeeklyDigest>();
  for (const d of overlapping) {
    const key = d.weekStart!;
    const prev = byWeekStart.get(key);
    if (!prev || new Date(d.generatedAt).getTime() > new Date(prev.generatedAt).getTime()) {
      byWeekStart.set(key, d);
    }
  }

  return [...byWeekStart.values()]
    .sort((a, b) => new Date(a.weekStart!).getTime() - new Date(b.weekStart!).getTime())
    .map((d) => {
      const start = new Date(d.weekStart!);
      const end = new Date(d.weekEnd!);
      const weekLabel = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
      return {
        weekLabel,
        weekStart: d.weekStart!,
        weekEnd: d.weekEnd!,
        generatedAt: d.generatedAt,
        summary: d.summary,
        highlightTitles: (d.highlights || []).map((h) => h.title),
        evidenceLogIds: digestEvidenceIds(d)
      };
    });
}
