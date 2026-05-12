/** Legacy API roles (invitations / old logs). */
export type ApiFamilyRole = "owner" | "caregiver" | "viewer";

export type FamilyPermissionRole = "HEAD" | "MEMBER";

export type LogSourceTypeUi = "self" | "caregiver";

export function isHeadUser(user?: {
  familyRole?: FamilyPermissionRole;
  role?: ApiFamilyRole;
  workspaceRole?: "head" | "member";
} | null): boolean {
  if (!user) return false;
  if (user.familyRole === "HEAD") return true;
  if (user.familyRole === "MEMBER") return false;
  return user.role === "owner" || user.workspaceRole === "head";
}

export function displayRoleLabel(role: ApiFamilyRole | FamilyPermissionRole | string): string {
  if (role === "HEAD") return "Head";
  if (role === "MEMBER") return "Member";
  switch (role as ApiFamilyRole) {
    case "owner":
      return "Admin";
    case "caregiver":
      return "Contributor";
    case "viewer":
      return "Viewer";
    default:
      return String(role);
  }
}

/** True if the user may create logs (HEAD or MEMBER). */
export function canCreateHealthLogs(user?: { familyRole?: FamilyPermissionRole; familyId?: string } | null): boolean {
  return Boolean(user?.familyId);
}

export function inferLogSourceTypeUi(log: {
  sourceType?: LogSourceTypeUi;
  ownerUserId?: string;
  createdByUserId?: string;
  contributorId: string;
}): LogSourceTypeUi {
  if (log.sourceType === "self" || log.sourceType === "caregiver") return log.sourceType;
  const by = log.createdByUserId || log.contributorId;
  const own = log.ownerUserId;
  if (own && by && own === by) return "self";
  return "caregiver";
}

/**
 * Edit/delete in UI: self logs only by subject; caregiver observations by HEAD or the author.
 */
export function canModifyLogInUi(
  user: { id?: string; familyRole?: FamilyPermissionRole; role?: ApiFamilyRole; workspaceRole?: "head" | "member" } | null,
  log: { contributorId: string; ownerUserId?: string; createdByUserId?: string; sourceType?: LogSourceTypeUi }
): boolean {
  if (!user?.id) return false;
  const st = inferLogSourceTypeUi(log);
  const createdBy = log.createdByUserId || log.contributorId;
  const subject = log.ownerUserId || log.contributorId;

  if (st === "self") {
    if (log.ownerUserId) return user.id === log.ownerUserId;
    return user.id === createdBy;
  }
  if (isHeadUser(user)) return true;
  return createdBy === user.id;
}

/** @deprecated Use isHeadUser for workspace governance. */
export function canEditHealthLogs(role?: ApiFamilyRole): boolean {
  return role === "owner" || role === "caregiver";
}

/** @deprecated Use isHeadUser */
export function canManageMembersAndLogs(role?: ApiFamilyRole): boolean {
  return role === "owner" || role === "caregiver";
}

/** Human-readable audit action for the activity feed. */
export function formatActivityAction(action: string): string {
  const map: Record<string, string> = {
    "auth.login": "Signed in",
    "auth.signup": "Created account",
    "auth.invitation.accept": "Accepted invitation",
    "log.create.text": "Added text log",
    "log.create.voice": "Added voice log",
    "log.update": "Updated log",
    "log.delete": "Deleted log",
    "member.create": "Added family member",
    "member.update": "Updated member profile",
    "member.delete": "Removed member",
    "user.invite": "Updated team member",
    "user.invite.pending": "Sent invitation",
    "user.role.change": "Changed role",
    "user.family_role.update": "Changed workspace role",
    "family.join_request.approved": "Approved join request",
    "family.join_request.rejected": "Declined join request",
    "memory.search": "Asked health memory"
  };
  return map[action] || action.replace(/\./g, " ");
}
