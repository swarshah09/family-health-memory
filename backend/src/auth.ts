import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import type { FamilyRole, UserRole, WorkspaceRole } from "./types.js";
import { deriveFamilyRoleFromLegacy } from "./family-roles.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || "30");

export interface AuthTokenPayload {
  userId: string;
  /** Omitted when the user is not currently in a family workspace. */
  familyId?: string;
  email: string;
  name: string;
  /** @deprecated Legacy field; prefer familyRole. */
  role: UserRole;
  workspaceRole?: WorkspaceRole;
  familyRole?: FamilyRole;
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"]
  });
}

export function createRefreshToken(): { rawToken: string; tokenHash: string; expiresAt: Date } {
  const rawToken = crypto.randomBytes(48).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { rawToken, tokenHash, expiresAt };
}

export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }
  const token = authHeader.replace("Bearer ", "");
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    if (!payload.familyRole) {
      payload.familyRole = deriveFamilyRoleFromLegacy(payload.role, payload.workspaceRole ?? null);
    }
    (req as Request & { auth?: AuthTokenPayload }).auth = payload;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

/** @deprecated Prefer requireFamilyRole */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as Request & { auth?: AuthTokenPayload }).auth?.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export function requireFamilyRole(allowed: FamilyRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as Request & { auth?: AuthTokenPayload }).auth;
    const fr =
      auth?.familyRole ?? deriveFamilyRoleFromLegacy(auth?.role, auth?.workspaceRole ?? null);
    if (!auth || !fr || !allowed.includes(fr)) {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }
    next();
  };
}
