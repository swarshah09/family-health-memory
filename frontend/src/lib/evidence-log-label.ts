import { format, isValid } from "date-fns";

/** Log fields needed to show human-readable evidence links (avoid raw Mongo IDs in UI). */
export type EvidenceLogLike = {
  id: string;
  memberId: string;
  timestamp: string;
  text: string;
  transcript?: string;
};

function findLog(logId: string, memberId: string | undefined, logs: EvidenceLogLike[]): EvidenceLogLike | undefined {
  return logs.find((l) => l.id === logId && (!memberId || l.memberId === memberId));
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const n = Math.max(4, max - 1);
  return `${s.slice(0, n)}…`;
}

export function evidenceLogShortDate(iso: string): string {
  const d = new Date(iso);
  return isValid(d) ? format(d, "MMM d") : "Note";
}

/**
 * Short label for buttons/chips: snippet, else "Mon 12 · first words…", else "View note".
 */
export function formatEvidenceLogLabel(
  logId: string,
  logs: EvidenceLogLike[],
  options?: { memberId?: string; snippet?: string | null; maxLen?: number }
): string {
  const maxLen = options?.maxLen ?? 64;
  const snippet = options?.snippet?.trim();
  const log = findLog(logId, options?.memberId, logs);

  if (snippet && log) {
    const dateStr = evidenceLogShortDate(log.timestamp);
    const sep = " — ";
    const budget = maxLen - dateStr.length - sep.length;
    if (budget < 12) return truncate(oneLine(snippet), maxLen);
    return `${dateStr}${sep}${truncate(oneLine(snippet), budget)}`;
  }
  if (snippet) {
    return truncate(oneLine(snippet), maxLen);
  }
  if (!log) return "View note";
  const dateStr = evidenceLogShortDate(log.timestamp);
  const body = oneLine([log.text, log.transcript].filter(Boolean).join(" "));
  const sep = " · ";
  const budget = maxLen - dateStr.length - sep.length;
  if (budget < 8) return dateStr;
  return `${dateStr}${sep}${truncate(body, budget)}`;
}
