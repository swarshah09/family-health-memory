import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";
import type { FamilyRole, UserRole, WorkspaceRole } from "./types.js";
import {
  authMiddleware,
  createRefreshToken,
  hashRefreshToken,
  requireFamilyRole,
  signAccessToken,
  type AuthTokenPayload
} from "./auth.js";
import {
  canEditHealthLog,
  isHead,
  listAccessibleMemberProfileIds,
  type ViewerContext
} from "./workspace-permissions.js";
import { deriveFamilyRoleFromLegacy, resolveWorkspaceRole } from "./family-roles.js";
import { getAIObservabilitySummary } from "./ai-observability.js";
import { listAuditLogs, writeAuditLog } from "./audit.js";
import { ingestChatStyleLog } from "./chat-input.js";
import { generateWeeklyDigestForUserPerson } from "./insight-precompute.js";
import { startInsightJobs } from "./jobs.js";
import { HealthLogModel, RefreshTokenModel, UserModel } from "./models.js";
import { processVoiceLogTranscriptionAsync } from "./voice-processing.js";
import { readVoiceArtifact, writeVoiceArtifact } from "./voice-storage.js";
import { renderDoctorSummaryPdf } from "./doctor-summary-export/pdfDocument.js";
import { runMemorySearch } from "./health-memory-search.js";
import { generateCareGuidance } from "./care-guidance/index.js";
import {
  createLog,
  createMember,
  deleteLog,
  deleteFamilyMemberIfAllowed,
  updateMember,
  getLogById,
  getLogByIdForViewer,
  getLatestInsightsSnapshot,
  getAutomationSettings,
  getAutomationStatus,
  getDoctorVisitSummary,
  listDigestsForUserPerson,
  listPrecomputedInsightsForUser,
  listLogs,
  listLogsForViewer,
  updateLog,
  listMembers,
  listNotifications,
  listContextualReengagementPrompts,
  listTimelineNarrativeEvents,
  listFamilyUsers,
  ingestChatMessage,
  listPendingChatIngestReviews,
  resolveChatIngestMessage,
  dismissChatIngestMessage,
  markNotificationRead,
  inviteFamilyUser,
  acceptFamilyInvitation,
  getInvitationPreviewByToken,
  listFamilyActivity,
  login,
  runAutomationAnalysis,
  signup,
  updateAutomationSettings,
  updateFamilyUserRole,
  ensureFamilyWorkspaceRecord,
  requestJoinFamily,
  listJoinFamilyRequests,
  approveJoinFamilyRequest,
  rejectJoinFamilyRequest,
  createMemberLogAccessRequest,
  listMemberLogAccessRequests,
  approveMemberLogAccessRequest,
  rejectMemberLogAccessRequest,
  listLogAccessGrantsForUser,
  migrateUsersToFamilyRoles,
  migrateEnsurePersonalHealthMembers,
  setUserFamilyRole,
  updateUserProfile,
  leaveFamily,
  ensurePersonalHealthMember
} from "./store.js";

const app = express();
const port = Number(process.env.PORT || 4000);

function viewerFromAuth(auth: AuthTokenPayload): ViewerContext {
  const familyRole =
    auth.familyRole ?? deriveFamilyRoleFromLegacy(auth.role, auth.workspaceRole ?? null);
  return { userId: auth.userId, familyRole };
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_AUDIO_FILE_BYTES || 8 * 1024 * 1024)
  }
});
const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_PROFILE_PHOTO_BYTES || 2 * 1024 * 1024) }
});
const mongoUri = process.env.MONGODB_URI;
const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);

if (!mongoUri) {
  throw new Error("MONGODB_URI is required");
}
await mongoose.connect(mongoUri);
await migrateUsersToFamilyRoles().catch((err) => console.error("migrateUsersToFamilyRoles", err));
await migrateEnsurePersonalHealthMembers().catch((err) =>
  console.error("migrateEnsurePersonalHealthMembers", err)
);

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : "*"
  })
);
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 8000);
app.use(
  rateLimit({
    windowMs: Number.isFinite(rateLimitWindowMs) && rateLimitWindowMs > 0 ? rateLimitWindowMs : 15 * 60 * 1000,
    max: Number.isFinite(rateLimitMax) && rateLimitMax > 0 ? rateLimitMax : 8000,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));
startInsightJobs();

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "family-health-memory-api",
    /** Bump when adding routes so clients can tell an old deploy from a new one */
    apiCapabilities: {
      memorySearch: true,
      conversationalMemoryPostPath: "/api/families/:familyId/memory-search"
    }
  });
});

const authSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  familyName: z.string().min(1).max(120).optional()
});

app.post("/api/auth/signup", async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid auth payload", issues: parsed.error.issues });
  }
  try {
    const user = await signup(parsed.data.email, parsed.data.name, parsed.data.password, parsed.data.familyName);
    const accessToken = signAccessToken({
      userId: user.id,
      ...(user.familyId ? { familyId: user.familyId } : {}),
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceRole: user.workspaceRole as WorkspaceRole,
      familyRole: user.familyRole as FamilyRole
    });
    const refresh = createRefreshToken();
    await RefreshTokenModel.create({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt
    });
    if (user.familyId) {
      await writeAuditLog({
        familyId: user.familyId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "auth.signup",
        targetType: "user",
        targetId: user.id,
        metadata: { role: user.role, familyRole: user.familyRole }
      });
    }
    return res.status(201).json({ user, accessToken, refreshToken: refresh.rawToken });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_EXISTS") {
      return res.status(409).json({ message: "Email already exists" });
    }
    return res.status(500).json({ message: "Signup failed" });
  }
});

const requestFamilyMembershipSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(6),
  targetFamilyId: z
    .string()
    .min(8)
    .max(80)
    .transform((s) => s.trim())
});

app.post("/api/auth/request-family-membership", async (req, res) => {
  const parsed = requestFamilyMembershipSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const { id } = await requestJoinFamily(parsed.data);
    return res.status(202).json({
      pending: true,
      id,
      message:
        "Your request was sent to the family organizer. After they approve it, sign in with the same email and password you used here."
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FAMILY_NOT_FOUND") {
      return res.status(404).json({ message: "No workspace found for that family ID." });
    }
    if (error instanceof Error && error.message === "EMAIL_EXISTS") {
      return res.status(409).json({ message: "That email already has an account." });
    }
    if (error instanceof Error && error.message === "JOIN_PENDING") {
      return res.status(409).json({ message: "You already have a pending request for this family." });
    }
    return res.status(500).json({ message: "Could not submit request" });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid auth payload", issues: parsed.error.issues });
  }
  try {
    const user = await login(parsed.data.email, parsed.data.password);
    const accessToken = signAccessToken({
      userId: user.id,
      ...(user.familyId ? { familyId: user.familyId } : {}),
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceRole: user.workspaceRole as WorkspaceRole,
      familyRole: user.familyRole as FamilyRole
    });
    const refresh = createRefreshToken();
    await RefreshTokenModel.create({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt
    });
    if (user.familyId) {
      await writeAuditLog({
        familyId: user.familyId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "auth.login",
        targetType: "user",
        targetId: user.id
      });
    }
    return res.json({ user, accessToken, refreshToken: refresh.rawToken });
  } catch {
    return res.status(401).json({ message: "Invalid credentials" });
  }
});

const acceptInviteSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(6),
  name: z.string().min(1).max(120).optional()
});

app.post("/api/auth/accept-invitation", async (req, res) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid accept-invite payload", issues: parsed.error.issues });
  }
  try {
    const user = await acceptFamilyInvitation(parsed.data.token, parsed.data.password, parsed.data.name);
    const accessToken = signAccessToken({
      userId: user.id,
      ...(user.familyId ? { familyId: user.familyId } : {}),
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceRole: user.workspaceRole as WorkspaceRole,
      familyRole: user.familyRole as FamilyRole
    });
    const refresh = createRefreshToken();
    await RefreshTokenModel.create({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt
    });
    if (user.familyId) {
      await writeAuditLog({
        familyId: user.familyId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "auth.invitation.accept",
        targetType: "user",
        targetId: user.id
      });
    }
    return res.status(201).json({ user, accessToken, refreshToken: refresh.rawToken });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITE_INVALID_OR_EXPIRED") {
      return res.status(400).json({ message: "Invalid or expired invitation" });
    }
    if (error instanceof Error && error.message === "EMAIL_ALREADY_REGISTERED") {
      return res.status(409).json({ message: "This email already has an account. Sign in instead." });
    }
    return res.status(500).json({ message: "Could not accept invitation" });
  }
});

app.get("/api/invitations/preview", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token.trim()) return res.status(400).json({ message: "token query parameter is required" });
  const preview = await getInvitationPreviewByToken(token);
  if (!preview) return res.status(404).json({ message: "Invalid or expired invitation" });
  return res.json({ invitation: preview });
});

const refreshSchema = z.object({
  refreshToken: z.string().min(16)
});

app.post("/api/auth/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid refresh payload" });

  const refreshTokenHash = hashRefreshToken(parsed.data.refreshToken);
  const existing = await RefreshTokenModel.findOne({
    tokenHash: refreshTokenHash,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() }
  });
  if (!existing) return res.status(401).json({ message: "Invalid refresh token" });

  const user = await UserModel.findById(existing.userId);
  if (!user) return res.status(401).json({ message: "User not found" });

  existing.revokedAt = new Date();
  await existing.save();

  const nextRefresh = createRefreshToken();
  await RefreshTokenModel.create({
    userId: existing.userId,
    tokenHash: nextRefresh.tokenHash,
    expiresAt: nextRefresh.expiresAt
  });

  const familyRole =
    (user.familyRole as FamilyRole) ||
    deriveFamilyRoleFromLegacy(String(user.role) as UserRole, (user.workspaceRole as string | undefined) ?? null);
  const accessToken = signAccessToken({
    userId: String(user._id),
    ...(user.familyId ? { familyId: String(user.familyId) } : {}),
    email: String(user.email),
    name: String(user.name),
    role: String(user.role) as UserRole,
    workspaceRole: resolveWorkspaceRole(
      String(user.role) as UserRole,
      (user.workspaceRole as string | undefined) ?? null
    ) as WorkspaceRole,
    familyRole
  });

  return res.json({ accessToken, refreshToken: nextRefresh.rawToken });
});

app.post("/api/auth/logout", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(204).send();
  const refreshTokenHash = hashRefreshToken(parsed.data.refreshToken);
  await RefreshTokenModel.updateOne(
    { tokenHash: refreshTokenHash, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
  return res.status(204).send();
});

const meProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable()
});

app.patch("/api/me/profile", authMiddleware, async (req, res) => {
  const parsed = meProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid profile payload", issues: parsed.error.issues });
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  try {
    const user = await updateUserProfile(auth.userId, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {})
    });
    return res.json({ user });
  } catch (e) {
    if (e instanceof Error && e.message === "USER_NOT_FOUND") return res.status(404).json({ message: "User not found" });
    return res.status(500).json({ message: "Profile update failed" });
  }
});

app.post("/api/me/profile-photo", authMiddleware, profilePhotoUpload.single("photo"), async (req, res) => {
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const file = req.file;
  if (!file?.buffer?.length) return res.status(400).json({ message: "Photo file is required" });
  const dir = process.env.PROFILE_UPLOAD_DIR || path.join(process.cwd(), "data", "profile-images");
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file.originalname || "").replace(/[^.a-zA-Z0-9]/g, "") || ".jpg";
  const fname = `${auth.userId}-${Date.now()}${ext.slice(0, 8)}`;
  const abs = path.join(dir, fname);
  fs.writeFileSync(abs, file.buffer);
  const publicUrl = `/api/profile-images/${encodeURIComponent(fname)}`;
  try {
    const user = await updateUserProfile(auth.userId, { profilePictureUrl: publicUrl });
    return res.json({ user });
  } catch (e) {
    try {
      fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
    if (e instanceof Error && e.message === "USER_NOT_FOUND") return res.status(404).json({ message: "User not found" });
    return res.status(500).json({ message: "Could not save profile photo" });
  }
});

app.get("/api/profile-images/:filename", async (req, res) => {
  const raw = req.params.filename;
  const safe = path.basename(decodeURIComponent(raw));
  if (!safe || safe !== decodeURIComponent(raw)) return res.status(400).send("Invalid filename");
  const dir = process.env.PROFILE_UPLOAD_DIR || path.join(process.cwd(), "data", "profile-images");
  const abs = path.join(dir, safe);
  if (!abs.startsWith(path.resolve(dir))) return res.status(400).send("Invalid path");
  if (!fs.existsSync(abs)) return res.status(404).send("Not found");
  res.sendFile(abs);
});

app.post("/api/auth/leave-family", authMiddleware, async (req, res) => {
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  if (!auth.familyId) return res.status(400).json({ message: "You are not currently in a family workspace." });
  try {
    await leaveFamily(auth.userId);
    return res.status(204).send();
  } catch (e) {
    if (e instanceof Error && e.message === "LAST_HEAD") {
      return res.status(409).json({
        message: "Another member must be HEAD before you can leave. Promote someone else to HEAD first."
      });
    }
    if (e instanceof Error && e.message === "NO_FAMILY") return res.status(400).json({ message: "No family to leave." });
    return res.status(500).json({ message: "Could not leave family" });
  }
});

app.post("/api/me/ensure-personal-health-member", authMiddleware, async (req, res) => {
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  if (!auth.familyId) return res.status(400).json({ message: "Join a family workspace first." });
  const member = await ensurePersonalHealthMember(auth.userId, auth.familyId, auth.name);
  return res.json({ member });
});

app.get("/api/digests/:userId/:personId", authMiddleware, async (req, res) => {
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  if (!auth?.familyId) return res.status(403).json({ message: "Join a family workspace to use this feature." });
  const targetUser = await UserModel.findById(req.params.userId);
  if (!targetUser || String(targetUser.familyId) !== auth.familyId) {
    return res.status(404).json({ message: "Digest owner not found" });
  }
  const digests = await listDigestsForUserPerson(auth.familyId, req.params.userId, req.params.personId);
  return res.json({ digests });
});

app.post("/api/digests/:userId/:personId/generate", authMiddleware, async (req, res) => {
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  if (!auth?.familyId) return res.status(403).json({ message: "Join a family workspace to use this feature." });
  const targetUser = await UserModel.findById(req.params.userId);
  if (!targetUser || String(targetUser.familyId) !== auth.familyId) {
    return res.status(404).json({ message: "Digest owner not found" });
  }
  const digest = await generateWeeklyDigestForUserPerson({
    userId: req.params.userId,
    personId: req.params.personId
  });
  if (!digest) return res.status(404).json({ message: "Member not found for digest generation" });
  await writeAuditLog({
    familyId: auth.familyId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    action: "digest.generate.manual",
    targetType: "weekly_digest",
    targetId: `${req.params.userId}:${req.params.personId}`,
    metadata: { generatedAt: digest.generatedAt.toISOString() }
  });
  return res.status(201).json({
    digest: {
      title: digest.title,
      summary: digest.summary,
      highlights: digest.highlights,
      generatedAt: digest.generatedAt.toISOString()
    }
  });
});

const chatLogApiSchema = z.object({
  userId: z.string().min(1),
  message: z.string().min(1)
});

app.post("/api/logs/chat", authMiddleware, async (req, res) => {
  const parsed = chatLogApiSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid chat log payload" });

  const auth = req as { auth?: { userId: string; role: "owner" | "caregiver" | "viewer"; familyId: string; email: string } };
  const canWriteForOtherUser = auth.auth?.role === "owner";
  if (!canWriteForOtherUser && auth.auth?.userId !== parsed.data.userId) {
    return res.status(403).json({ message: "Cannot submit chat logs for another user" });
  }

  try {
    await ingestChatStyleLog({
      userId: parsed.data.userId,
      message: parsed.data.message
    });
    await writeAuditLog({
      familyId: auth.auth?.familyId || "unknown",
      actorUserId: auth.auth?.userId || "unknown",
      actorEmail: auth.auth?.email || "unknown",
      action: "chat.log.api.ingest",
      targetType: "chat_input",
      targetId: parsed.data.userId,
      metadata: { messageLength: parsed.data.message.length }
    });
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      return res.status(404).json({ message: "User not found" });
    }
    if (error instanceof Error && error.message === "EMPTY_MESSAGE") {
      return res.status(400).json({ message: "Message is empty" });
    }
    console.error("Failed to ingest /api/logs/chat", error);
    return res.status(500).json({ message: "Failed to ingest chat log" });
  }
});

const memorySearchBodySchema = z.object({
  query: z.string().min(2).max(2000),
  memberId: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(12000)
      })
    )
    .max(14)
    .optional()
});

/** Register before `app.use("/api/families/:familyId", …)` so POST always matches with explicit auth. */
app.post(
  "/api/families/:familyId/memory-search",
  authMiddleware,
  requireFamilyRole(["HEAD", "MEMBER"]),
  async (req, res) => {
    if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
      return res.status(403).json({ message: "Forbidden family access" });
    }
    const parsed = memorySearchBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid memory search payload" });
    const auth = req as { auth?: { userId: string; email: string } };
    try {
      const authPayload = (req as { auth?: AuthTokenPayload }).auth;
      if (!authPayload) return res.status(401).json({ message: "Unauthorized" });
      const result = await runMemorySearch({
        familyId: req.params.familyId,
        query: parsed.data.query.trim(),
        memberId: parsed.data.memberId?.trim() || undefined,
        history: parsed.data.history,
        viewer: viewerFromAuth(authPayload)
      });
      await writeAuditLog({
        familyId: req.params.familyId,
        actorUserId: auth.auth?.userId || "unknown",
        actorEmail: auth.auth?.email || "unknown",
        action: "memory.search",
        targetType: "memory_query",
        metadata: {
          queryChars: parsed.data.query.length,
          memberScoped: Boolean(parsed.data.memberId),
          logsConsidered: result.logsConsidered,
          modelDisabled: Boolean(result.modelDisabled)
        }
      });
      return res.json({ result });
    } catch (error) {
      console.error("memory-search failed", error);
      return res.status(500).json({ message: "Memory search failed" });
    }
  }
);

app.use("/api/families/:familyId", authMiddleware);

const aiObservabilityQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional()
});

app.get("/api/families/:familyId/ai-observability", requireFamilyRole(["HEAD"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsed = aiObservabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "Invalid observability query payload" });
  const summary = await getAIObservabilitySummary(req.params.familyId, parsed.data.days || 7);
  res.json(summary);
});

app.get("/api/families/:familyId/users", requireFamilyRole(["HEAD", "MEMBER"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  res.json({ users: await listFamilyUsers(req.params.familyId) });
});

app.get("/api/families/:familyId/activity", requireFamilyRole(["HEAD", "MEMBER"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
  const events = await listFamilyActivity(req.params.familyId, limit);
  return res.json({ events });
});

app.get("/api/families/:familyId/workspace", requireFamilyRole(["HEAD", "MEMBER"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const familyId = req.params.familyId;
  const family = await ensureFamilyWorkspaceRecord(familyId);
  const members = await listMembers(familyId);
  const head = isHead(viewerFromAuth(auth));
  const [joinRequests, accessRequests, myGrants, activity] = await Promise.all([
    head ? listJoinFamilyRequests(familyId) : Promise.resolve([]),
    head ? listMemberLogAccessRequests(familyId) : Promise.resolve([]),
    listLogAccessGrantsForUser(familyId, auth.userId),
    listFamilyActivity(familyId, 30)
  ]);
  res.json({
    family,
    members,
    joinRequests,
    accessRequests,
    myGrants,
    activity
  });
});

/** Pending join requests only (heads). Keeps dashboard/dock counts aligned with Family workspace. */
app.get("/api/families/:familyId/join-requests", requireFamilyRole(["HEAD"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const joinRequests = await listJoinFamilyRequests(req.params.familyId);
  res.json({ joinRequests });
});

const joinApproveSchema = z.object({ role: z.enum(["caregiver", "viewer"]).optional() });

app.post(
  "/api/families/:familyId/join-requests/:requestId/approve",
  requireFamilyRole(["HEAD"]),
  async (req, res) => {
    if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
      return res.status(403).json({ message: "Forbidden family access" });
    }
    const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
    const parsed = joinApproveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
    try {
      const user = await approveJoinFamilyRequest(
        req.params.familyId,
        req.params.requestId,
        auth.userId,
        parsed.data.role || "viewer"
      );
      await writeAuditLog({
        familyId: req.params.familyId,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        action: "family.join_request.approved",
        targetType: "join_request",
        targetId: req.params.requestId,
        metadata: { newUserId: user.id }
      });
      res.status(201).json({ user });
    } catch (e) {
      if (e instanceof Error && e.message === "REQUEST_NOT_FOUND") return res.status(404).json({ message: "Request not found" });
      if (e instanceof Error && e.message === "EMAIL_EXISTS") return res.status(409).json({ message: "Email conflict" });
      res.status(500).json({ message: "Approve failed" });
    }
  }
);

app.post(
  "/api/families/:familyId/join-requests/:requestId/reject",
  requireFamilyRole(["HEAD"]),
  async (req, res) => {
    if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
      return res.status(403).json({ message: "Forbidden family access" });
    }
    const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
    try {
      await rejectJoinFamilyRequest(req.params.familyId, req.params.requestId, auth.userId);
      await writeAuditLog({
        familyId: req.params.familyId,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        action: "family.join_request.rejected",
        targetType: "join_request",
        targetId: req.params.requestId
      });
      res.status(204).send();
    } catch (e) {
      if (e instanceof Error && e.message === "REQUEST_NOT_FOUND") return res.status(404).json({ message: "Request not found" });
      res.status(500).json({ message: "Reject failed" });
    }
  }
);

const memberAccessRequestSchema = z.object({
  targetMemberId: z.string().min(1),
  requestedPermission: z.enum(["VIEW_ONLY", "CONTRIBUTOR", "FULL_ACCESS"])
});

app.post(
  "/api/families/:familyId/member-access-requests",
  requireFamilyRole(["HEAD", "MEMBER"]),
  async (req, res) => {
    if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
      return res.status(403).json({ message: "Forbidden family access" });
    }
    const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
    const parsed = memberAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
    try {
      const { id } = await createMemberLogAccessRequest({
        familyId: req.params.familyId,
        requesterUserId: auth.userId,
        targetMemberId: parsed.data.targetMemberId,
        requestedPermission: parsed.data.requestedPermission
      });
      await writeAuditLog({
        familyId: req.params.familyId,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        action: "member_access.requested",
        targetType: "member_profile",
        targetId: parsed.data.targetMemberId,
        metadata: { requestId: id, permission: parsed.data.requestedPermission }
      });
      res.status(201).json({ id });
    } catch (e) {
      if (e instanceof Error && e.message === "MEMBER_NOT_FOUND") return res.status(404).json({ message: "Member not found" });
      if (e instanceof Error && e.message === "REQUEST_PENDING") return res.status(409).json({ message: "Request already pending" });
      res.status(500).json({ message: "Could not create request" });
    }
  }
);

app.post(
  "/api/families/:familyId/member-access-requests/:requestId/approve",
  requireFamilyRole(["HEAD"]),
  async (req, res) => {
    if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
      return res.status(403).json({ message: "Forbidden family access" });
    }
    const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
    try {
      const grant = await approveMemberLogAccessRequest(req.params.familyId, req.params.requestId, auth.userId);
      await writeAuditLog({
        familyId: req.params.familyId,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        action: "member_access.approved",
        targetType: "log_access_grant",
        targetId: grant.id,
        metadata: { granteeUserId: grant.granteeUserId, memberProfileId: grant.memberProfileId }
      });
      res.status(201).json({ grant });
    } catch (e) {
      if (e instanceof Error && e.message === "REQUEST_NOT_FOUND") return res.status(404).json({ message: "Request not found" });
      res.status(500).json({ message: "Approve failed" });
    }
  }
);

app.post(
  "/api/families/:familyId/member-access-requests/:requestId/reject",
  requireFamilyRole(["HEAD"]),
  async (req, res) => {
    if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
      return res.status(403).json({ message: "Forbidden family access" });
    }
    const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
    try {
      await rejectMemberLogAccessRequest(req.params.familyId, req.params.requestId, auth.userId);
      await writeAuditLog({
        familyId: req.params.familyId,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        action: "member_access.rejected",
        targetType: "member_access_request",
        targetId: req.params.requestId
      });
      res.status(204).send();
    } catch (e) {
      if (e instanceof Error && e.message === "REQUEST_NOT_FOUND") return res.status(404).json({ message: "Request not found" });
      res.status(500).json({ message: "Reject failed" });
    }
  }
);

const roleUpdateSchema = z.object({
  role: z.enum(["owner", "caregiver", "viewer"]),
  currentPassword: z.string().min(6).optional()
});

app.patch("/api/families/:familyId/users/:userId/role", requireFamilyRole(["HEAD"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsed = roleUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid role payload" });
  const auth = req as { auth?: { userId: string; email: string } };
  const actorUser = await UserModel.findOne({ _id: auth.auth?.userId, familyId: req.params.familyId });
  const targetUser = await UserModel.findOne({ _id: req.params.userId, familyId: req.params.familyId });
  if (!actorUser || !targetUser) return res.status(404).json({ message: "User not found" });

  const ownerRoleSensitive = targetUser.role === "owner" || parsed.data.role === "owner";
  if (ownerRoleSensitive) {
    if (!parsed.data.currentPassword) {
      return res.status(400).json({ message: "Current password is required for owner role changes" });
    }
    const ok = await bcrypt.compare(parsed.data.currentPassword, actorUser.passwordHash);
    if (!ok) return res.status(401).json({ message: "Current password is incorrect" });
  }

  if (targetUser.role === "owner" && parsed.data.role !== "owner") {
    const otherOwner = await UserModel.findOne({
      familyId: req.params.familyId,
      role: "owner",
      _id: { $ne: req.params.userId }
    });
    if (!otherOwner) {
      return res.status(409).json({ message: "Assign another owner before changing this owner role" });
    }
  }

  await updateFamilyUserRole(req.params.familyId, req.params.userId, parsed.data.role);
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: auth.auth?.userId || "unknown",
    actorEmail: auth.auth?.email || "unknown",
    action: "user.role.update",
    targetType: "user",
    targetId: req.params.userId,
    metadata: { role: parsed.data.role }
  });
  return res.status(204).send();
});

const familyRoleUpdateSchema = z.object({
  familyRole: z.enum(["HEAD", "MEMBER"])
});

app.patch(
  "/api/families/:familyId/users/:userId/family-role",
  requireFamilyRole(["HEAD"]),
  async (req, res) => {
    if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
      return res.status(403).json({ message: "Forbidden family access" });
    }
    const parsed = familyRoleUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid family role payload" });
    const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
    try {
      await setUserFamilyRole(req.params.familyId, auth.userId, req.params.userId, parsed.data.familyRole);
      await writeAuditLog({
        familyId: req.params.familyId,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        action: "user.family_role.update",
        targetType: "user",
        targetId: req.params.userId,
        metadata: { familyRole: parsed.data.familyRole, targetUserId: req.params.userId }
      });
      return res.status(204).send();
    } catch (e) {
      if (e instanceof Error && e.message === "LAST_HEAD") {
        return res.status(409).json({ message: "At least one HEAD must remain in the family." });
      }
      if (e instanceof Error && e.message === "USER_NOT_FOUND") return res.status(404).json({ message: "User not found" });
      return res.status(500).json({ message: "Role update failed" });
    }
  }
);

const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["caregiver", "viewer"]).default("viewer")
});

app.post("/api/families/:familyId/users/invite", requireFamilyRole(["HEAD"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsed = inviteUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid invite payload" });
  const auth = req as { auth?: { userId: string; email: string } };
  try {
    const invited = await inviteFamilyUser(
      req.params.familyId,
      parsed.data.email,
      parsed.data.name,
      parsed.data.role,
      auth.auth?.userId || "unknown"
    );
    if (invited.status === "pending") {
      await writeAuditLog({
        familyId: req.params.familyId,
        actorUserId: auth.auth?.userId || "unknown",
        actorEmail: auth.auth?.email || "unknown",
        action: "user.invite.pending",
        targetType: "invitation",
        targetId: invited.invitationId,
        metadata: { role: invited.role, email: invited.email }
      });
      const base = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
      const acceptUrl = `${base}/accept-invite?token=${encodeURIComponent(invited.rawToken)}`;
      return res.status(201).json({
        invitation: {
          id: invited.invitationId,
          email: invited.email,
          inviteeName: invited.inviteeName,
          role: invited.role,
          expiresAt: invited.expiresAt,
          acceptUrl
        }
      });
    }
    await writeAuditLog({
      familyId: req.params.familyId,
      actorUserId: auth.auth?.userId || "unknown",
      actorEmail: auth.auth?.email || "unknown",
      action: "user.invite",
      targetType: "user",
      targetId: invited.id,
      metadata: { role: invited.role, email: invited.email }
    });
    return res.status(201).json({
      user: { id: invited.id, email: invited.email, name: invited.name, role: invited.role }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_IN_OTHER_FAMILY") {
      return res.status(409).json({ message: "This email already belongs to another family" });
    }
    if (error instanceof Error && error.message === "INVITE_ROLE_NOT_ALLOWED") {
      return res.status(400).json({ message: "Invalid role for invitation" });
    }
    return res.status(500).json({ message: "Failed to invite user" });
  }
});

app.get("/api/families/:familyId/members", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const all = await listMembers(req.params.familyId);
  res.json({ members: all });
});

const addMemberSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
  relationship: z.string().min(1),
  notes: z.string().optional()
});

const careCollaboratorSchema = z.object({
  userId: z.string().min(1),
  note: z.string().max(500).optional(),
  since: z.string().datetime().optional()
});

const updateMemberSchema = z
  .object({
    name: z.string().min(1).optional(),
    age: z.number().int().positive().optional(),
    relationship: z.string().min(1).optional(),
    notes: z.string().optional(),
    careCollaborators: z.array(careCollaboratorSchema).optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

app.post("/api/families/:familyId/members", requireFamilyRole(["HEAD"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid member payload" });
  const member = await createMember(req.params.familyId, parsed.data);
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "member.create",
    targetType: "member",
    targetId: member.id
  });
  return res.status(201).json({ member });
});

app.delete("/api/families/:familyId/members/:memberId", requireFamilyRole(["HEAD"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  try {
    await deleteFamilyMemberIfAllowed(req.params.familyId, req.params.memberId);
  } catch (e) {
    if (e instanceof Error && e.message === "LINKED_MEMBER_DELETE_FORBIDDEN") {
      return res.status(409).json({
        message: "Personal health profiles cannot be deleted from the team list. They are removed when the user leaves the family."
      });
    }
    if (e instanceof Error && e.message === "MEMBER_NOT_FOUND") {
      return res.status(404).json({ message: "Member not found" });
    }
    throw e;
  }
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "member.delete",
    targetType: "member",
    targetId: req.params.memberId
  });
  res.status(204).send();
});

app.patch("/api/families/:familyId/members/:memberId", requireFamilyRole(["HEAD"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsed = updateMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid member update payload" });
  const updated = await updateMember(req.params.familyId, req.params.memberId, parsed.data);
  if (!updated) return res.status(404).json({ message: "Member not found" });

  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "member.update",
    targetType: "member",
    targetId: req.params.memberId,
    metadata: { updatedFields: Object.keys(parsed.data) }
  });
  res.json({ member: updated });
});

app.get("/api/families/:familyId/logs", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const memberId = typeof req.query.memberId === "string" ? req.query.memberId : undefined;
  res.json({ logs: await listLogsForViewer(req.params.familyId, viewerFromAuth(auth), memberId) });
});

app.get("/api/families/:familyId/logs/:logId/audio", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const log = await getLogByIdForViewer(req.params.familyId, req.params.logId, viewerFromAuth(auth));
  if (!log || log.type !== "voice") {
    return res.status(404).json({ message: "Not found" });
  }
  const meta = log.rawAudioMetadata;
  if (!meta || meta.storage !== "disk" || !meta.fileExtension) {
    return res.status(404).json({ message: "No stored audio for this log" });
  }
  const buf = await readVoiceArtifact(log.id, meta.fileExtension);
  if (!buf) return res.status(404).json({ message: "Audio file missing" });
  res.setHeader("Content-Type", meta.mimeType || "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(buf);
});

app.get("/api/families/:familyId/timeline/:memberId", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const events = await listTimelineNarrativeEvents(
    req.params.familyId,
    req.params.memberId,
    viewerFromAuth(auth)
  );
  res.json({ events });
});

app.get("/api/families/:familyId/doctor-summary/:memberId", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const days = Number(req.query.days || 30);
  const doctorSummary = await getDoctorVisitSummary(
    req.params.familyId,
    req.params.memberId,
    days,
    viewerFromAuth(auth)
  );
  if (!doctorSummary) return res.status(404).json({ message: "Member not found" });
  res.json({ doctorSummary });
});

app.get("/api/families/:familyId/doctor-summary/:memberId/export.pdf", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const days = Number(req.query.days || 30);
  const doctorSummary = await getDoctorVisitSummary(
    req.params.familyId,
    req.params.memberId,
    days,
    viewerFromAuth(auth)
  );
  if (!doctorSummary) return res.status(404).json({ message: "Member not found" });
  try {
    const pdfBuffer = await renderDoctorSummaryPdf(doctorSummary);
    const safeSlug = doctorSummary.title
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeSlug || "doctor-summary"}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("doctor-summary pdf export failed", error);
    return res.status(500).json({ message: "PDF export failed" });
  }
});

const addLogSchema = z.object({
  memberId: z.string().min(1),
  createdBy: z.string().default("family-user"),
  text: z.string().min(3),
  type: z.enum(["text", "voice"]),
  occurredAt: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(["private", "family"]).optional()
});

app.post("/api/families/:familyId/logs", requireFamilyRole(["HEAD", "MEMBER"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const parsed = addLogSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid log payload" });
  const familyRole =
    auth.familyRole ?? deriveFamilyRoleFromLegacy(auth.role, auth.workspaceRole ?? null);
  const log = await createLog(req.params.familyId, {
    ...parsed.data,
    contributorId: auth.userId,
    contributorRole: familyRole,
    createdByUserId: auth.userId,
    occurredAt: parsed.data.occurredAt || new Date().toISOString(),
    ...(parsed.data.visibility ? { visibility: parsed.data.visibility } : {})
  });
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "log.create.text",
    targetType: "log",
    targetId: log.id,
    metadata: { memberId: log.memberId }
  });
  return res.status(201).json({ log });
});

const updateLogSchema = z.object({
  text: z.string().min(3),
  tags: z.array(z.string()).optional()
});

app.patch("/api/families/:familyId/logs/:logId", requireFamilyRole(["HEAD", "MEMBER"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const ctx = viewerFromAuth(auth);
  const existing = await getLogByIdForViewer(req.params.familyId, req.params.logId, ctx);
  if (!existing) return res.status(404).json({ message: "Log not found" });
  const canEdit = canEditHealthLog(ctx, {
    ownerUserId: existing.ownerUserId,
    contributorId: existing.contributorId,
    createdByUserId: existing.createdByUserId,
    sourceType: existing.sourceType
  });
  if (!canEdit) return res.status(403).json({ message: "Not allowed to edit this log" });
  const parsed = updateLogSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid log update payload" });
  const updated = await updateLog(req.params.familyId, req.params.logId, parsed.data);
  if (!updated) return res.status(404).json({ message: "Log not found" });
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "log.update",
    targetType: "log",
    targetId: req.params.logId,
    metadata: { memberId: updated.memberId }
  });
  return res.json({ log: updated });
});

app.delete("/api/families/:familyId/logs/:logId", requireFamilyRole(["HEAD", "MEMBER"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const ctx = viewerFromAuth(auth);
  const existing = await getLogByIdForViewer(req.params.familyId, req.params.logId, ctx);
  if (!existing) return res.status(404).json({ message: "Log not found" });
  const canDelete = canEditHealthLog(ctx, {
    ownerUserId: existing.ownerUserId,
    contributorId: existing.contributorId,
    createdByUserId: existing.createdByUserId,
    sourceType: existing.sourceType
  });
  if (!canDelete) return res.status(403).json({ message: "Not allowed to delete this log" });
  const removed = await deleteLog(req.params.familyId, req.params.logId);
  if (!removed) return res.status(404).json({ message: "Log not found" });
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "log.delete",
    targetType: "log",
    targetId: req.params.logId,
    metadata: { memberId: removed.memberId, type: removed.type }
  });
  return res.status(204).send();
});

const audioClientMetaSchema = z.object({
  durationSec: z.number().positive().optional(),
  source: z.enum(["recording", "upload"]).optional()
});

app.post(
  "/api/families/:familyId/logs/voice",
  requireFamilyRole(["HEAD", "MEMBER"]),
  upload.single("audio"),
  async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = (req as unknown as { auth: AuthTokenPayload }).auth;
  const bodySchema = z.object({
    memberId: z.string().min(1),
    createdBy: z.string().default("family-user"),
    transcript: z.string().min(3).optional(),
    audioClientMeta: z.string().optional()
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid voice log payload" });

  const file = req.file;
  if (!file && !parsed.data.transcript) {
    return res.status(400).json({ message: "Audio file or transcript is required" });
  }

  let clientMeta: z.infer<typeof audioClientMetaSchema> | undefined;
  if (parsed.data.audioClientMeta?.trim()) {
    try {
      const raw = JSON.parse(parsed.data.audioClientMeta) as unknown;
      const checked = audioClientMetaSchema.safeParse(raw);
      if (checked.success) clientMeta = checked.data;
    } catch {
      clientMeta = undefined;
    }
  }

  const transcript = parsed.data.transcript || "Voice note received. Transcription in progress.";
  const audioBase64 = file?.buffer?.toString("base64");

  const familyRole =
    auth.familyRole ?? deriveFamilyRoleFromLegacy(auth.role, auth.workspaceRole ?? null);
  const log = await createLog(req.params.familyId, {
    memberId: parsed.data.memberId,
    createdBy: parsed.data.createdBy,
    contributorId: auth.userId || parsed.data.createdBy,
    createdByUserId: auth.userId,
    contributorRole: familyRole,
    text: transcript,
    type: "voice",
    occurredAt: new Date().toISOString(),
    transcript: parsed.data.transcript || undefined,
    transcriptionStatus: parsed.data.transcript ? "completed" : file ? "processing" : "pending",
    rawAudioMetadata: file
      ? {
          mimeType: file.mimetype || "audio/webm",
          sizeBytes: file.size,
          storage: "disk",
          uploadedAt: new Date().toISOString(),
          durationSec: clientMeta?.durationSec,
          clientSource: clientMeta?.source
        }
      : undefined
  });

  if (file?.buffer) {
    try {
      const ext = await writeVoiceArtifact(log.id, file.buffer, file.mimetype || "audio/webm");
      const audioPath = `/api/families/${req.params.familyId}/logs/${log.id}/audio`;
      await HealthLogModel.updateOne(
        { _id: log.id, familyId: req.params.familyId },
        {
          $set: {
            audioUrl: audioPath,
            rawAudioMetadata: {
              mimeType: file.mimetype || "audio/webm",
              sizeBytes: file.size,
              storage: "disk",
              uploadedAt: new Date().toISOString(),
              fileExtension: ext,
              durationSec: clientMeta?.durationSec,
              clientSource: clientMeta?.source
            }
          },
          $unset: { audioBase64: "" }
        }
      );
    } catch (err) {
      console.error("Voice artifact persist failed; keeping inline base64 reference", err);
      await HealthLogModel.updateOne(
        { _id: log.id, familyId: req.params.familyId },
        {
          $set: {
            audioBase64,
            rawAudioMetadata: {
              mimeType: file.mimetype || "audio/webm",
              sizeBytes: file.size,
              storage: "inline",
              uploadedAt: new Date().toISOString(),
              durationSec: clientMeta?.durationSec,
              clientSource: clientMeta?.source
            }
          }
        }
      );
    }
  }

  if (!parsed.data.transcript && file && audioBase64) {
    processVoiceLogTranscriptionAsync({
      logId: log.id,
      familyId: req.params.familyId,
      memberId: parsed.data.memberId,
      mimeType: file.mimetype || "audio/webm",
      audioBase64
    });
  }

  const saved = await getLogById(req.params.familyId, log.id);

  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "log.create.voice",
    targetType: "log",
    targetId: log.id,
    metadata: { memberId: log.memberId }
  });
  res.status(202).json({ log: saved || log });
});

const insightsQuerySchema = z.object({
  debug: z.coerce.number().int().min(0).max(1).optional()
});

app.get("/api/families/:familyId/insights", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsedQuery = insightsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) return res.status(400).json({ message: "Invalid insights query payload" });
  const authPayload = (req as unknown as { auth: AuthTokenPayload }).auth;
  const ctx = viewerFromAuth(authPayload);
  const includeDebug = parsedQuery.data.debug === 1;
  if (includeDebug && !isHead(ctx)) {
    return res.status(403).json({ message: "Debug insights are head-only" });
  }
  const precomputedInsights = await listPrecomputedInsightsForUser(req.params.familyId, authPayload.userId);
  const visibleMemberIds = new Set(await listAccessibleMemberProfileIds(req.params.familyId, ctx));
  const members = await listMembers(req.params.familyId);
  const linkedByMember = new Map(members.map((m) => [m.id, m.linkedUserId]));
  const filteredInsights = isHead(ctx)
    ? precomputedInsights
    : precomputedInsights.filter((ins) => {
        const subjectUser = linkedByMember.get(ins.memberId);
        if (subjectUser && subjectUser !== authPayload.userId) return false;
        return visibleMemberIds.has(ins.memberId);
      });
  const insightsForResponse = includeDebug
    ? filteredInsights
    : filteredInsights.map((ins) => {
        const { decisionReasons: _debugDecisionReasons, ...safe } = ins;
        return safe;
      });
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: authPayload.userId,
    actorEmail: authPayload.email,
    action: "insight.fetch.precomputed",
    targetType: "insight_batch",
    metadata: { debug: includeDebug }
  });
  res.json({ insights: insightsForResponse });
});

app.get("/api/families/:familyId/care-guidance", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const authPayload = (req as unknown as { auth: AuthTokenPayload }).auth;
  const [logs, members] = await Promise.all([
    listLogsForViewer(req.params.familyId, viewerFromAuth(authPayload)),
    listMembers(req.params.familyId)
  ]);
  const memberNames = new Map(members.map((m) => [m.id, m.name]));
  const slim = logs.map((l) => ({
    id: l.id,
    memberId: l.memberId,
    occurredAt: l.occurredAt,
    text: l.text,
    transcript: l.transcript
  }));
  const guidance = generateCareGuidance(slim, memberNames);
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: authPayload.userId,
    actorEmail: authPayload.email,
    action: "care_guidance.fetch",
    targetType: "care_guidance",
    metadata: { itemCount: guidance.items.length }
  });
  res.json(guidance);
});

app.get("/api/families/:familyId/insights/latest", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const snapshot = await getLatestInsightsSnapshot(req.params.familyId);
  res.json({ insights: snapshot || [] });
});

app.get("/api/families/:familyId/automation/status", requireFamilyRole(["HEAD", "MEMBER"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const [status, settings] = await Promise.all([
    getAutomationStatus(req.params.familyId),
    getAutomationSettings(req.params.familyId)
  ]);
  res.json({ status, settings });
});

app.post("/api/families/:familyId/automation/run", requireFamilyRole(["HEAD", "MEMBER"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const result = await runAutomationAnalysis(req.params.familyId, "manual");
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "automation.run.manual",
    targetType: "automation",
    metadata: result
  });
  res.status(201).json({ run: result });
});

const automationSettingsSchema = z.object({
  minMentions: z.number().int().min(1).max(10).optional(),
  minConfidence: z.number().min(0.1).max(1).optional(),
  notificationsEnabled: z.boolean().optional()
});

app.patch("/api/families/:familyId/automation/settings", requireFamilyRole(["HEAD"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsed = automationSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid automation settings payload" });
  await updateAutomationSettings(req.params.familyId, parsed.data);
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "automation.settings.update",
    targetType: "automation_settings",
    metadata: parsed.data
  });
  res.status(204).send();
});

app.get("/api/families/:familyId/notifications", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const notifications = await listNotifications(req.params.familyId);
  res.json({ notifications });
});

app.get("/api/families/:familyId/reengagement-prompts", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const prompts = await listContextualReengagementPrompts(req.params.familyId);
  res.json({ prompts });
});

app.patch("/api/families/:familyId/notifications/:notificationId/read", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  await markNotificationRead(req.params.familyId, req.params.notificationId);
  res.status(204).send();
});

const auditQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(300).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  action: z.string().trim().min(1).optional(),
  actorEmail: z.string().trim().email().optional()
});

app.get("/api/families/:familyId/audit-logs", requireFamilyRole(["HEAD"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "Invalid audit query payload" });
  const { rows, total } = await listAuditLogs(req.params.familyId, parsed.data);
  res.json({ auditLogs: rows, total, offset: parsed.data.offset || 0, limit: parsed.data.limit || 80 });
});

const chatIngestSchema = z.object({
  senderName: z.string().min(1),
  text: z.string().min(2)
});

app.post("/api/families/:familyId/chat/ingest", requireFamilyRole(["HEAD", "MEMBER"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsed = chatIngestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid chat ingest payload" });
  const result = await ingestChatMessage(req.params.familyId, parsed.data.senderName, parsed.data.text);
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "chat.ingest",
    targetType: "chat_message",
    targetId: result.messageId,
    metadata: { logCreated: result.logCreated, matchedMemberId: result.matchedMemberId || null }
  });
  res.status(201).json({ result });
});

app.get("/api/families/:familyId/chat/pending-review", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const pending = await listPendingChatIngestReviews(req.params.familyId);
  res.json({ pending });
});

const chatResolveSchema = z.object({
  memberId: z.string().min(1)
});

app.post(
  "/api/families/:familyId/chat/:messageId/resolve",
  requireFamilyRole(["HEAD", "MEMBER"]),
  async (req, res) => {
    if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
      return res.status(403).json({ message: "Forbidden family access" });
    }
    const parsed = chatResolveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid resolve payload" });
    const auth = req as { auth?: { email: string; userId: string } };
    const createdBy = auth.auth?.email || "chat-review";
    try {
      const { logId } = await resolveChatIngestMessage(
        req.params.familyId,
        req.params.messageId,
        parsed.data.memberId,
        createdBy
      );
      await writeAuditLog({
        familyId: req.params.familyId,
        actorUserId: auth.auth?.userId || "unknown",
        actorEmail: auth.auth?.email || "unknown",
        action: "chat.ingest.resolve",
        targetType: "chat_message",
        targetId: req.params.messageId,
        metadata: { logId, memberId: parsed.data.memberId }
      });
      res.status(201).json({ log: { id: logId } });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "CHAT_MESSAGE_NOT_FOUND" || code === "MEMBER_NOT_FOUND") {
        return res.status(404).json({ message: "Not found" });
      }
      if (
        code === "CHAT_ALREADY_LOGGED" ||
        code === "CHAT_ALREADY_RESOLVED" ||
        code === "CHAT_DISMISSED"
      ) {
        return res.status(409).json({ message: "Message cannot be resolved" });
      }
      throw err;
    }
  }
);

app.post(
  "/api/families/:familyId/chat/:messageId/dismiss",
  requireFamilyRole(["HEAD", "MEMBER"]),
  async (req, res) => {
    if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
      return res.status(403).json({ message: "Forbidden family access" });
    }
    const auth = req as { auth?: { email: string; userId: string } };
    try {
      await dismissChatIngestMessage(req.params.familyId, req.params.messageId);
      await writeAuditLog({
        familyId: req.params.familyId,
        actorUserId: auth.auth?.userId || "unknown",
        actorEmail: auth.auth?.email || "unknown",
        action: "chat.ingest.dismiss",
        targetType: "chat_message",
        targetId: req.params.messageId
      });
      res.status(204).send();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "CHAT_MESSAGE_NOT_FOUND") {
        return res.status(404).json({ message: "Not found" });
      }
      if (
        code === "CHAT_ALREADY_LOGGED" ||
        code === "CHAT_ALREADY_RESOLVED" ||
        code === "CHAT_ALREADY_DISMISSED"
      ) {
        return res.status(409).json({ message: "Message cannot be dismissed" });
      }
      throw err;
    }
  }
);

app.listen(port, () => {
  console.log(`Family Health Memory API running on http://localhost:${port}`);
});
