import { generateGeminiInsights } from "./gemini.js";
import { PrecomputedInsightModel, UserModel, WeeklyDigestModel } from "./models.js";
import { generateInsights } from "./patterns.js";
import {
  listLogs,
  listMembers,
  listTimelineNarrativeEvents,
  listLatestPrecomputedInsightsForFamily,
  listWellnessPulseSessionsForMember
} from "./store.js";
import { Insight } from "./types.js";
import { createWeeklyDigest } from "./weekly-digest.js";

function averageConfidence(insights: Insight[]): number {
  if (!insights.length) return 0;
  const total = insights.reduce((sum, i) => sum + (typeof i.confidence === "number" ? i.confidence : 0), 0);
  return Number((total / insights.length).toFixed(3));
}

function uniqueLogIds(insights: Insight[]): string[] {
  return [...new Set(insights.flatMap((i) => i.evidenceLogIds || []))];
}

function dedupeModelAgainstRules(ruleInsights: Insight[], modelInsights: Insight[]): Insight[] {
  const keys = new Set(ruleInsights.map((i) => `${i.memberId}::${i.keyword.trim().toLowerCase()}`));
  return modelInsights.filter((i) => !keys.has(`${i.memberId}::${i.keyword.trim().toLowerCase()}`));
}

export async function precomputeInsightsForUser(userId: string): Promise<void> {
  const user = await UserModel.findById(userId);
  if (!user) return;
  const familyId = String(user.familyId);
  const members = await listMembers(familyId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  for (const member of members) {
    try {
      const memberLogs = (await listLogs(familyId, member.id)).filter(
        (log) => new Date(log.occurredAt) >= cutoff
      );

      const ruleInsights = generateInsights(familyId, member.id, member.name, memberLogs);
      let modelInsights: Insight[] = [];
      try {
        const wellnessRows = await listWellnessPulseSessionsForMember(familyId, member.id, {
          limit: 24,
          sinceDays: 45
        });
        const wellnessPulseContext =
          wellnessRows.length === 0
            ? undefined
            : [
                "Pulse Scan / Heart Rhythm Snapshot sessions (approximate pulse only).",
                ...wellnessRows.map(
                  (w) =>
                    `${w.capturedAt.slice(0, 16)}: ~${Math.round(w.heartRate)} bpm, signal quality ~${Math.round(
                      w.signalConfidence * 100
                    )}%, duration ${w.sessionDurationSec}s`
                )
              ].join("\n");
        modelInsights = await generateGeminiInsights(
          familyId,
          member.id,
          member.name,
          memberLogs,
          wellnessPulseContext
        );
      } catch (error) {
        console.error("AI generation failed for user/member", { userId, memberId: member.id, error });
      }

      const combined = [...ruleInsights, ...dedupeModelAgainstRules(ruleInsights, modelInsights)]
        .sort((a, b) => b.count - a.count)
        .slice(0, 16);

      await PrecomputedInsightModel.updateOne(
        { userId, personId: member.id },
        {
          $set: {
            familyId,
            userId,
            personId: member.id,
            insights: combined,
            generatedAt: new Date(),
            sourceLogIds: uniqueLogIds(combined),
            confidenceScore: averageConfidence(combined)
          }
        },
        { upsert: true }
      );

    } catch (error) {
      // Fault tolerance: continue with next member and keep the job alive.
      console.error("Failed precompute for user/member", { userId, memberId: member.id, error });
    }
  }
}

export async function generateWeeklyDigestForUserPerson(input: {
  userId: string;
  personId: string;
}): Promise<{
  familyId: string;
  userId: string;
  personId: string;
  title: string;
  summary: string;
  highlights: Array<{
    type: "recurring" | "trend" | "new_symptom" | "resolved_symptom" | "red_flag" | "behavioral_change";
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    confidence: number;
    evidenceLogIds: string[];
    evidenceSnippets?: Array<{ logId: string; snippet: string }>;
  }>;
  comparison: {
    symptomIncrease: string[];
    symptomDecrease: string[];
    newlyAppeared: string[];
    resolved: string[];
  };
  generatedAt: Date;
  weekStart: Date;
  weekEnd: Date;
  sourceLogIds: string[];
} | null> {
  const user = await UserModel.findById(input.userId);
  if (!user) return null;
  const familyId = String(user.familyId);
  const members = await listMembers(familyId);
  const member = members.find((m) => m.id === input.personId);
  if (!member) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const memberLogs = (await listLogs(familyId, member.id)).filter((log) => new Date(log.occurredAt) >= cutoff);
  const memberInsights = (await listLatestPrecomputedInsightsForFamily(familyId)).filter((ins) => ins.memberId === member.id);
  const timelineEvents = await listTimelineNarrativeEvents(familyId, member.id);
  const digest = createWeeklyDigest({
    familyId,
    userId: input.userId,
    personId: input.personId,
    memberName: member.name,
    logs: memberLogs,
    insights: memberInsights,
    timelineEvents
  });
  await WeeklyDigestModel.updateOne(
    { userId: input.userId, personId: input.personId, weekStart: digest.weekStart },
    { $set: digest },
    { upsert: true }
  );
  return digest;
}

export async function runWeeklyDigestPrecomputeJob(): Promise<void> {
  const users = await UserModel.find({}, { _id: 1 });
  for (const user of users) {
    const userId = user._id.toString();
    try {
      const doc = await UserModel.findById(userId);
      if (!doc) continue;
      const familyId = String(doc.familyId);
      const members = await listMembers(familyId);
      for (const member of members) {
        try {
          await generateWeeklyDigestForUserPerson({ userId, personId: member.id });
        } catch (error) {
          console.error("Weekly digest generation failed for member", { userId, memberId: member.id, error });
        }
      }
    } catch (error) {
      console.error("Weekly digest generation failed for user", { userId, error });
    }
  }
}

export async function runDailyInsightPrecomputeJob(): Promise<void> {
  const users = await UserModel.find({}, { _id: 1 });
  for (const user of users) {
    try {
      await precomputeInsightsForUser(user._id.toString());
    } catch (error) {
      // Fault tolerance: continue with next user and keep the job alive.
      console.error("Failed precompute for user", { userId: user._id.toString(), error });
    }
  }
}
