import type { FamilyMember, HealthLog, Insight } from "./types.js";

export type ReengagementPrompt = {
  id: string;
  familyId: string;
  memberId: string;
  triggerType: "inactive_logging" | "recurring_unresolved" | "no_followup_after_trend";
  prompt: string;
  reason: string;
  severity: "info" | "warning";
  createdAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
}

function latestLogAt(logs: HealthLog[]): number | null {
  if (!logs.length) return null;
  return Math.max(...logs.map((l) => new Date(l.occurredAt).getTime()));
}

function topRecurringKeyword(insights: Insight[]): string | null {
  const recurring = insights
    .filter((ins) => ins.count >= 3 && (ins.type === "frequency" || ins.type === "trend"))
    .sort((a, b) => b.count - a.count)[0];
  return recurring?.keyword || null;
}

function latestSignificantTrend(insights: Insight[]): Insight | null {
  const significant = insights
    .filter((ins) => ins.type === "trend" || ins.type === "anomaly" || ins.priority === "high")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return significant[0] || null;
}

export function buildContextualReengagementPrompts(input: {
  familyId: string;
  members: FamilyMember[];
  logs: HealthLog[];
  insights: Insight[];
  now?: Date;
}): ReengagementPrompt[] {
  const now = input.now || new Date();
  const nowMs = now.getTime();
  const prompts: ReengagementPrompt[] = [];

  for (const member of input.members) {
    const memberLogs = input.logs.filter((l) => l.memberId === member.id);
    const memberInsights = input.insights.filter((i) => i.memberId === member.id);
    const latestAt = latestLogAt(memberLogs);

    if (!latestAt || nowMs - latestAt >= 5 * DAY_MS) {
      prompts.push({
        id: `reengage-${member.id}-inactive-${Math.floor(nowMs / DAY_MS)}`,
        familyId: input.familyId,
        memberId: member.id,
        triggerType: "inactive_logging",
        prompt: `No updates logged recently for ${member.name}. Has anything changed since the last note?`,
        reason: "No logs for 5+ days",
        severity: "info",
        createdAt: now.toISOString()
      });
    }

    const recurringKeyword = topRecurringKeyword(memberInsights);
    if (recurringKeyword) {
      prompts.push({
        id: `reengage-${member.id}-recurring-${slug(recurringKeyword)}`,
        familyId: input.familyId,
        memberId: member.id,
        triggerType: "recurring_unresolved",
        prompt: `${recurringKeyword[0].toUpperCase()}${recurringKeyword.slice(1)}-related issues appeared repeatedly. Any improvement since then?`,
        reason: "Unresolved recurring symptoms detected",
        severity: "warning",
        createdAt: now.toISOString()
      });
    }

    const significantTrend = latestSignificantTrend(memberInsights);
    if (significantTrend) {
      const trendAt = new Date(significantTrend.createdAt).getTime();
      const hasFollowupLogs = memberLogs.some((l) => new Date(l.occurredAt).getTime() > trendAt);
      if (!hasFollowupLogs && nowMs - trendAt >= 2 * DAY_MS) {
        prompts.push({
          id: `reengage-${member.id}-trend-${slug(significantTrend.keyword || significantTrend.title)}`,
          familyId: input.familyId,
          memberId: member.id,
          triggerType: "no_followup_after_trend",
          prompt: `A notable trend was detected for ${member.name} (${significantTrend.keyword || "recent symptom pattern"}). Could you share a quick update since then?`,
          reason: "No updates after significant trend",
          severity: "warning",
          createdAt: now.toISOString()
        });
      }
    }
  }

  const deduped = new Map<string, ReengagementPrompt>();
  for (const prompt of prompts) {
    const key = `${prompt.memberId}:${prompt.triggerType}`;
    if (!deduped.has(key)) deduped.set(key, prompt);
  }
  return [...deduped.values()];
}
