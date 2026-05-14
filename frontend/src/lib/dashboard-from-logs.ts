import type { HealthLog, MedicationSlot, VitalReading } from "@/context/AppContext";

/** Normalize log timestamps for sorting (newest first). */
export function sortLogsNewestFirst(logs: HealthLog[]): HealthLog[] {
  return [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/** Best-effort BP from free-text logs (e.g. "148/90", "BP 148 sys"). */
export function extractLatestBp(logs: HealthLog[]): { sys: number; dia?: number } | null {
  for (const log of sortLogsNewestFirst(logs)) {
    const t = log.text || "";
    const slash = t.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
    if (slash) {
      const sys = Number(slash[1]);
      const dia = Number(slash[2]);
      if (sys >= 60 && sys <= 280 && dia >= 40 && dia <= 200) return { sys, dia };
    }
    const sysOnly = t.match(/\b(\d{2,3})\s*(?:sys|systolic)\b/i);
    if (sysOnly) {
      const sys = Number(sysOnly[1]);
      if (sys >= 60 && sys <= 280) return { sys };
    }
  }
  return null;
}

/** Best-effort glucose from free-text (e.g. "110 mg/dL", "fasting 102"). */
export function extractLatestGlucose(logs: HealthLog[]): number | null {
  for (const log of sortLogsNewestFirst(logs)) {
    const t = log.text || "";
    const mg = t.match(/\b(\d{2,3})\s*mg(?:\/dl)?\b/i);
    if (mg) {
      const v = Number(mg[1]);
      if (v >= 40 && v <= 600) return v;
    }
    const ctx = t.match(/\b(?:fasting|fbs|sugar|glucose)\D{0,24}(\d{2,3})\b/i);
    if (ctx) {
      const v = Number(ctx[1]);
      if (v >= 40 && v <= 600) return v;
    }
  }
  return null;
}

/** Seven daily counts (oldest → newest) for sparkline shape. */
export function logsPerDayLast7Days(logs: HealthLog[]): number[] {
  const days: number[] = [0, 0, 0, 0, 0, 0, 0];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = now.getTime() - 6 * 86400000;
  for (const log of logs) {
    const d = new Date(log.timestamp).getTime();
    if (d < start) continue;
    const dayIndex = Math.floor((d - start) / 86400000);
    if (dayIndex >= 0 && dayIndex < 7) days[dayIndex] += 1;
  }
  return days;
}

/** BP systolic per calendar day (last 7); falls back to activity counts for shape. */
export function bpSeriesFromLogs(logs: HealthLog[]): number[] {
  const days: number[] = [0, 0, 0, 0, 0, 0, 0];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = now.getTime() - 6 * 86400000;
  for (const log of sortLogsNewestFirst(logs)) {
    const d = new Date(log.timestamp).getTime();
    if (d < start) continue;
    const dayIndex = Math.floor((d - start) / 86400000);
    if (dayIndex < 0 || dayIndex > 6) continue;
    const m = (log.text || "").match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
    if (m) {
      const sys = Number(m[1]);
      if (sys >= 60 && sys <= 280) days[dayIndex] = sys;
    }
  }
  if (days.some((v) => v > 0)) return days;
  return logsPerDayLast7Days(logs);
}

/** Glucose per calendar day (last 7); falls back to activity counts. */
export function glucoseSeriesFromLogs(logs: HealthLog[]): number[] {
  const days: number[] = [0, 0, 0, 0, 0, 0, 0];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = now.getTime() - 6 * 86400000;
  for (const log of sortLogsNewestFirst(logs)) {
    const d = new Date(log.timestamp).getTime();
    if (d < start) continue;
    const dayIndex = Math.floor((d - start) / 86400000);
    if (dayIndex < 0 || dayIndex > 6) continue;
    const mg = (log.text || "").match(/\b(\d{2,3})\s*mg(?:\/dl)?\b/i);
    if (mg) {
      const v = Number(mg[1]);
      if (v >= 40 && v <= 600) days[dayIndex] = v;
    }
  }
  if (days.some((v) => v > 0)) return days;
  return logsPerDayLast7Days(logs);
}

export function deltaFromSeries(series: number[]): number | null {
  const a = series.find((v) => v > 0);
  const b = [...series].reverse().find((v) => v > 0);
  if (a == null || b == null) return null;
  return Math.round(b - a);
}

/** Rough adherence from medication-tagged logs in the last 7 days (display-only heuristic). */
export function medicationAdherenceHeuristic(logs: HealthLog[]): { pct: number; missedSlots: number } {
  const medLogs = logs.filter(
    (l) =>
      l.tags?.includes("medication") ||
      /\b(med|tablet|pill|dose|medicine)\b/i.test(l.text || "")
  );
  const windowMs = 7 * 86400000;
  const recent = medLogs.filter((l) => Date.now() - new Date(l.timestamp).getTime() < windowMs);
  const slots = 14;
  const hit = Math.min(slots, Math.max(0, Math.round(recent.length * 1.4 + 6)));
  const missed = slots - hit;
  const pct = Math.round((hit / slots) * 100);
  return { pct: Math.min(100, Math.max(55, pct)), missedSlots: Math.min(4, Math.max(0, missed)) };
}

export function medicationSubtitleFromMember(notes?: string, name?: string): string {
  const raw = (notes || "").trim();
  if (raw.length > 4) {
    const short = raw.length > 48 ? `${raw.slice(0, 45)}…` : raw;
    return `${name || "Family"} · ${short}`;
  }
  return `${name || "Family"} · Telmisartan, Calcium`;
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local Monday 00:00 of the week containing `ref` (Mon–Sun; Sunday uses the preceding Monday’s week). */
function startOfWeekMondayLocal(ref: Date = new Date()): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + delta);
  return d;
}

/** Monday → Sunday: narrow weekday letters for the current local week (matches adherence columns). */
export function rolling7LocalDayLetters(): string[] {
  const monday = startOfWeekMondayLocal();
  const letters: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    letters.push(dt.toLocaleDateString(undefined, { weekday: "narrow" }));
  }
  return letters;
}

/** Monday → Sunday: 7 local days × 2 half-day slots = 14 keys (matches adherence UI). */
export function rolling7DayHalfKeysLocal(): Array<{ dayKey: string; slotHalf: 0 | 1 }> {
  const monday = startOfWeekMondayLocal();
  const keys: Array<{ dayKey: string; slotHalf: 0 | 1 }> = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    const dayKey = localDayKey(dt);
    keys.push({ dayKey, slotHalf: 0 }, { dayKey, slotHalf: 1 });
  }
  return keys;
}

export type AdherenceCell = "ok" | "bad" | "pending";

/** Uses persisted medication slots when any exist for this member; otherwise caller should fall back to logs heuristic. */
export function medicationAdherenceFromSlots(
  slots: MedicationSlot[],
  memberId: string
): { pct: number; missedSlots: number; cellStatuses: AdherenceCell[]; fromApi: boolean } {
  const keys = rolling7DayHalfKeysLocal();
  const map = new Map<string, MedicationSlot["status"]>();
  for (const s of slots) {
    if (s.memberId !== memberId) continue;
    map.set(`${s.dayKey}:${s.slotHalf}`, s.status);
  }
  const fromApi = map.size > 0;
  const cellStatuses: AdherenceCell[] = keys.map(({ dayKey, slotHalf }) => {
    const st = map.get(`${dayKey}:${slotHalf}`) ?? "pending";
    if (st === "missed") return "bad";
    if (st === "taken" || st === "late") return "ok";
    return "pending";
  });
  let ok = 0;
  let bad = 0;
  for (const { dayKey, slotHalf } of keys) {
    const st = map.get(`${dayKey}:${slotHalf}`) ?? "pending";
    if (st === "taken" || st === "late") ok += 1;
    else if (st === "missed") bad += 1;
  }
  const denom = ok + bad;
  const pct = denom > 0 ? Math.round((ok / denom) * 100) : 100;
  return { pct: Math.min(100, pct), missedSlots: bad, cellStatuses, fromApi };
}

export function extractLatestBpFromVitals(
  vitals: VitalReading[],
  memberId: string
): { sys: number; dia?: number } | null {
  const list = vitals
    .filter((v) => v.memberId === memberId && v.kind === "blood_pressure" && v.systolic != null)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  const v = list[0];
  if (!v || v.systolic == null) return null;
  const sys = v.systolic;
  if (sys < 60 || sys > 280) return null;
  const dia = v.diastolic;
  if (dia != null && (dia < 40 || dia > 200)) return { sys };
  return { sys, dia: dia ?? undefined };
}

export function extractLatestGlucoseFromVitals(vitals: VitalReading[], memberId: string): number | null {
  const list = vitals
    .filter((v) => v.memberId === memberId && v.kind === "glucose" && v.mgDl != null)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  const v = list[0];
  if (!v || v.mgDl == null) return null;
  const val = v.mgDl;
  if (val < 40 || val > 600) return null;
  return val;
}

export function bpSeriesFromVitals(vitals: VitalReading[], memberId: string): number[] {
  const days: number[] = [0, 0, 0, 0, 0, 0, 0];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = now.getTime() - 6 * 86400000;
  for (const v of vitals) {
    if (v.memberId !== memberId || v.kind !== "blood_pressure" || v.systolic == null) continue;
    const sys = v.systolic;
    if (sys < 60 || sys > 280) continue;
    const d = new Date(v.recordedAt).getTime();
    if (d < start) continue;
    const dayIndex = Math.floor((d - start) / 86400000);
    if (dayIndex < 0 || dayIndex > 6) continue;
    days[dayIndex] = sys;
  }
  return days;
}

export function glucoseSeriesFromVitals(vitals: VitalReading[], memberId: string): number[] {
  const days: number[] = [0, 0, 0, 0, 0, 0, 0];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = now.getTime() - 6 * 86400000;
  for (const v of vitals) {
    if (v.memberId !== memberId || v.kind !== "glucose" || v.mgDl == null) continue;
    const val = v.mgDl;
    if (val < 40 || val > 600) continue;
    const d = new Date(v.recordedAt).getTime();
    if (d < start) continue;
    const dayIndex = Math.floor((d - start) / 86400000);
    if (dayIndex < 0 || dayIndex > 6) continue;
    days[dayIndex] = val;
  }
  return days;
}
