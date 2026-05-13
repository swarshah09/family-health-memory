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
      return "View only";
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
    "log.create.text": "Added a text note",
    "log.create.voice": "Added a voice note",
    "log.update": "Updated a note",
    "log.delete": "Removed a note",
    "member.create": "Added someone to the family list",
    "member.update": "Updated a profile",
    "member.delete": "Removed someone from the family list",
    "user.invite": "Updated a team member",
    "user.invite.pending": "Sent an invitation",
    "user.role.change": "Changed a role",
    "user.role.update": "Changed a team role",
    "user.family_role.update": "Changed how someone participates",
    "family.join_request.approved": "Approved a request to join",
    "family.join_request.rejected": "Declined a request to join",
    "memory.search": "Searched family notes",
    "insight.fetch.precomputed": "Opened patterns",
    "care_guidance.fetch": "Opened care suggestions",
    "digest.generate.manual": "Created a weekly summary",
    "chat.log.api.ingest": "Saved a shared message as a note",
    "automation.run.manual": "Ran a reminder check",
    "automation.settings.update": "Updated reminder settings",
    "chat.ingest": "Submitted a shared message",
    "chat.ingest.resolve": "Linked a message to someone",
    "chat.ingest.dismiss": "Dismissed a message from review",
    "member_access.requested": "Asked to help with someone’s care",
    "member_access.approved": "Approved help for a family member",
    "member_access.rejected": "Declined help for a family member"
  };
  return map[action] || "Activity in the app";
}

/** Short label for audit / activity target types (avoid raw backend names in UI). */
export function formatActivityTargetType(targetType: string): string {
  const map: Record<string, string> = {
    member: "Family member",
    log: "Health note",
    user: "Team member",
    care_guidance: "Care suggestions",
    family: "Family",
    invitation: "Invitation",
    join_request: "Join request",
    notification: "Reminder"
  };
  return map[targetType] || "Record";
}
