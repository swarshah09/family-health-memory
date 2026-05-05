import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { FamilyMember, HealthLog, Insight, UserRole } from "./types.js";
import { generateInsights } from "./patterns.js";
import {
  AutomationRunModel,
  AutomationSettingModel,
  FamilyMemberModel,
  HealthLogModel,
  InsightSnapshotModel,
  ChatMessageModel,
  NotificationModel,
  UserModel
} from "./models.js";
import { extractStructuredHealthSignal, generateGeminiInsights } from "./gemini.js";

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
  text: string;
  type: "text" | "voice";
  tags?: string[];
  occurredAt: Date;
  createdAt: Date;
}): HealthLog {
  return {
    id: log._id.toString(),
    familyId: log.familyId,
    memberId: log.memberId,
    createdBy: log.createdBy,
    text: log.text,
    type: log.type,
    tags: log.tags || [],
    occurredAt: log.occurredAt.toISOString(),
    createdAt: log.createdAt.toISOString()
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

export async function createLog(
  familyId: string,
  payload: Omit<HealthLog, "id" | "familyId" | "createdAt" | "tags"> & { tags?: string[]; audioBase64?: string }
): Promise<HealthLog> {
  const log = await HealthLogModel.create({
    familyId,
    ...payload,
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

export async function listInsights(familyId: string): Promise<Insight[]> {
  const members = await listMembers(familyId);
  const allLogs = await listLogs(familyId);

  const deterministic = members.flatMap((member) =>
    generateInsights(familyId, member.id, member.name, allLogs).map((insight) => ({
      ...insight,
      id: `${member.id}-${insight.keyword.replace(/\s+/g, "-")}`
    }))
  );

  const ruleKeys = new Set(
    deterministic.map((i) => `${i.memberId}::${i.keyword.trim().toLowerCase()}`)
  );

  const geminiForEachMember = await Promise.all(
    members.map(async (member) => {
      const memberLogs = allLogs.filter((l) => l.memberId === member.id);
      try {
        return await generateGeminiInsights(familyId, member.id, member.name, memberLogs);
      } catch {
        return [];
      }
    })
  );

  const modelInsights = geminiForEachMember
    .flat()
    .filter((g) => !ruleKeys.has(`${g.memberId}::${g.keyword.trim().toLowerCase()}`));

  return [...deterministic, ...modelInsights].sort((a, b) => b.count - a.count).slice(0, 16);
}

export async function cacheInsightsSnapshot(familyId: string): Promise<void> {
  const insights = await listInsights(familyId);
  await InsightSnapshotModel.create({
    familyId,
    generatedAt: new Date(),
    insights
  });
}

export async function getLatestInsightsSnapshot(familyId: string): Promise<Insight[] | null> {
  const latest = await InsightSnapshotModel.findOne({ familyId }).sort({ generatedAt: -1 });
  if (!latest) return null;
  return latest.insights as Insight[];
}

export async function getAllActiveFamilyIds(): Promise<string[]> {
  const ids = await HealthLogModel.distinct("familyId");
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
    const insights = await listInsights(familyId);
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
      notificationsCreated = creates.length;
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
