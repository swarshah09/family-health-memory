import type { FamilyMember } from "@/context/AppContext";
import { canLogForMemberProfile, isHeadUser, type FamilyPermissionRole } from "@/lib/collaboration-roles";

export type LogAuthorUser = {
  id?: string;
  familyId?: string;
  familyRole?: FamilyPermissionRole;
  role?: "owner" | "caregiver" | "viewer";
  workspaceRole?: "head" | "member";
};

function writableMembers(members: FamilyMember[], user: LogAuthorUser | null | undefined): FamilyMember[] {
  if (!user?.id) return [];
  return members.filter((m) => canLogForMemberProfile(user, m));
}

/**
 * Choose who a new observation should be for:
 * 1. Active dashboard filter (if allowed for this user)
 * 2. Signed-in user's personal health profile (MEMBER) or first allowed profile (HEAD)
 */
export function pickDefaultLogMemberId(
  members: FamilyMember[],
  userId: string | undefined,
  dashboardPeopleFilterId: string | null,
  user?: LogAuthorUser | null
): string | null {
  const allowed = writableMembers(members, user);
  if (!allowed.length) return null;

  if (dashboardPeopleFilterId) {
    const filtered = allowed.find((m) => m.id === dashboardPeopleFilterId);
    if (filtered) return filtered.id;
  }

  if (userId) {
    const self = allowed.find((m) => m.linkedUserId === userId);
    if (self) return self.id;
  }

  return allowed[0]?.id ?? null;
}

/** Profiles this user may attach a new log to (self first for members). */
export function listLogMemberOptions(
  members: FamilyMember[],
  userId: string | undefined,
  user?: LogAuthorUser | null
): FamilyMember[] {
  const allowed = writableMembers(members, user);
  const self = userId ? allowed.find((m) => m.linkedUserId === userId) : undefined;
  const others = allowed
    .filter((m) => m.id !== self?.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return self ? [self, ...others] : allowed;
}

export function logMemberLabel(member: FamilyMember, userId: string | undefined): string {
  if (userId && member.linkedUserId === userId) {
    return `${member.name} (you)`;
  }
  return member.name;
}

export function canOpenAddLogDialog(members: FamilyMember[], user?: LogAuthorUser | null): boolean {
  return writableMembers(members, user).length > 0;
}

export function isFamilyHeadForLogging(user?: LogAuthorUser | null): boolean {
  return isHeadUser(user ?? null);
}
