import type { UserRole, WorkspaceRole, FamilyRole } from "./types.js";

/** Derive HEAD/MEMBER from legacy Mongo fields (pre-migration or mixed data). */
export function deriveFamilyRoleFromLegacy(role?: string | null, workspaceRole?: string | null): FamilyRole {
  if (role === "owner" || workspaceRole === "head") return "HEAD";
  return "MEMBER";
}

export function isHeadRole(r: FamilyRole): boolean {
  return r === "HEAD";
}

/** @deprecated Legacy workspace label for API responses; prefer familyRole. */
export function resolveWorkspaceRole(role: UserRole, explicit?: string | null): WorkspaceRole {
  if (role === "owner") return "head";
  if (explicit === "head" || explicit === "member") return explicit;
  return "member";
}
