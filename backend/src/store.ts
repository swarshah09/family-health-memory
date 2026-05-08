import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { FamilyMember, HealthLog, Insight, UserRole, WeeklyDigest } from "./types.js";
import {
  AutomationRunModel,
  AutomationSettingModel,
  FamilyMemberModel,
  HealthLogModel,
  InsightSnapshotModel,
  ChatMessageModel,
  NotificationModel,
  PrecomputedInsightModel,
  WeeklyDigestModel,
  UserModel
} from "./models.js";
import { extractStructuredHealthSignal } from "./gemini.js";
import { buildTimelineNarrative, type TimelineNarrativeEvent } from "./timeline-narrative.js";
import { buildContextualReengagementPrompts, type ReengagementPrompt } from "./reengagement.js";
import { buildDoctorVisitSummary } from "./doctor-summary.js";

function mapMember(member: {
  _id: { toString: () => string };
  familyId: string;
  name: string;
  age: number;
  relationship: string;
  notes?: string | null;
  createdAt: Date;
}): FamilyMember {
  return {
    id: member._id.toString(),
    familyId: member.familyId,
    name: member.name,
    age: member.age,
    relationship: member.relationship,
    notes: member.notes || undefined,
    createdAt: member.createdAt.toISOString()
  };
}

function mapLog(log: {
  _id: { toString: () => string };
  familyId: string;
  memberId: string;
  createdBy: string;
  contributorId?: string;
  contributorRole?: "owner" | "caregiver" | "viewer";
  text: string;
  type: "text" | "voice";
  tags?: string[];
  audioUrl?: string | null;
  transcript?: string | null;
  transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
  occurredAt: Date;
  createdAt: Date;
}): HealthLog {
  return {
    id: log._id.toString(),
    familyId: log.familyId,
    memberId: log.memberId,
    createdBy: log.createdBy,
    contributorId: log.contributorId || log.createdBy || "unknown",
    contributorRole: log.contributorRole || "viewer",
    text: log.text,
    type: log.type,
    tags: log.tags || [],
    audioUrl: log.audioUrl || undefined,
    transcript: log.transcript || undefined,
    transcriptionStatus: log.transcriptionStatus || undefined,
    occurredAt: log.occurredAt.toISOString(),
    createdAt: log.createdAt.toISOString()
  };
}

function mapStoredInsight(insight: unknown): Insight {
  const raw = insight as Partial<Insight> & { createdAt?: string | Date };
  const createdAtRaw = (raw as { createdAt?: unknown }).createdAt;
  return {
    id: String(raw.id || ""),
    familyId: String(raw.familyId || ""),
    memberId: String(raw.memberId || ""),
    type: (raw.type as Insight["type"]) || "trend",
    title: String(raw.title || ""),
    summary: String(raw.summary || raw.description || ""),
    details: Array.isArray(raw.details) ? raw.details.map((d) => String(d)) : [],
    priority: (raw.priority as Insight["priority"]) || "medium",
    evidence: Array.isArray(raw.evidence) ? raw.evidence.map((id) => String(id)) : [],
    description: String(raw.description || raw.summary || ""),
    severity: (raw.severity as Insight["severity"]) || "warning",
    keyword: String(raw.keyword || raw.type || "pattern"),
    count: typeof raw.count === "number" ? raw.count : Array.isArray(raw.evidence) ? raw.evidence.length : 0,
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
    sourceLogIds: Array.isArray((raw as { sourceLogIds?: unknown[] }).sourceLogIds)
      ? ((raw as { sourceLogIds?: unknown[] }).sourceLogIds || []).map((id) => String(id))
      : Array.isArray(raw.evidence)
        ? raw.evidence.map((id) => String(id))
        : [],
    evidenceSnippets: Array.isArray((raw as { evidenceSnippets?: unknown[] }).evidenceSnippets)
      ? ((raw as { evidenceSnippets?: unknown[] }).evidenceSnippets || [])
          .map((item) => {
            const row = item as { logId?: unknown; snippet?: unknown };
            return {
              logId: String(row.logId || ""),
              snippet: String(row.snippet || "")
            };
          })
          .filter((row) => row.logId.length > 0 && row.snippet.length > 0)
      : undefined,
    evidenceLogIds: Array.isArray(raw.evidenceLogIds)
      ? raw.evidenceLogIds.map((id) => String(id))
      : Array.isArray(raw.evidence)
        ? raw.evidence.map((id) => String(id))
        : [],
    createdAt:
      typeof createdAtRaw === "string"
        ? createdAtRaw
        : createdAtRaw instanceof Date
          ? createdAtRaw.toISOString()
          : new Date().toISOString(),
    source: raw.source,
    decisionReasons: Array.isArray(raw.decisionReasons)
      ? raw.decisionReasons.map((r) => String(r))
      : undefined
  };
}

function mapWeeklyDigest(row: {
  _id: { toString: () => string };
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
  comparison?: {
    symptomIncrease?: string[];
    symptomDecrease?: string[];
    newlyAppeared?: string[];
    resolved?: string[];
  };
  generatedAt: Date;
}): WeeklyDigest {
  return {
    id: row._id.toString(),
    familyId: row.familyId,
    userId: row.userId,
    personId: row.personId,
    generatedAt: row.generatedAt.toISOString(),
    title: row.title,
    summary: row.summary,
    highlights: (row.highlights || []).map((h) => ({
      type: h.type,
      title: h.title,
      description: h.description,
      priority: h.priority,
      confidence: h.confidence,
      evidenceLogIds: h.evidenceLogIds || [],
      evidenceSnippets: h.evidenceSnippets || []
    })),
    comparison: {
      symptomIncrease: row.comparison?.symptomIncrease || [],
      symptomDecrease: row.comparison?.symptomDecrease || [],
      newlyAppeared: row.comparison?.newlyAppeared || [],
      resolved: row.comparison?.resolved || []
    }
  };
}

export async function signup(email: string, name: string, password: string) {
  const existing = await UserModel.findOne({ email: email.toLowerCase() });
  if (existing) throw new Error("EMAIL_EXISTS");
  const familyId = uuid();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await UserModel.create({
    email: email.toLowerCase(),
    name,
    passwordHash,
    familyId,
    role: "owner"
  });
  return {
    id: user._id.toString(),
    familyId: user.familyId,
    email: user.email,
    name: user.name,
    role: user.role as UserRole
  };
}

export async function login(email: string, password: string) {
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) throw new Error("INVALID_CREDENTIALS");
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) throw new Error("INVALID_CREDENTIALS");
  return {
    id: user._id.toString(),
    familyId: user.familyId,
    email: user.email,
    name: user.name,
    role: user.role as UserRole
  };
}

export async function listFamilyUsers(familyId: string) {
  const users = await UserModel.find({ familyId }).sort({ createdAt: 1 });
  return users.map((user) => ({
    id: user._id.toString(),
    familyId: user.familyId,
    email: user.email,
    name: user.name,
    role: user.role as UserRole
  }));
}

export async function updateFamilyUserRole(
  familyId: string,
  userId: string,
  role: UserRole
): Promise<void> {
  await UserModel.updateOne({ _id: userId, familyId }, { $set: { role } });
}

export async function inviteFamilyUser(
  familyId: string,
  email: string,
  name: string,
  role: UserRole
): Promise<{ id: string; email: string; name: string; role: UserRole; temporaryPassword?: string }> {
  const normalizedEmail = email.toLowerCase();
  const existing = await UserModel.findOne({ email: normalizedEmail });
  if (existing && existing.familyId !== familyId) {
    throw new Error("EMAIL_IN_OTHER_FAMILY");
  }
  if (existing && existing.familyId === familyId) {
    existing.role = role;
    existing.name = name;
    await existing.save();
    return {
      id: existing._id.toString(),
      email: existing.email,
      name: existing.name,
      role: existing.role as UserRole
    };
  }

  const temporaryPassword = Math.random().toString(36).slice(-10) + "A1!";
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const user = await UserModel.create({
    email: normalizedEmail,
    name,
    familyId,
    role,
    passwordHash
  });
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    temporaryPassword
  };
}

export async function listMembers(familyId: string): Promise<FamilyMember[]> {
  const result = await FamilyMemberModel.find({ familyId }).sort({ createdAt: -1 });
  return result.map(mapMember);
}

export async function createMember(
  familyId: string,
  payload: Omit<FamilyMember, "id" | "familyId" | "createdAt">
): Promise<FamilyMember> {
  const member = await FamilyMemberModel.create({ familyId, ...payload });
  return mapMember(member);
}

export async function deleteMember(familyId: string, memberId: string): Promise<void> {
  await FamilyMemberModel.deleteOne({ _id: memberId, familyId });
  await HealthLogModel.deleteMany({ memberId, familyId });
}

export async function updateMember(
  familyId: string,
  memberId: string,
  payload: Partial<Pick<FamilyMember, "name" | "age" | "relationship" | "notes">>
): Promise<FamilyMember | null> {
  const next: Partial<{ name: string; age: number; relationship: string; notes?: string | null }> = {};
  if (payload.name !== undefined) next.name = payload.name;
  if (payload.age !== undefined) next.age = payload.age;
  if (payload.relationship !== undefined) next.relationship = payload.relationship;
  if (payload.notes !== undefined) next.notes = payload.notes || null;

  const updated = await FamilyMemberModel.findOneAndUpdate(
    { _id: memberId, familyId },
    { $set: next },
    { new: true }
  );
  return updated ? mapMember(updated) : null;
}

export async function listLogs(familyId: string, memberId?: string): Promise<HealthLog[]> {
  const filter = memberId ? { familyId, memberId } : { familyId };
  const result = await HealthLogModel.find(filter).sort({ occurredAt: -1 });
  return result.map(mapLog);
}

export async function getLogById(familyId: string, logId: string): Promise<HealthLog | null> {
  const result = await HealthLogModel.findOne({ _id: logId, familyId });
  return result ? mapLog(result) : null;
}

export async function listTimelineNarrativeEvents(
  familyId: string,
  memberId: string
): Promise<TimelineNarrativeEvent[]> {
  const logs = await listLogs(familyId, memberId);
  return buildTimelineNarrative(logs);
}

export async function getDoctorVisitSummary(
  familyId: string,
  memberId: string,
  days = 30
): Promise<{
  title: string;
  periodLabel: string;
  generatedAt: string;
  recurringSymptoms: Array<{ symptom: string; count: number }>;
  trendAnalysis: Array<{ symptom: string; count: number; previousCount: number; trend: "increasing" | "decreasing" | "stable" }>;
  majorChangesTimeline: Array<{ date: string; event: string; details: string }>;
  medicationObservations: string[];
  summary: string;
} | null> {
  const member = await FamilyMemberModel.findOne({ _id: memberId, familyId });
  if (!member) return null;
  const [logs, insights, timelineEvents] = await Promise.all([
    listLogs(familyId, memberId),
    listLatestPrecomputedInsightsForFamily(familyId).then((rows) => rows.filter((r) => r.memberId === memberId)),
    listTimelineNarrativeEvents(familyId, memberId)
  ]);
  return buildDoctorVisitSummary({
    memberName: member.name,
    logs,
    insights,
    timelineEvents,
    days
  });
}

export async function createLog(
  familyId: string,
  payload: {
    memberId: string;
    createdBy: string;
    text: string;
    type: "text" | "voice";
    occurredAt: string;
    transcript?: string;
    transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
    audioUrl?: string;
    tags?: string[];
    audioBase64?: string;
    contributorId?: string;
    contributorRole?: UserRole;
  }
): Promise<HealthLog> {
  const log = await HealthLogModel.create({
    familyId,
    ...payload,
    contributorId: payload.contributorId || payload.createdBy || "unknown",
    contributorRole: payload.contributorRole || "viewer",
    tags: payload.tags || [],
    occurredAt: new Date(payload.occurredAt)
  });
  return mapLog(log);
}

export async function updateLog(
  familyId: string,
  logId: string,
  payload: { text?: string; tags?: string[] }
): Promise<HealthLog | null> {
  const next: { text?: string; tags?: string[] } = {};
  if (payload.text !== undefined) next.text = payload.text;
  if (payload.tags !== undefined) next.tags = payload.tags;
  if (Object.keys(next).length === 0) {
    const existing = await HealthLogModel.findOne({ _id: logId, familyId });
    return existing ? mapLog(existing) : null;
  }
  const updated = await HealthLogModel.findOneAndUpdate(
    { _id: logId, familyId },
    { $set: next },
    { new: true }
  );
  return updated ? mapLog(updated) : null;
}

export async function deleteLog(familyId: string, logId: string): Promise<HealthLog | null> {
  const removed = await HealthLogModel.findOneAndDelete({ _id: logId, familyId });
  return removed ? mapLog(removed) : null;
}

export async function listInsights(familyId: string): Promise<Insight[]> {
  return listLatestPrecomputedInsightsForFamily(familyId);
}

export async function listPrecomputedInsightsForUser(
  familyId: string,
  userId: string
): Promise<Insight[]> {
  const rows = await PrecomputedInsightModel.find({ familyId, userId }).sort({ generatedAt: -1 });
  return rows
    .flatMap((row) => ((row.insights as unknown[]) || []).map(mapStoredInsight))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);
}

export async function listDigestsForUserPerson(
  familyId: string,
  userId: string,
  personId: string
): Promise<WeeklyDigest[]> {
  const rows = await WeeklyDigestModel.find({ familyId, userId, personId }).sort({ generatedAt: -1 }).limit(12);
  return rows.map(mapWeeklyDigest);
}

export async function listLatestPrecomputedInsightsForFamily(familyId: string): Promise<Insight[]> {
  const rows = await PrecomputedInsightModel.find({ familyId }).sort({ generatedAt: -1 });
  const byPerson = new Map<string, Insight[]>();
  for (const row of rows) {
    if (byPerson.has(row.personId)) continue;
    byPerson.set(
      row.personId,
      ((row.insights as unknown[]) || []).map(mapStoredInsight).slice(0, 16)
    );
  }
  return [...byPerson.values()].flat().sort((a, b) => b.count - a.count).slice(0, 16);
}

export async function cacheInsightsSnapshot(familyId: string): Promise<void> {
  const insights = await listLatestPrecomputedInsightsForFamily(familyId);
  await InsightSnapshotModel.create({
    familyId,
    generatedAt: new Date(),
    insights
  });
}

export async function getLatestInsightsSnapshot(familyId: string): Promise<Insight[] | null> {
  const latest = await InsightSnapshotModel.findOne({ familyId }).sort({ generatedAt: -1 });
  if (!latest) return null;
  return ((latest.insights as unknown[]) || []).map(mapStoredInsight);
}

export async function getAllActiveFamilyIds(): Promise<string[]> {
  const ids = await UserModel.distinct("familyId");
  return ids.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export async function ingestChatMessage(
  familyId: string,
  senderName: string,
  text: string
): Promise<{ logCreated: boolean; messageId: string; matchedMemberId?: string | null }> {
  const members = await listMembers(familyId);
  const structured = await extractStructuredHealthSignal(
    text,
    members.map((m) => m.name)
  );
  const matchedMember =
    members.find((member) => member.name.toLowerCase() === (structured.memberName || "").toLowerCase()) ||
    members.find((member) => text.toLowerCase().includes(member.name.toLowerCase())) ||
    null;

  const chatMessage = await ChatMessageModel.create({
    familyId,
    senderName,
    text,
    source: "family_app",
    structuredResult: structured,
    autoLogCreated: Boolean(matchedMember)
  });

  if (!matchedMember) {
    return { logCreated: false, messageId: chatMessage._id.toString(), matchedMemberId: null };
  }

  await createLog(familyId, {
    memberId: matchedMember.id,
    createdBy: senderName || "chat-ingest",
    text: structured.normalizedText || text,
    type: "text",
    occurredAt: new Date().toISOString(),
    tags: structured.tags || []
  });

  return {
    logCreated: true,
    messageId: chatMessage._id.toString(),
    matchedMemberId: matchedMember.id
  };
}

type StructuredChatExtraction = {
  memberName?: string | null;
  tags?: string[];
  normalizedText?: string;
};

export async function listPendingChatIngestReviews(familyId: string): Promise<
  Array<{
    id: string;
    senderName: string;
    text: string;
    structuredHint: StructuredChatExtraction | null;
    createdAt: string;
  }>
> {
  const rows = await ChatMessageModel.find({
    familyId,
    autoLogCreated: { $ne: true },
    resolvedHealthLogId: { $exists: false },
    dismissedAt: { $exists: false }
  })
    .sort({ createdAt: -1 })
    .limit(50);

  return rows.map((row) => ({
    id: row._id.toString(),
    senderName: row.senderName,
    text: row.text,
    structuredHint: (row.structuredResult as StructuredChatExtraction | undefined) || null,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function resolveChatIngestMessage(
  familyId: string,
  messageId: string,
  memberId: string,
  createdBy: string
): Promise<{ logId: string }> {
  const doc = await ChatMessageModel.findOne({ _id: messageId, familyId });
  if (!doc) throw new Error("CHAT_MESSAGE_NOT_FOUND");
  if (doc.autoLogCreated) throw new Error("CHAT_ALREADY_LOGGED");
  if (doc.resolvedHealthLogId) throw new Error("CHAT_ALREADY_RESOLVED");
  if (doc.dismissedAt) throw new Error("CHAT_DISMISSED");

  const members = await listMembers(familyId);
  const member = members.find((m) => m.id === memberId);
  if (!member) throw new Error("MEMBER_NOT_FOUND");

  const structured = (doc.structuredResult as StructuredChatExtraction | undefined) || {};
  const log = await createLog(familyId, {
    memberId,
    createdBy,
    text: structured.normalizedText || doc.text,
    type: "text",
    occurredAt: new Date().toISOString(),
    tags: structured.tags || []
  });

  doc.resolvedHealthLogId = log.id;
  await doc.save();

  return { logId: log.id };
}

export async function dismissChatIngestMessage(familyId: string, messageId: string): Promise<void> {
  const doc = await ChatMessageModel.findOne({ _id: messageId, familyId });
  if (!doc) throw new Error("CHAT_MESSAGE_NOT_FOUND");
  if (doc.autoLogCreated) throw new Error("CHAT_ALREADY_LOGGED");
  if (doc.resolvedHealthLogId) throw new Error("CHAT_ALREADY_RESOLVED");
  if (doc.dismissedAt) throw new Error("CHAT_ALREADY_DISMISSED");

  doc.dismissedAt = new Date();
  await doc.save();
}

export async function getAutomationSettings(familyId: string): Promise<{
  minMentions: number;
  minConfidence: number;
  notificationsEnabled: boolean;
}> {
  const setting = await AutomationSettingModel.findOne({ familyId });
  if (!setting) {
    const created = await AutomationSettingModel.create({
      familyId,
      minMentions: 3,
      minConfidence: 0.7,
      notificationsEnabled: true
    });
    return {
      minMentions: created.minMentions,
      minConfidence: created.minConfidence,
      notificationsEnabled: created.notificationsEnabled
    };
  }
  return {
    minMentions: setting.minMentions,
    minConfidence: setting.minConfidence,
    notificationsEnabled: setting.notificationsEnabled
  };
}

export async function updateAutomationSettings(
  familyId: string,
  payload: Partial<{ minMentions: number; minConfidence: number; notificationsEnabled: boolean }>
): Promise<void> {
  await AutomationSettingModel.updateOne(
    { familyId },
    { $set: payload },
    { upsert: true }
  );
}

export async function listNotifications(familyId: string): Promise<
  Array<{ id: string; memberId: string; message: string; severity: "info" | "warning" | "alert"; isRead: boolean; createdAt: string }>
> {
  const results = await NotificationModel.find({ familyId }).sort({ createdAt: -1 }).limit(30);
  return results.map((item) => ({
    id: item._id.toString(),
    memberId: item.memberId,
    message: item.message,
    severity: item.severity as "info" | "warning" | "alert",
    isRead: item.isRead,
    createdAt: item.createdAt.toISOString()
  }));
}

export async function listContextualReengagementPrompts(familyId: string): Promise<ReengagementPrompt[]> {
  const [members, logs, insights] = await Promise.all([
    listMembers(familyId),
    listLogs(familyId),
    listLatestPrecomputedInsightsForFamily(familyId)
  ]);
  return buildContextualReengagementPrompts({
    familyId,
    members,
    logs,
    insights
  });
}

export async function markNotificationRead(familyId: string, notificationId: string): Promise<void> {
  await NotificationModel.updateOne({ _id: notificationId, familyId }, { $set: { isRead: true } });
}

export async function getAutomationStatus(familyId: string): Promise<{
  lastRunAt: string | null;
  lastRunStatus: "success" | "failed" | null;
  insightsGenerated: number;
  notificationsCreated: number;
}> {
  const run = await AutomationRunModel.findOne({ familyId }).sort({ createdAt: -1 });
  if (!run) {
    return {
      lastRunAt: null,
      lastRunStatus: null,
      insightsGenerated: 0,
      notificationsCreated: 0
    };
  }
  return {
    lastRunAt: run.createdAt.toISOString(),
    lastRunStatus: run.status as "success" | "failed",
    insightsGenerated: run.insightsGenerated,
    notificationsCreated: run.notificationsCreated
  };
}

export async function runAutomationAnalysis(
  familyId: string,
  runType: "manual" | "scheduled"
): Promise<{ insightsGenerated: number; notificationsCreated: number }> {
  try {
    const settings = await getAutomationSettings(familyId);
    const insights = await listLatestPrecomputedInsightsForFamily(familyId);
    await cacheInsightsSnapshot(familyId);

    const filtered = insights.filter(
      (ins) => ins.count >= settings.minMentions && (ins.confidence || 0) >= settings.minConfidence
    );

    let notificationsCreated = 0;
    if (settings.notificationsEnabled) {
      const existing = await NotificationModel.find({
        familyId,
        insightId: { $in: filtered.map((f) => f.id) },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      const existingIds = new Set(existing.map((e) => e.insightId));

      const creates = filtered
        .filter((ins) => !existingIds.has(ins.id))
        .map((ins) => ({
          familyId,
          memberId: ins.memberId,
          insightId: ins.id,
          severity: ins.severity,
          message:
            ins.severity === "alert"
              ? `I noticed ${ins.keyword} has appeared repeatedly. It may be worth closer observation.`
              : `Pattern update: ${ins.title}`,
          isRead: false
        }));
      if (creates.length) {
        await NotificationModel.insertMany(creates);
      }
      const reengagementPrompts = buildContextualReengagementPrompts({
        familyId,
        members: await listMembers(familyId),
        logs: await listLogs(familyId),
        insights
      });
      const existingPromptNotifications = await NotificationModel.find({
        familyId,
        insightId: { $in: reengagementPrompts.map((p) => p.id) },
        createdAt: { $gte: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }
      });
      const existingPromptIds = new Set(existingPromptNotifications.map((n) => n.insightId));
      const promptCreates = reengagementPrompts
        .filter((prompt) => !existingPromptIds.has(prompt.id))
        .map((prompt) => ({
          familyId,
          memberId: prompt.memberId,
          insightId: prompt.id,
          severity: prompt.severity,
          message: prompt.prompt,
          isRead: false
        }));
      if (promptCreates.length) await NotificationModel.insertMany(promptCreates);
      notificationsCreated = creates.length + promptCreates.length;
    }

    await AutomationRunModel.create({
      familyId,
      runType,
      status: "success",
      insightsGenerated: filtered.length,
      notificationsCreated
    });
    return { insightsGenerated: filtered.length, notificationsCreated };
  } catch (error) {
    await AutomationRunModel.create({
      familyId,
      runType,
      status: "failed",
      insightsGenerated: 0,
      notificationsCreated: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown automation error"
    });
    throw error;
  }
}
