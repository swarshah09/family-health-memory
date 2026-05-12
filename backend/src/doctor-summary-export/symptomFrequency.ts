import type { HealthLog } from "../types.js";

export function computeSymptomFrequencyFromLogs(logs: HealthLog[]): Array<{ symptom: string; count: number }> {
  const counts = new Map<string, number>();
  for (const log of logs) {
    for (const tag of log.tags || []) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([symptom, count]) => ({ symptom, count }));
}
