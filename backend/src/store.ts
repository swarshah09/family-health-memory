import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import type { VoiceRawAudioMetadata } from "./types.js";
import {
  ContributorLink,
  FamilyActivityEvent,
  FamilyMember,
  FamilyWorkspace,
  FamilyRole,
  HealthLog,
  Insight,
  JoinFamilyRequestRow,
  LogAccessGrantRow,
  LogAccessPermissionLevel,
  LogSourceType,
  MedicationSlot,
  MemberLogAccessRequestRow,
  UserRole,
  VitalReading,
  WellnessPulseSession,
  WeeklyDigest,
  WorkspaceRole
} from "./types.js";
import {
  AutomationRunModel,
  AutomationSettingModel,
  FamilyInvitationModel,
  FamilyMemberModel,
  FamilyWorkspaceModel,
  HealthLogModel,
  InsightSnapshotModel,
  MedicationSlotModel,
  ChatMessageModel,
  JoinFamilyRequestModel,
  LogAccessGrantModel,
  MemberLogAccessRequestModel,
  NotificationModel,
  PrecomputedInsightModel,
  VitalReadingModel,
  WeeklyDigestModel,
  WellnessPulseSessionModel,
  UserModel
} from "./models.js";
import {
  buildMemberLinkedUserMap,
  canSeeLogWithSets,
  inferLogSourceType,
  isHead,
  listAccessibleMemberProfileIds,
  listGrantedMemberProfileIds,
  profileAllowsLogForViewer,
  type ViewerContext
} from "./workspace-permissions.js";
import { deriveFamilyRoleFromLegacy, resolveWorkspaceRole } from "./family-roles.js";
import { listAuditLogs } from "./audit.js";
import { extractStructuredHealthSignal } from "./gemini.js";
import { buildTimelineNarrative, type TimelineNarrativeEvent } from "./timeline-narrative.js";
import { buildContextualReengagementPrompts, type ReengagementPrompt } from "./reengagement.js";
import { buildDoctorSummaryDocument } from "./doctor-summary-export/composer.js";
import type { DoctorSummaryDocument } from "./doctor-summary-export/types.js";
import { deleteVoiceArtifactIfExists } from "./voice-storage.js";

function mapCareCollaborators(raw: unknown): ContributorLink[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ContributorLink[] = [];
  for (const row of raw) {
    const r = row as { userId?: string; note?: string; since?: Date | string };
    if (!r.userId) continue;
    const since =
      r.since instanceof Date
        ? r.since.toISOString()
        : typeof r.since === "string"
          ? r.since
          : undefined;
    out.push({
      userId: String(r.userId),
      note: r.note ? String(r.note) : undefined,
      since
    });
  }
  return out.length ? out : undefined;
}

function mapMember(member: {
  _id: { toString: () => string };
  familyId: string;
  linkedUserId?: string | null;
  name: string;
  age: number;
  relationship: string;
  notes?: string | null;
  careCollaborators?: unknown;
  createdAt: Date;
}): FamilyMember {
  return {
    id: member._id.toString(),
    familyId: member.familyId,
    ...(member.linkedUserId ? { linkedUserId: String(member.linkedUserId) } : {}),
    name: member.name,
    age: member.age,
    relationship: member.relationship,
    notes: member.notes || undefined,
    careCollaborators: mapCareCollaborators(member.careCollaborators),
    createdAt: member.createdAt.toISOString()
  };
}

function mapLog(log: {
  _id: { toString: () => string };
  familyId: string;
  memberId: string;
  createdBy: string;
  contributorId?: string;
  contributorRole?: "owner" | "caregiver" | "viewer" | "HEAD" | "MEMBER";
  ownerUserId?: string | null;
  createdByUserId?: string | null;
  sourceType?: LogSourceType | null;
  visibility?: "private" | "family" | null;
  text: string;
  type: "text" | "voice";
  tags?: string[];
  audioUrl?: string | null;
  transcript?: string | null;
  transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
  rawAudioMetadata?: VoiceRawAudioMetadata | null;
  occurredAt: Date;
  createdAt: Date;
}): HealthLog {
  const contributorId = String(log.contributorId || log.createdBy || "unknown");
  const createdByUserId = String(log.createdByUserId || log.contributorId || log.createdBy || "unknown");
  const ownerRaw =
    log.ownerUserId != null && String(log.ownerUserId).trim() !== "" ? String(log.ownerUserId) : undefined;
  const sourceType = inferLogSourceType({
    sourceType: log.sourceType,
    ownerUserId: ownerRaw,
    createdByUserId,
    contributorId
  });
  const ownerUserId =
    ownerRaw !== undefined ? ownerRaw : sourceType === "self" ? createdByUserId : undefined;
  const visibility =
    log.visibility === "private" || log.visibility === "family" ? log.visibility : undefined;
  return {
    id: log._id.toString(),
    familyId: log.familyId,
    memberId: log.memberId,
    createdBy: log.createdBy,
    contributorId,
    contributorRole: (log.contributorRole as HealthLog["contributorRole"]) || "viewer",
    ownerUserId,
    createdByUserId,
    sourceType,
    visibility,
    text: log.text,
    type: log.type,
    tags: log.tags || [],
    audioUrl: log.audioUrl || undefined,
    transcript: log.transcript || undefined,
    transcriptionStatus: log.transcriptionStatus || undefined,
    rawAudioMetadata: log.rawAudioMetadata || undefined,
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
  } | null;
  generatedAt: Date;
  weekStart?: Date;
  weekEnd?: Date;
  sourceLogIds?: string[];
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
    },
    weekStart: row.weekStart ? row.weekStart.toISOString() : undefined,
    weekEnd: row.weekEnd ? row.weekEnd.toISOString() : undefined,
    sourceLogIds: Array.isArray(row.sourceLogIds) ? row.sourceLogIds.map(String) : undefined
  };
}

async function mapUserToAuthProfile(user: {
  _id: { toString: () => string };
  familyId?: string | null;
  email: string;
  name: string;
  role?: UserRole | null;
  workspaceRole?: string | null;
  familyRole?: string | null;
  profilePictureUrl?: string | null;
  description?: string | null;
}): Promise<{
  id: string;
  familyId?: string;
  email: string;
  name: string;
  familyRole: FamilyRole;
  role: UserRole;
  workspaceRole: WorkspaceRole;
  familyName?: string;
  profilePictureUrl?: string;
  description?: string;
}> {
  const familyRole =
    (user.familyRole as FamilyRole) || deriveFamilyRoleFromLegacy(user.role ?? null, user.workspaceRole);
  const workspaceRole = resolveWorkspaceRole((user.role as UserRole) || "viewer", user.workspaceRole);
  const legacyRole = (user.role as UserRole) || (familyRole === "HEAD" ? "owner" : "viewer");
  const fid = user.familyId && String(user.familyId).trim() ? String(user.familyId) : undefined;
  const fam = fid ? await FamilyWorkspaceModel.findOne({ familyId: fid }).lean() : null;
  const familyName = fam?.name ? String(fam.name) : undefined;
  return {
    id: user._id.toString(),
    ...(fid ? { familyId: fid } : {}),
    email: user.email,
    name: user.name,
    familyRole,
    role: legacyRole,
    workspaceRole,
    familyName,
    ...(user.profilePictureUrl ? { profilePictureUrl: String(user.profilePictureUrl) } : {}),
    ...(user.description ? { description: String(user.description) } : {})
  };
}

export async function signup(email: string, name: string, password: string, familyName?: string) {
  const existing = await UserModel.findOne({ email: email.toLowerCase() });
  if (existing) throw new Error("EMAIL_EXISTS");
  const familyId = uuid();
  const passwordHash = await bcrypt.hash(password, 10);
  const famName = (familyName?.trim() || "My family").slice(0, 120);
  const user = await UserModel.create({
    email: email.toLowerCase(),
    name,
    passwordHash,
    familyId,
    familyRole: "HEAD",
    role: "owner",
    workspaceRole: "head"
  });
  await FamilyWorkspaceModel.create({
    familyId,
    name: famName,
    createdByUserId: user._id.toString()
  });
  await ensurePersonalHealthMember(user._id.toString(), familyId, name);
  return mapUserToAuthProfile(user);
}

export async function login(email: string, password: string) {
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) throw new Error("INVALID_CREDENTIALS");
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) throw new Error("INVALID_CREDENTIALS");
  return mapUserToAuthProfile(user);
}

export async function listFamilyUsers(familyId: string) {
  const users = await UserModel.find({ familyId }).sort({ createdAt: 1 });
  return users.map((user) => {
    const familyRole =
      (user.familyRole as FamilyRole) || deriveFamilyRoleFromLegacy(user.role, user.workspaceRole);
    return {
      id: user._id.toString(),
      familyId: user.familyId as string,
      email: user.email,
      name: user.name,
      familyRole,
      role: user.role as UserRole,
      workspaceRole: resolveWorkspaceRole(user.role as UserRole, user.workspaceRole as string | undefined)
    };
  });
}

export async function updateFamilyUserRole(familyId: string, userId: string, role: UserRole): Promise<void> {
  await UserModel.updateOne({ _id: userId, familyId }, { $set: { role } });
}

/** Promote or demote HEAD ↔ MEMBER. Enforces at least one HEAD per family. */
export async function setUserFamilyRole(
  familyId: string,
  _actorUserId: string,
  targetUserId: string,
  nextRole: FamilyRole
): Promise<void> {
  const target = await UserModel.findOne({ _id: targetUserId, familyId });
  if (!target) throw new Error("USER_NOT_FOUND");
  const current =
    (target.familyRole as FamilyRole) || deriveFamilyRoleFromLegacy(target.role, target.workspaceRole);
  if (current === "HEAD" && nextRole === "MEMBER") {
    const otherHeads = await UserModel.countDocuments({
      familyId,
      familyRole: "HEAD",
      _id: { $ne: targetUserId }
    });
    if (otherHeads < 1) throw new Error("LAST_HEAD");
  }
  const workspaceRole = nextRole === "HEAD" ? "head" : "member";
  const legacyRole = nextRole === "HEAD" ? "owner" : "viewer";
  await UserModel.updateOne(
    { _id: targetUserId, familyId },
    { $set: { familyRole: nextRole, workspaceRole, role: legacyRole } }
  );
}

export type InviteFamilyUserResult =
  | { status: "active"; id: string; email: string; name: string; role: UserRole }
  | {
      status: "pending";
      invitationId: string;
      email: string;
      inviteeName: string;
      role: UserRole;
      rawToken: string;
      expiresAt: string;
    };

function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim()).digest("hex");
}

export async function inviteFamilyUser(
  familyId: string,
  email: string,
  name: string,
  role: UserRole,
  invitedByUserId: string
): Promise<InviteFamilyUserResult> {
  const normalizedEmail = email.toLowerCase();
  if (role === "owner") {
    throw new Error("INVITE_ROLE_NOT_ALLOWED");
  }
  const existing = await UserModel.findOne({ email: normalizedEmail });
  if (existing && existing.familyId !== familyId) {
    throw new Error("EMAIL_IN_OTHER_FAMILY");
  }
  if (existing && existing.familyId === familyId) {
    existing.role = role;
    existing.name = name;
    if (!existing.workspaceRole) existing.workspaceRole = "member";
    await existing.save();
    await ensurePersonalHealthMember(existing._id.toString(), familyId, existing.name);
    return {
      status: "active",
      id: existing._id.toString(),
      email: existing.email,
      name: existing.name,
      role: existing.role as UserRole
    };
  }

  await FamilyInvitationModel.deleteMany({ familyId, email: normalizedEmail });
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const inv = await FamilyInvitationModel.create({
    familyId,
    email: normalizedEmail,
    inviteeName: name.trim(),
    role,
    tokenHash,
    invitedByUserId,
    expiresAt
  });
  return {
    status: "pending",
    invitationId: inv._id.toString(),
    email: normalizedEmail,
    inviteeName: name.trim(),
    role,
    rawToken,
    expiresAt: expiresAt.toISOString()
  };
}

export async function getInvitationPreviewByToken(rawToken: string): Promise<{
  email: string;
  inviteeName: string;
  role: UserRole;
  invitedByName?: string;
} | null> {
  const tokenHash = hashInviteToken(rawToken);
  const inv = await FamilyInvitationModel.findOne({ tokenHash, expiresAt: { $gt: new Date() } });
  if (!inv) return null;
  let invitedByName: string | undefined;
  if (inv.invitedByUserId) {
    const u = await UserModel.findById(inv.invitedByUserId);
    invitedByName = u?.name;
  }
  return {
    email: inv.email,
    inviteeName: inv.inviteeName,
    role: inv.role as UserRole,
    invitedByName
  };
}

export async function acceptFamilyInvitation(
  rawToken: string,
  password: string,
  name?: string
): Promise<Awaited<ReturnType<typeof mapUserToAuthProfile>>> {
  const tokenHash = hashInviteToken(rawToken);
  const inv = await FamilyInvitationModel.findOne({ tokenHash, expiresAt: { $gt: new Date() } });
  if (!inv) throw new Error("INVITE_INVALID_OR_EXPIRED");
  const normalizedEmail = inv.email;
  const stillExist = await UserModel.findOne({ email: normalizedEmail });
  if (stillExist) {
    await FamilyInvitationModel.deleteOne({ _id: inv._id });
    throw new Error("EMAIL_ALREADY_REGISTERED");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const finalName = (name?.trim() || inv.inviteeName || "Contributor").slice(0, 120);
  const user = await UserModel.create({
    email: normalizedEmail,
    name: finalName,
    familyId: inv.familyId,
    role: inv.role as UserRole,
    familyRole: "MEMBER",
    workspaceRole: "member",
    passwordHash
  });
  await ensurePersonalHealthMember(user._id.toString(), String(inv.familyId), finalName);
  await FamilyInvitationModel.deleteOne({ _id: inv._id });
  return mapUserToAuthProfile(user);
}

export async function listFamilyActivity(familyId: string, limit = 60): Promise<FamilyActivityEvent[]> {
  const [{ rows }, users] = await Promise.all([
    listAuditLogs(familyId, { limit: Math.min(Math.max(limit, 1), 120) }),
    listFamilyUsers(familyId)
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((row) => {
    const u = row.actorUserId ? byId.get(row.actorUserId) : undefined;
    const contributorName = u?.name || row.actorEmail;
    return {
      id: row.id,
      contributorId: row.actorUserId || u?.id || "unknown",
      contributorName,
      contributorEmail: row.actorEmail,
      action: row.action,
      timestamp: row.createdAt,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: row.metadata
    };
  });
}

export async function listMembers(familyId: string): Promise<FamilyMember[]> {
  const result = await FamilyMemberModel.find({ familyId }).sort({ createdAt: -1 });
  return result.map(mapMember);
}

export async function createMember(
  familyId: string,
  payload: Omit<FamilyMember, "id" | "familyId" | "createdAt" | "linkedUserId">
): Promise<FamilyMember> {
  const member = await FamilyMemberModel.create({ familyId, ...payload });
  return mapMember(member);
}

/** Idempotent personal health profile for a family user (My Health). */
export async function ensurePersonalHealthMember(
  userId: string,
  familyId: string,
  displayName: string
): Promise<FamilyMember> {
  const existing = await FamilyMemberModel.findOne({ familyId, linkedUserId: userId });
  if (existing) return mapMember(existing);
  const member = await FamilyMemberModel.create({
    familyId,
    linkedUserId: userId,
    name: displayName.slice(0, 120),
    age: 0,
    relationship: "Self"
  });
  return mapMember(member);
}

export async function deleteMember(familyId: string, memberId: string): Promise<void> {
  await FamilyMemberModel.deleteOne({ _id: memberId, familyId });
  await HealthLogModel.deleteMany({ memberId, familyId });
  await VitalReadingModel.deleteMany({ memberId, familyId });
  await MedicationSlotModel.deleteMany({ memberId, familyId });
  await WellnessPulseSessionModel.deleteMany({ memberId, familyId });
}

export async function deleteFamilyMemberIfAllowed(familyId: string, memberId: string): Promise<void> {
  const row = await FamilyMemberModel.findOne({ _id: memberId, familyId }).lean();
  if (!row) throw new Error("MEMBER_NOT_FOUND");
  if (row.linkedUserId) throw new Error("LINKED_MEMBER_DELETE_FORBIDDEN");
  await deleteMember(familyId, memberId);
}

export async function updateMember(
  familyId: string,
  memberId: string,
  payload: Partial<Pick<FamilyMember, "name" | "age" | "relationship" | "notes" | "careCollaborators">>
): Promise<FamilyMember | null> {
  const next: Partial<{
    name: string;
    age: number;
    relationship: string;
    notes?: string | null;
    careCollaborators: Array<{ userId: string; note?: string; since?: Date }>;
  }> = {};
  if (payload.name !== undefined) next.name = payload.name;
  if (payload.age !== undefined) next.age = payload.age;
  if (payload.relationship !== undefined) next.relationship = payload.relationship;
  if (payload.notes !== undefined) next.notes = payload.notes || null;
  if (payload.careCollaborators !== undefined) {
    next.careCollaborators = payload.careCollaborators.map((c) => ({
      userId: c.userId,
      note: c.note,
      since: c.since ? new Date(c.since) : new Date()
    }));
  }

  const updated = await FamilyMemberModel.findOneAndUpdate(
    { _id: memberId, familyId },
    { $set: next },
    { new: true }
  );
  return updated ? mapMember(updated) : null;
}

/** Unrestricted listing (background jobs, insight precompute). */
export async function listLogs(familyId: string, memberId?: string): Promise<HealthLog[]> {
  const filter = memberId ? { familyId, memberId } : { familyId };
  const result = await HealthLogModel.find(filter).sort({ occurredAt: -1 });
  return result.map(mapLog);
}

/** Permission-aware listing for interactive API callers. */
export async function listLogsForViewer(
  familyId: string,
  ctx: ViewerContext,
  memberId?: string
): Promise<HealthLog[]> {
  const linkedMap = await buildMemberLinkedUserMap(familyId);
  const passProfile = (doc: {
    memberId?: unknown;
    contributorId?: unknown;
    ownerUserId?: unknown;
    createdByUserId?: unknown;
    sourceType?: string | null;
    visibility?: string | null;
  }) => {
    const mid = String(doc.memberId ?? "");
    if (!mid) return false;
    const link = linkedMap.get(mid);
    return profileAllowsLogForViewer(ctx, link, doc);
  };

  if (isHead(ctx)) {
    const filter: Record<string, unknown> = { familyId };
    if (memberId) filter.memberId = memberId;
    const result = await HealthLogModel.find(filter).sort({ occurredAt: -1 }).limit(800).lean();
    return result.filter((r) => passProfile(r)).map((r) => mapLog(r as never));
  }
  const [accessible, grants] = await Promise.all([
    listAccessibleMemberProfileIds(familyId, ctx),
    listGrantedMemberProfileIds(familyId, ctx.userId)
  ]);
  const accSet = new Set(accessible);
  const grantSet = new Set(grants);
  const filterMemberIds = memberId ? (accSet.has(memberId) ? [memberId] : []) : accessible;
  if (filterMemberIds.length === 0) return [];
  const filter: Record<string, unknown> = { familyId, memberId: memberId || { $in: filterMemberIds } };
  const raw = await HealthLogModel.find(filter).sort({ occurredAt: -1 }).limit(800).lean();
  const out = raw.filter((doc) => passProfile(doc) && canSeeLogWithSets(doc, ctx, grantSet, accSet));
  return out.map((d) => mapLog(d as never));
}

/** Recent logs for AI memory search (bounded window + limit). */
export async function listRecentLogsForFamily(
  familyId: string,
  opts: { memberId?: string; sinceDays?: number; limit?: number; viewer?: ViewerContext }
): Promise<HealthLog[]> {
  const sinceDays = opts.sinceDays ?? 180;
  const limit = Math.min(Math.max(opts.limit ?? 400, 1), 600);
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  if (opts.viewer) {
    const pool = await listLogsForViewer(familyId, opts.viewer, opts.memberId);
    const sinceMs = since.getTime();
    return pool.filter((l) => new Date(l.occurredAt).getTime() >= sinceMs).slice(0, limit);
  }
  const filter: Record<string, unknown> = { familyId, occurredAt: { $gte: since } };
  if (opts.memberId) filter.memberId = opts.memberId;
  const result = await HealthLogModel.find(filter).sort({ occurredAt: -1 }).limit(limit);
  return result.map(mapLog);
}

export async function getLogById(familyId: string, logId: string): Promise<HealthLog | null> {
  const result = await HealthLogModel.findOne({ _id: logId, familyId });
  return result ? mapLog(result) : null;
}

function mapVitalReading(doc: {
  _id: { toString: () => string };
  familyId: string;
  memberId: string;
  kind: "blood_pressure" | "glucose";
  systolic?: number | null;
  diastolic?: number | null;
  mgDl?: number | null;
  recordedAt: Date;
  createdByUserId?: string | null;
}): VitalReading {
  return {
    id: doc._id.toString(),
    familyId: doc.familyId,
    memberId: doc.memberId,
    kind: doc.kind,
    ...(doc.systolic != null && !Number.isNaN(doc.systolic) ? { systolic: doc.systolic } : {}),
    ...(doc.diastolic != null && !Number.isNaN(doc.diastolic) ? { diastolic: doc.diastolic } : {}),
    ...(doc.mgDl != null && !Number.isNaN(doc.mgDl) ? { mgDl: doc.mgDl } : {}),
    recordedAt: doc.recordedAt.toISOString(),
    ...(doc.createdByUserId ? { createdByUserId: String(doc.createdByUserId) } : {})
  };
}

function mapMedicationSlot(doc: {
  _id: { toString: () => string };
  familyId: string;
  memberId: string;
  dayKey: string;
  slotHalf: number;
  status: "taken" | "missed" | "late" | "pending";
  updatedAt: Date;
}): MedicationSlot {
  return {
    id: doc._id.toString(),
    familyId: doc.familyId,
    memberId: doc.memberId,
    dayKey: doc.dayKey,
    slotHalf: doc.slotHalf === 1 ? 1 : 0,
    status: doc.status,
    updatedAt: doc.updatedAt.toISOString()
  };
}

export async function listVitalReadingsForViewer(
  familyId: string,
  ctx: ViewerContext,
  opts?: { memberId?: string; limit?: number }
): Promise<VitalReading[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 240, 1), 500);
  if (isHead(ctx)) {
    const filter: Record<string, unknown> = { familyId };
    if (opts?.memberId) filter.memberId = opts.memberId;
    const rows = await VitalReadingModel.find(filter).sort({ recordedAt: -1 }).limit(limit).lean();
    return rows.map((r) => mapVitalReading(r as never));
  }
  const [accessible, grants] = await Promise.all([
    listAccessibleMemberProfileIds(familyId, ctx),
    listGrantedMemberProfileIds(familyId, ctx.userId)
  ]);
  const union = new Set(accessible);
  for (const g of grants) union.add(g);
  const mids = opts?.memberId ? (union.has(opts.memberId) ? [opts.memberId] : []) : [...union];
  if (mids.length === 0) return [];
  const rows = await VitalReadingModel.find({ familyId, memberId: { $in: mids } })
    .sort({ recordedAt: -1 })
    .limit(limit)
    .lean();
  return rows.map((r) => mapVitalReading(r as never));
}

export async function listMedicationSlotsForViewer(
  familyId: string,
  ctx: ViewerContext,
  opts?: { memberId?: string; sinceDayKey?: string }
): Promise<MedicationSlot[]> {
  if (isHead(ctx)) {
    const filter: Record<string, unknown> = { familyId };
    if (opts?.memberId) filter.memberId = opts.memberId;
    if (opts?.sinceDayKey) filter.dayKey = { $gte: opts.sinceDayKey };
    const rows = await MedicationSlotModel.find(filter).sort({ dayKey: 1, slotHalf: 1 }).limit(800).lean();
    return rows.map((r) => mapMedicationSlot(r as never));
  }
  const [accessible, grants] = await Promise.all([
    listAccessibleMemberProfileIds(familyId, ctx),
    listGrantedMemberProfileIds(familyId, ctx.userId)
  ]);
  const union = new Set(accessible);
  for (const g of grants) union.add(g);
  const mids = opts?.memberId ? (union.has(opts.memberId) ? [opts.memberId] : []) : [...union];
  if (mids.length === 0) return [];
  const filter: Record<string, unknown> = { familyId, memberId: { $in: mids } };
  if (opts?.sinceDayKey) filter.dayKey = { $gte: opts.sinceDayKey };
  const rows = await MedicationSlotModel.find(filter).sort({ dayKey: 1, slotHalf: 1 }).limit(800).lean();
  return rows.map((r) => mapMedicationSlot(r as never));
}

export async function createVitalReading(
  familyId: string,
  payload: {
    memberId: string;
    kind: "blood_pressure" | "glucose";
    systolic?: number;
    diastolic?: number;
    mgDl?: number;
    recordedAt?: string;
    createdByUserId?: string;
  }
): Promise<VitalReading> {
  const m = await FamilyMemberModel.findOne({ _id: payload.memberId, familyId }).lean();
  if (!m) throw new Error("MEMBER_NOT_FOUND");
  if (payload.kind === "blood_pressure") {
    if (payload.systolic == null || Number.isNaN(Number(payload.systolic))) throw new Error("INVALID_VITAL");
  } else if (payload.kind === "glucose") {
    if (payload.mgDl == null || Number.isNaN(Number(payload.mgDl))) throw new Error("INVALID_VITAL");
  }
  const rec = await VitalReadingModel.create({
    familyId,
    memberId: payload.memberId,
    kind: payload.kind,
    systolic: payload.systolic,
    diastolic: payload.diastolic,
    mgDl: payload.mgDl,
    recordedAt: new Date(payload.recordedAt || new Date().toISOString()),
    createdByUserId: payload.createdByUserId
  });
  return mapVitalReading(rec);
}

export async function upsertMedicationSlot(
  familyId: string,
  payload: {
    memberId: string;
    dayKey: string;
    slotHalf: 0 | 1;
    status: "taken" | "missed" | "late" | "pending";
  }
): Promise<MedicationSlot> {
  const m = await FamilyMemberModel.findOne({ _id: payload.memberId, familyId }).lean();
  if (!m) throw new Error("MEMBER_NOT_FOUND");
  const row = await MedicationSlotModel.findOneAndUpdate(
    { familyId, memberId: payload.memberId, dayKey: payload.dayKey, slotHalf: payload.slotHalf },
    { $set: { status: payload.status } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!row) throw new Error("SLOT_UPSERT_FAILED");
  return mapMedicationSlot(row);
}

function mapWellnessPulseSession(doc: {
  _id: { toString: () => string };
  familyId: string;
  memberId: string;
  createdByUserId: string;
  heartRate: number;
  signalConfidence: number;
  sessionDurationSec: number;
  capturedAt: Date;
  waveformSamples?: number[] | null;
}): WellnessPulseSession {
  return {
    id: doc._id.toString(),
    familyId: doc.familyId,
    memberId: doc.memberId,
    createdByUserId: String(doc.createdByUserId),
    heartRate: doc.heartRate,
    signalConfidence: doc.signalConfidence,
    sessionDurationSec: doc.sessionDurationSec,
    capturedAt: doc.capturedAt.toISOString(),
    ...(Array.isArray(doc.waveformSamples) && doc.waveformSamples.length
      ? { waveformSamples: doc.waveformSamples.map((x) => Number(x)) }
      : {})
  };
}

/** Internal / jobs: list pulse rhythm snapshots for insight context (family-scoped). */
export async function listWellnessPulseSessionsForMember(
  familyId: string,
  memberId: string,
  opts?: { limit?: number; sinceDays?: number }
): Promise<WellnessPulseSession[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
  const sinceDays = Math.min(Math.max(opts?.sinceDays ?? 42, 1), 120);
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const rows = await WellnessPulseSessionModel.find({
    familyId,
    memberId,
    capturedAt: { $gte: since }
  })
    .sort({ capturedAt: -1 })
    .limit(limit)
    .lean();
  return rows.map((r) => mapWellnessPulseSession(r as never));
}

export async function listWellnessPulseSessionsForViewer(
  familyId: string,
  ctx: ViewerContext,
  opts?: { memberId?: string; limit?: number }
): Promise<WellnessPulseSession[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 100);
  if (isHead(ctx)) {
    const filter: Record<string, unknown> = { familyId };
    if (opts?.memberId) filter.memberId = opts.memberId;
    const rows = await WellnessPulseSessionModel.find(filter).sort({ capturedAt: -1 }).limit(limit).lean();
    return rows.map((r) => mapWellnessPulseSession(r as never));
  }
  const [accessible, grants] = await Promise.all([
    listAccessibleMemberProfileIds(familyId, ctx),
    listGrantedMemberProfileIds(familyId, ctx.userId)
  ]);
  const union = new Set(accessible);
  for (const g of grants) union.add(g);
  const mids = opts?.memberId ? (union.has(opts.memberId) ? [opts.memberId] : []) : [...union];
  if (mids.length === 0) return [];
  const rows = await WellnessPulseSessionModel.find({ familyId, memberId: { $in: mids } })
    .sort({ capturedAt: -1 })
    .limit(limit)
    .lean();
  return rows.map((r) => mapWellnessPulseSession(r as never));
}

export async function createWellnessPulseSession(
  familyId: string,
  payload: {
    memberId: string;
    createdByUserId: string;
    heartRate: number;
    signalConfidence: number;
    sessionDurationSec: number;
    capturedAt?: string;
    waveformSamples?: number[];
  }
): Promise<WellnessPulseSession> {
  const m = await FamilyMemberModel.findOne({ _id: payload.memberId, familyId }).lean();
  if (!m) throw new Error("MEMBER_NOT_FOUND");
  const wf =
    Array.isArray(payload.waveformSamples) && payload.waveformSamples.length
      ? payload.waveformSamples.slice(0, 128).map((x) => Number(x))
      : undefined;
  const rec = await WellnessPulseSessionModel.create({
    familyId,
    memberId: payload.memberId,
    createdByUserId: payload.createdByUserId,
    heartRate: payload.heartRate,
    signalConfidence: payload.signalConfidence,
    sessionDurationSec: payload.sessionDurationSec,
    capturedAt: new Date(payload.capturedAt || new Date().toISOString()),
    ...(wf?.length ? { waveformSamples: wf } : {})
  });
  return mapWellnessPulseSession(rec);
}

export async function listDashboardHealthForViewer(
  familyId: string,
  ctx: ViewerContext,
  opts?: { vitalsLimit?: number; slotDaysBack?: number }
): Promise<{ vitals: VitalReading[]; medicationSlots: MedicationSlot[] }> {
  const days = Math.min(Math.max(opts?.slotDaysBack ?? 10, 1), 30);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - days);
  const sinceDayKey = since.toISOString().slice(0, 10);
  const [vitals, medicationSlots] = await Promise.all([
    listVitalReadingsForViewer(familyId, ctx, { limit: opts?.vitalsLimit }),
    listMedicationSlotsForViewer(familyId, ctx, { sinceDayKey })
  ]);
  return { vitals, medicationSlots };
}

export async function listTimelineNarrativeEvents(
  familyId: string,
  memberId: string,
  ctx?: ViewerContext
): Promise<TimelineNarrativeEvent[]> {
  const logs = ctx ? await listLogsForViewer(familyId, ctx, memberId) : await listLogs(familyId, memberId);
  return buildTimelineNarrative(logs);
}

export async function getDoctorVisitSummary(
  familyId: string,
  memberId: string,
  days = 30,
  ctx?: ViewerContext
): Promise<DoctorSummaryDocument | null> {
  const member = await FamilyMemberModel.findOne({ _id: memberId, familyId });
  if (!member) return null;
  const boundedDays = Math.min(Math.max(days, 7), 90);
  const [logs, insights, timelineEvents, weeklyDigests] = await Promise.all([
    ctx ? listLogsForViewer(familyId, ctx, memberId) : listLogs(familyId, memberId),
    getLatestPrecomputedInsightsForMember(familyId, memberId),
    listTimelineNarrativeEvents(familyId, memberId, ctx),
    listDigestsForFamilyPerson(familyId, memberId)
  ]);
  return buildDoctorSummaryDocument({
    memberName: member.name,
    logs,
    insights,
    timelineEvents,
    weeklyDigests,
    days: boundedDays
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
    rawAudioMetadata?: VoiceRawAudioMetadata;
    contributorId?: string;
    contributorRole?: UserRole | FamilyRole;
    ownerUserId?: string;
    createdByUserId?: string;
    sourceType?: LogSourceType;
    visibility?: "private" | "family";
  }
): Promise<HealthLog> {
  const contributorId = String(payload.contributorId || payload.createdBy || "unknown");
  const createdByUserId = String(payload.createdByUserId || contributorId);
  const row = await FamilyMemberModel.findOne({ _id: payload.memberId, familyId })
    .select("linkedUserId")
    .lean();
  const subjectUserId = row?.linkedUserId ? String(row.linkedUserId) : undefined;
  const explicitSource = payload.sourceType;
  const sourceType: LogSourceType =
    explicitSource === "self" || explicitSource === "caregiver"
      ? explicitSource
      : subjectUserId && subjectUserId === createdByUserId
        ? "self"
        : "caregiver";
  const ownerUserId =
    payload.ownerUserId !== undefined && payload.ownerUserId !== ""
      ? String(payload.ownerUserId)
      : subjectUserId !== undefined
        ? subjectUserId
        : undefined;
  const visibility: "private" | "family" =
    payload.visibility === "family" || payload.visibility === "private"
      ? payload.visibility
      : sourceType === "self"
        ? "private"
        : "family";

  const log = await HealthLogModel.create({
    familyId,
    memberId: payload.memberId,
    createdBy: payload.createdBy,
    text: payload.text,
    type: payload.type,
    occurredAt: new Date(payload.occurredAt),
    transcript: payload.transcript,
    transcriptionStatus: payload.transcriptionStatus,
    audioUrl: payload.audioUrl,
    tags: payload.tags || [],
    audioBase64: payload.audioBase64,
    rawAudioMetadata: payload.rawAudioMetadata,
    contributorId,
    contributorRole: payload.contributorRole || "MEMBER",
    ownerUserId,
    createdByUserId,
    sourceType,
    visibility
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
  const existing = await HealthLogModel.findOne({ _id: logId, familyId });
  if (!existing) return null;
  const meta = existing.rawAudioMetadata as VoiceRawAudioMetadata | undefined | null;
  if (meta?.storage === "disk" && meta.fileExtension) {
    await deleteVoiceArtifactIfExists(logId, meta.fileExtension);
  }
  await HealthLogModel.deleteOne({ _id: logId, familyId });
  return mapLog(existing);
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

export async function listDigestsForFamilyPerson(familyId: string, personId: string): Promise<WeeklyDigest[]> {
  const rows = await WeeklyDigestModel.find({ familyId, personId }).sort({ generatedAt: -1 }).limit(36);
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

export async function getLatestPrecomputedInsightsForMember(familyId: string, personId: string): Promise<Insight[]> {
  const row = await PrecomputedInsightModel.findOne({ familyId, personId }).sort({ generatedAt: -1 });
  if (!row) return [];
  return ((row.insights as unknown[]) || []).map(mapStoredInsight).slice(0, 24);
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
  Array<{
    id: string;
    memberId: string;
    insightId: string;
    message: string;
    severity: "info" | "warning" | "alert";
    isRead: boolean;
    createdAt: string;
  }>
> {
  const results = await NotificationModel.find({ familyId }).sort({ createdAt: -1 }).limit(30);
  return results.map((item) => ({
    id: item._id.toString(),
    memberId: item.memberId,
    insightId: item.insightId,
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

export async function ensureFamilyWorkspaceRecord(familyId: string): Promise<FamilyWorkspace | null> {
  const existing = await FamilyWorkspaceModel.findOne({ familyId }).lean();
  if (existing) {
    return {
      familyId,
      name: existing.name,
      ...(existing.tagline != null && String(existing.tagline).trim()
        ? { tagline: String(existing.tagline).trim() }
        : {}),
      createdByUserId: String(existing.createdByUserId),
      createdAt:
        existing.createdAt instanceof Date ? existing.createdAt.toISOString() : new Date().toISOString()
    };
  }
  const owner = await UserModel.findOne({ familyId, role: "owner" }).sort({ createdAt: 1 });
  if (!owner) return null;
  const created = await FamilyWorkspaceModel.create({
    familyId,
    name: "Family workspace",
    createdByUserId: owner._id.toString()
  });
  return {
    familyId,
    name: created.name,
    ...(created.tagline != null && String(created.tagline).trim()
      ? { tagline: String(created.tagline).trim() }
      : {}),
    createdByUserId: String(created.createdByUserId),
    createdAt: created.createdAt?.toISOString() || new Date().toISOString()
  };
}

export async function updateFamilyWorkspaceMeta(
  familyId: string,
  patch: { name?: string; tagline?: string | null }
): Promise<FamilyWorkspace | null> {
  const set: Record<string, string> = {};
  if (typeof patch.name === "string") {
    const n = patch.name.trim();
    if (n.length > 0 && n.length <= 120) set.name = n;
  }
  if (patch.tagline === null) {
    await FamilyWorkspaceModel.updateOne({ familyId }, { $unset: { tagline: 1 } });
  } else if (typeof patch.tagline === "string") {
    const t = patch.tagline.trim().slice(0, 160);
    if (t.length === 0) {
      await FamilyWorkspaceModel.updateOne({ familyId }, { $unset: { tagline: 1 } });
    } else {
      set.tagline = t;
    }
  }
  if (Object.keys(set).length > 0) {
    await FamilyWorkspaceModel.updateOne({ familyId }, { $set: set });
  }
  return ensureFamilyWorkspaceRecord(familyId);
}

export async function requestJoinFamily(params: {
  targetFamilyId: string;
  email: string;
  name: string;
  password: string;
}): Promise<{ id: string }> {
  const targetFamilyId = params.targetFamilyId.trim();
  const famUser = await UserModel.findOne({ familyId: targetFamilyId });
  if (!famUser) throw new Error("FAMILY_NOT_FOUND");
  const normalized = params.email.toLowerCase();
  const dupUser = await UserModel.findOne({ email: normalized });
  if (dupUser) throw new Error("EMAIL_EXISTS");
  const pending = await JoinFamilyRequestModel.findOne({
    targetFamilyId,
    email: normalized,
    status: "pending"
  });
  if (pending) throw new Error("JOIN_PENDING");
  const passwordHash = await bcrypt.hash(params.password, 10);
  const row = await JoinFamilyRequestModel.create({
    targetFamilyId,
    email: normalized,
    name: params.name.trim().slice(0, 120),
    passwordHash,
    status: "pending"
  });
  const requestId = row._id.toString();
  try {
    await NotificationModel.create({
      familyId: targetFamilyId,
      memberId: "_workspace",
      insightId: `join_request:${requestId}`,
      message: `${params.name.trim()} (${normalized}) requested to join your family workspace. Open Family to approve or decline.`,
      severity: "info",
      isRead: false
    });
  } catch (err) {
    console.error("join-request notification insert failed", err);
  }
  return { id: requestId };
}

export async function listJoinFamilyRequests(familyId: string): Promise<JoinFamilyRequestRow[]> {
  const rows = await JoinFamilyRequestModel.find({
    targetFamilyId: familyId,
    status: "pending"
  })
    .sort({ createdAt: -1 })
    .limit(100);
  return rows.map((r) => ({
    id: r._id.toString(),
    targetFamilyId: r.targetFamilyId,
    email: r.email,
    name: r.name,
    status: r.status as JoinFamilyRequestRow["status"],
    createdAt: r.createdAt.toISOString()
  }));
}

export async function approveJoinFamilyRequest(
  familyId: string,
  requestId: string,
  headUserId: string,
  role: UserRole = "viewer"
): Promise<{
  id: string;
  familyId: string;
  email: string;
  name: string;
  role: UserRole;
  workspaceRole: WorkspaceRole;
  familyRole: FamilyRole;
}> {
  const reqRow = await JoinFamilyRequestModel.findOne({
    _id: requestId,
    targetFamilyId: familyId,
    status: "pending"
  });
  if (!reqRow) throw new Error("REQUEST_NOT_FOUND");
  const exists = await UserModel.findOne({ email: reqRow.email });
  if (exists) {
    const rid = reqRow._id.toString();
    await JoinFamilyRequestModel.deleteOne({ _id: reqRow._id });
    await NotificationModel.updateMany(
      { familyId, insightId: `join_request:${rid}` },
      { $set: { isRead: true } }
    ).catch(() => {});
    throw new Error("EMAIL_EXISTS");
  }
  const user = await UserModel.create({
    email: reqRow.email,
    name: reqRow.name,
    familyId,
    role,
    familyRole: "MEMBER",
    workspaceRole: "member",
    passwordHash: reqRow.passwordHash
  });
  await ensurePersonalHealthMember(user._id.toString(), familyId, reqRow.name);
  await JoinFamilyRequestModel.updateOne(
    { _id: requestId },
    {
      $set: { status: "approved", resolvedByUserId: headUserId, resolvedAt: new Date() },
      $unset: { passwordHash: 1 }
    }
  );
  await NotificationModel.updateMany(
    { familyId, insightId: `join_request:${requestId}` },
    { $set: { isRead: true } }
  ).catch(() => {});
  return {
    id: user._id.toString(),
    familyId,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    workspaceRole: "member",
    familyRole: "MEMBER"
  };
}

export async function rejectJoinFamilyRequest(
  familyId: string,
  requestId: string,
  headUserId: string
): Promise<void> {
  const r = await JoinFamilyRequestModel.findOneAndUpdate(
    { _id: requestId, targetFamilyId: familyId, status: "pending" },
    {
      $set: { status: "rejected", resolvedByUserId: headUserId, resolvedAt: new Date() },
      $unset: { passwordHash: 1 }
    },
    { new: true }
  );
  if (!r) throw new Error("REQUEST_NOT_FOUND");
  await NotificationModel.updateMany(
    { familyId, insightId: `join_request:${requestId}` },
    { $set: { isRead: true } }
  ).catch(() => {});
}

export async function createMemberLogAccessRequest(params: {
  familyId: string;
  requesterUserId: string;
  targetMemberId: string;
  requestedPermission: LogAccessPermissionLevel;
}): Promise<{ id: string }> {
  const member = await FamilyMemberModel.findOne({ _id: params.targetMemberId, familyId: params.familyId });
  if (!member) throw new Error("MEMBER_NOT_FOUND");
  const dup = await MemberLogAccessRequestModel.findOne({
    familyId: params.familyId,
    requesterUserId: params.requesterUserId,
    targetMemberId: params.targetMemberId,
    status: "pending"
  });
  if (dup) throw new Error("REQUEST_PENDING");
  const row = await MemberLogAccessRequestModel.create({
    familyId: params.familyId,
    requesterUserId: params.requesterUserId,
    targetMemberId: params.targetMemberId,
    requestedPermission: params.requestedPermission,
    status: "pending"
  });
  return { id: row._id.toString() };
}

export async function listMemberLogAccessRequests(familyId: string): Promise<MemberLogAccessRequestRow[]> {
  const rows = await MemberLogAccessRequestModel.find({ familyId, status: "pending" })
    .sort({ createdAt: -1 })
    .limit(100);
  return rows.map((r) => ({
    id: r._id.toString(),
    familyId: r.familyId,
    requesterUserId: r.requesterUserId,
    targetMemberId: r.targetMemberId,
    requestedPermission: r.requestedPermission as LogAccessPermissionLevel,
    status: r.status as MemberLogAccessRequestRow["status"],
    createdAt: r.createdAt.toISOString()
  }));
}

export async function approveMemberLogAccessRequest(
  familyId: string,
  requestId: string,
  headUserId: string
): Promise<LogAccessGrantRow> {
  const reqRow = await MemberLogAccessRequestModel.findOne({
    _id: requestId,
    familyId,
    status: "pending"
  });
  if (!reqRow) throw new Error("REQUEST_NOT_FOUND");
  await LogAccessGrantModel.updateMany(
    {
      familyId,
      granteeUserId: reqRow.requesterUserId,
      memberProfileId: reqRow.targetMemberId,
      active: true
    },
    { $set: { active: false } }
  );
  const grant = await LogAccessGrantModel.create({
    familyId,
    granteeUserId: reqRow.requesterUserId,
    memberProfileId: reqRow.targetMemberId,
    permission: reqRow.requestedPermission,
    grantedByUserId: headUserId,
    active: true
  });
  await MemberLogAccessRequestModel.updateOne(
    { _id: requestId },
    { $set: { status: "approved", resolvedByUserId: headUserId, resolvedAt: new Date() } }
  );
  return {
    id: grant._id.toString(),
    familyId: grant.familyId,
    granteeUserId: grant.granteeUserId,
    memberProfileId: grant.memberProfileId,
    permission: grant.permission as LogAccessPermissionLevel,
    grantedByUserId: grant.grantedByUserId,
    active: grant.active,
    createdAt: grant.createdAt.toISOString()
  };
}

export async function rejectMemberLogAccessRequest(
  familyId: string,
  requestId: string,
  headUserId: string
): Promise<void> {
  const r = await MemberLogAccessRequestModel.findOneAndUpdate(
    { _id: requestId, familyId, status: "pending" },
    { $set: { status: "rejected", resolvedByUserId: headUserId, resolvedAt: new Date() } },
    { new: true }
  );
  if (!r) throw new Error("REQUEST_NOT_FOUND");
}

export async function listLogAccessGrantsForUser(
  familyId: string,
  granteeUserId: string
): Promise<LogAccessGrantRow[]> {
  const rows = await LogAccessGrantModel.find({ familyId, granteeUserId, active: true });
  return rows.map((g) => ({
    id: g._id.toString(),
    familyId: g.familyId,
    granteeUserId: g.granteeUserId,
    memberProfileId: g.memberProfileId,
    permission: g.permission as LogAccessPermissionLevel,
    grantedByUserId: g.grantedByUserId,
    active: g.active,
    createdAt: g.createdAt.toISOString()
  }));
}

export async function getLogByIdForViewer(
  familyId: string,
  logId: string,
  ctx: ViewerContext
): Promise<HealthLog | null> {
  const log = await getLogById(familyId, logId);
  if (!log) return null;
  const visible = await listLogsForViewer(familyId, ctx, log.memberId);
  return visible.some((l) => l.id === logId) ? log : null;
}

export async function migrateEnsurePersonalHealthMembers(): Promise<void> {
  const users = await UserModel.find({ familyId: { $exists: true, $nin: [null, ""] } });
  for (const u of users) {
    try {
      await ensurePersonalHealthMember(u._id.toString(), String(u.familyId), u.name);
    } catch (e) {
      console.error("migrateEnsurePersonalHealthMembers user failed", u._id, e);
    }
  }
}

/** Backfill `familyRole` for legacy users; ensure each family still has at least one HEAD. */
export async function migrateUsersToFamilyRoles(): Promise<void> {
  const users = await UserModel.find({
    familyId: { $exists: true, $nin: [null, ""] }
  });
  for (const u of users) {
    if (!u.familyRole) {
      u.familyRole = deriveFamilyRoleFromLegacy(u.role, u.workspaceRole);
      await u.save();
    }
  }
  const familyIds = await UserModel.distinct("familyId", { familyId: { $nin: [null, ""] } });
  for (const fid of familyIds) {
    if (!fid) continue;
    const headCount = await UserModel.countDocuments({ familyId: fid, familyRole: "HEAD" });
    if (headCount === 0) {
      const first = await UserModel.findOne({ familyId: fid }).sort({ createdAt: 1 });
      if (first) {
        first.familyRole = "HEAD";
        first.workspaceRole = "head";
        first.role = "owner";
        await first.save();
      }
    }
  }
}

export async function updateUserProfile(
  userId: string,
  patch: { name?: string; description?: string | null; profilePictureUrl?: string | null }
): Promise<Awaited<ReturnType<typeof mapUserToAuthProfile>>> {
  const u = await UserModel.findById(userId);
  if (!u) throw new Error("USER_NOT_FOUND");
  if (patch.name !== undefined) u.name = patch.name.trim().slice(0, 120);
  if (patch.description !== undefined) u.description = patch.description?.trim().slice(0, 2000) || undefined;
  if (patch.profilePictureUrl !== undefined) u.profilePictureUrl = patch.profilePictureUrl || undefined;
  await u.save();
  return mapUserToAuthProfile(u);
}

/** Remove user from their family (session must be refreshed). Fails if sole HEAD. */
export async function leaveFamily(userId: string): Promise<void> {
  const u = await UserModel.findById(userId);
  if (!u?.familyId) throw new Error("NO_FAMILY");
  const fr = (u.familyRole as FamilyRole) || deriveFamilyRoleFromLegacy(u.role, u.workspaceRole);
  if (fr === "HEAD") {
    const others = await UserModel.countDocuments({
      familyId: u.familyId,
      familyRole: "HEAD",
      _id: { $ne: userId }
    });
    if (others < 1) throw new Error("LAST_HEAD");
  }
  const fid = String(u.familyId);
  const selfMembers = await FamilyMemberModel.find({ familyId: fid, linkedUserId: userId }).select("_id").lean();
  const selfIds = selfMembers.map((m) => String(m._id));
  if (selfIds.length) {
    await HealthLogModel.deleteMany({ familyId: fid, memberId: { $in: selfIds } });
    await FamilyMemberModel.deleteMany({ familyId: fid, linkedUserId: userId });
  }
  await UserModel.findByIdAndUpdate(userId, {
    $unset: { familyId: 1, familyRole: 1, workspaceRole: 1 },
    $set: { role: "viewer" }
  });
}
