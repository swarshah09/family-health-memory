import type { FamilyRole, LogSourceType } from "./types.js";
import { FamilyMemberModel, HealthLogModel, LogAccessGrantModel } from "./models.js";

export type WorkspaceRole = "head" | "member";

export type ViewerContext = {
  userId: string;
  familyRole: FamilyRole;
};

export function isHead(ctx: ViewerContext): boolean {
  return ctx.familyRole === "HEAD";
}

/** @deprecated Use isHead + FamilyRole */
export function isFamilyHead(ctx: ViewerContext): boolean {
  return isHead(ctx);
}

/** Effective visibility for legacy documents without the field. */
export function effectiveLogVisibility(raw: { visibility?: string | null }): "private" | "family" {
  const v = raw.visibility;
  if (v === "private" || v === "family") return v;
  return "family";
}

export async function listGrantedMemberProfileIds(familyId: string, granteeUserId: string): Promise<string[]> {
  const rows = await LogAccessGrantModel.find({
    familyId,
    granteeUserId,
    active: true
  }).lean();
  return [...new Set(rows.map((r) => String(r.memberProfileId)))];
}

/** All care profiles in the family (HEAD and MEMBER may read logs across the family, subject to My Health rules). */
export async function listAllFamilyMemberProfileIds(familyId: string): Promise<string[]> {
  const members = await FamilyMemberModel.find({ familyId }).select("_id").lean();
  return members.map((m) => String(m._id));
}

export async function listAccessibleMemberProfileIds(familyId: string, _ctx: ViewerContext): Promise<string[]> {
  return listAllFamilyMemberProfileIds(familyId);
}

export async function userCanViewMemberProfile(
  familyId: string,
  ctx: ViewerContext,
  memberProfileId: string
): Promise<boolean> {
  const allowed = await listAccessibleMemberProfileIds(familyId, ctx);
  return allowed.includes(memberProfileId);
}

export async function userHasGrantPermission(
  familyId: string,
  granteeUserId: string,
  memberProfileId: string,
  need: "VIEW_ONLY" | "CONTRIBUTOR" | "FULL_ACCESS"
): Promise<boolean> {
  const row = await LogAccessGrantModel.findOne({
    familyId,
    granteeUserId,
    memberProfileId,
    active: true
  }).lean();
  if (!row) return false;
  const p = row.permission as string;
  const rank = { VIEW_ONLY: 1, CONTRIBUTOR: 2, FULL_ACCESS: 3 };
  return rank[p as keyof typeof rank] >= rank[need];
}

type LeanLog = {
  memberId?: unknown;
  contributorId?: unknown;
  ownerUserId?: unknown;
  createdByUserId?: unknown;
  sourceType?: string | null;
  visibility?: string | null;
};

export function inferLogSourceType(doc: {
  sourceType?: string | null;
  ownerUserId?: unknown;
  createdByUserId?: unknown;
  contributorId?: unknown;
}): LogSourceType {
  if (doc.sourceType === "self" || doc.sourceType === "caregiver") return doc.sourceType;
  const by = String(doc.createdByUserId || doc.contributorId || "");
  const own = String(doc.ownerUserId || "");
  if (own && by && own === by) return "self";
  return "caregiver";
}

/**
 * Another user's linked "My Health" profile: peers may see caregiver observations,
 * not that person's self-authored private entries.
 */
export function profileAllowsLogForViewer(
  ctx: ViewerContext,
  memberLinkedUserId: string | undefined,
  doc: LeanLog
): boolean {
  if (isHead(ctx)) return true;
  if (!memberLinkedUserId) return true;
  if (ctx.userId === memberLinkedUserId) return true;
  return inferLogSourceType(doc) !== "self";
}

/** HEAD may edit caregiver observations; self logs only editable by the subject user. MEMBER may edit own caregiver notes. */
export function canEditHealthLog(
  ctx: ViewerContext,
  doc: {
    ownerUserId?: unknown;
    contributorId?: unknown;
    createdByUserId?: unknown;
    sourceType?: string | null;
  }
): boolean {
  const st = inferLogSourceType(doc);
  const uid = ctx.userId;
  const createdBy = String(doc.createdByUserId || doc.contributorId || "");
  const subject = String(doc.ownerUserId || "");

  if (st === "self") {
    if (!subject) return createdBy === uid;
    return subject === uid;
  }
  if (isHead(ctx)) return true;
  return createdBy === uid;
}

/** Fast path when `accessible` + `grant` member sets are already loaded for this request. */
export function canSeeLogWithSets(doc: LeanLog, ctx: ViewerContext, grantSet: Set<string>, accSet: Set<string>): boolean {
  if (isHead(ctx)) return true;
  const mid = String(doc.memberId ?? "");
  if (!mid) return false;
  if (!accSet.has(mid)) return false;
  if (grantSet.has(mid)) return true;
  const uid = ctx.userId;
  const own =
    String(doc.contributorId || "") === uid || String(doc.ownerUserId || doc.contributorId || "") === uid;
  if (own) return true;
  return effectiveLogVisibility(doc) === "family";
}

export async function buildMemberLinkedUserMap(familyId: string): Promise<Map<string, string | undefined>> {
  const rows = await FamilyMemberModel.find({ familyId }).select("_id linkedUserId").lean();
  return new Map(rows.map((r) => [String(r._id), r.linkedUserId ? String(r.linkedUserId) : undefined]));
}
