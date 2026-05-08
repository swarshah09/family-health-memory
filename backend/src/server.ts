import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";
import {
  authMiddleware,
  createRefreshToken,
  hashRefreshToken,
  requireRole,
  signAccessToken
} from "./auth.js";
import { getAIObservabilitySummary } from "./ai-observability.js";
import { listAuditLogs, writeAuditLog } from "./audit.js";
import { ingestChatStyleLog } from "./chat-input.js";
import { transcribeAudioWithGemini } from "./gemini.js";
import { generateWeeklyDigestForUserPerson } from "./insight-precompute.js";
import { startInsightJobs } from "./jobs.js";
import { RefreshTokenModel, UserModel } from "./models.js";
import { processVoiceLogTranscriptionAsync } from "./voice-processing.js";
import {
  createLog,
  createMember,
  deleteLog,
  deleteMember,
  updateMember,
  getLogById,
  getLatestInsightsSnapshot,
  getAutomationSettings,
  getAutomationStatus,
  getDoctorVisitSummary,
  listDigestsForUserPerson,
  listPrecomputedInsightsForUser,
  listLogs,
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
  login,
  runAutomationAnalysis,
  signup,
  updateAutomationSettings,
  updateFamilyUserRole
} from "./store.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_AUDIO_FILE_BYTES || 8 * 1024 * 1024)
  }
});
const mongoUri = process.env.MONGODB_URI;
const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);

if (!mongoUri) {
  throw new Error("MONGODB_URI is required");
}
await mongoose.connect(mongoUri);

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : "*"
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 250,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));
startInsightJobs();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "family-health-memory-api" });
});

const authSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6)
});

app.post("/api/auth/signup", async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid auth payload", issues: parsed.error.issues });
  }
  try {
    const user = await signup(parsed.data.email, parsed.data.name, parsed.data.password);
    const accessToken = signAccessToken({
      userId: user.id,
      familyId: user.familyId,
      email: user.email,
      name: user.name,
      role: user.role
    });
    const refresh = createRefreshToken();
    await RefreshTokenModel.create({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt
    });
    await writeAuditLog({
      familyId: user.familyId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "auth.signup",
      targetType: "user",
      targetId: user.id,
      metadata: { role: user.role }
    });
    return res.status(201).json({ user, accessToken, refreshToken: refresh.rawToken });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_EXISTS") {
      return res.status(409).json({ message: "Email already exists" });
    }
    return res.status(500).json({ message: "Signup failed" });
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
      familyId: user.familyId,
      email: user.email,
      name: user.name,
      role: user.role
    });
    const refresh = createRefreshToken();
    await RefreshTokenModel.create({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt
    });
    await writeAuditLog({
      familyId: user.familyId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "auth.login",
      targetType: "user",
      targetId: user.id
    });
    return res.json({ user, accessToken, refreshToken: refresh.rawToken });
  } catch {
    return res.status(401).json({ message: "Invalid credentials" });
  }
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

  const accessToken = signAccessToken({
    userId: String(user._id),
    familyId: String(user.familyId),
    email: String(user.email),
    name: String(user.name),
    role: String(user.role) as "owner" | "caregiver" | "viewer"
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

app.get("/api/digests/:userId/:personId", authMiddleware, async (req, res) => {
  const auth = req as { auth?: { userId: string; familyId: string; role: "owner" | "caregiver" | "viewer" } };
  const canReadOtherUsers = auth.auth?.role === "owner" || auth.auth?.role === "caregiver";
  if (!canReadOtherUsers && auth.auth?.userId !== req.params.userId) {
    return res.status(403).json({ message: "Cannot access digests for another user" });
  }
  const targetUser = await UserModel.findById(req.params.userId);
  if (!targetUser || String(targetUser.familyId) !== auth.auth?.familyId) {
    return res.status(404).json({ message: "Digest owner not found" });
  }
  const digests = await listDigestsForUserPerson(auth.auth?.familyId || "", req.params.userId, req.params.personId);
  return res.json({ digests });
});

app.post("/api/digests/:userId/:personId/generate", authMiddleware, async (req, res) => {
  const auth = req as { auth?: { userId: string; familyId: string; role: "owner" | "caregiver" | "viewer"; email: string } };
  const canGenerateForOtherUsers = auth.auth?.role === "owner" || auth.auth?.role === "caregiver";
  if (!canGenerateForOtherUsers && auth.auth?.userId !== req.params.userId) {
    return res.status(403).json({ message: "Cannot generate digests for another user" });
  }
  const targetUser = await UserModel.findById(req.params.userId);
  if (!targetUser || String(targetUser.familyId) !== auth.auth?.familyId) {
    return res.status(404).json({ message: "Digest owner not found" });
  }
  const digest = await generateWeeklyDigestForUserPerson({
    userId: req.params.userId,
    personId: req.params.personId
  });
  if (!digest) return res.status(404).json({ message: "Member not found for digest generation" });
  await writeAuditLog({
    familyId: auth.auth?.familyId || "unknown",
    actorUserId: auth.auth?.userId || "unknown",
    actorEmail: auth.auth?.email || "unknown",
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

app.use("/api/families/:familyId", authMiddleware);

const aiObservabilityQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional()
});

app.get("/api/families/:familyId/ai-observability", requireRole(["owner"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsed = aiObservabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "Invalid observability query payload" });
  const summary = await getAIObservabilitySummary(req.params.familyId, parsed.data.days || 7);
  res.json(summary);
});

app.get("/api/families/:familyId/users", requireRole(["owner", "caregiver"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  res.json({ users: await listFamilyUsers(req.params.familyId) });
});

const roleUpdateSchema = z.object({
  role: z.enum(["owner", "caregiver", "viewer"]),
  currentPassword: z.string().min(6).optional()
});

app.patch("/api/families/:familyId/users/:userId/role", requireRole(["owner"]), async (req, res) => {
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

const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["caregiver", "viewer"]).default("viewer")
});

app.post("/api/families/:familyId/users/invite", requireRole(["owner"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const parsed = inviteUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid invite payload" });
  try {
    const invited = await inviteFamilyUser(
      req.params.familyId,
      parsed.data.email,
      parsed.data.name,
      parsed.data.role
    );
    await writeAuditLog({
      familyId: req.params.familyId,
      actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
      actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
      action: "user.invite",
      targetType: "user",
      targetId: invited.id,
      metadata: { role: invited.role, email: invited.email }
    });
    return res.status(201).json({ user: invited });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_IN_OTHER_FAMILY") {
      return res.status(409).json({ message: "This email already belongs to another family" });
    }
    return res.status(500).json({ message: "Failed to invite user" });
  }
});

app.get("/api/families/:familyId/members", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  res.json({ members: await listMembers(req.params.familyId) });
});

const addMemberSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
  relationship: z.string().min(1),
  notes: z.string().optional()
});

const updateMemberSchema = z
  .object({
    name: z.string().min(1).optional(),
    age: z.number().int().positive().optional(),
    relationship: z.string().min(1).optional(),
    notes: z.string().optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

app.post("/api/families/:familyId/members", async (req, res) => {
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

app.delete("/api/families/:familyId/members/:memberId", requireRole(["owner", "caregiver"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  await deleteMember(req.params.familyId, req.params.memberId);
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

app.patch("/api/families/:familyId/members/:memberId", requireRole(["owner", "caregiver", "viewer"]), async (req, res) => {
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
  const memberId = typeof req.query.memberId === "string" ? req.query.memberId : undefined;
  res.json({ logs: await listLogs(req.params.familyId, memberId) });
});

app.get("/api/families/:familyId/timeline/:memberId", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const events = await listTimelineNarrativeEvents(req.params.familyId, req.params.memberId);
  res.json({ events });
});

app.get("/api/families/:familyId/doctor-summary/:memberId", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const days = Number(req.query.days || 30);
  const summary = await getDoctorVisitSummary(req.params.familyId, req.params.memberId, Math.min(Math.max(days, 7), 90));
  if (!summary) return res.status(404).json({ message: "Member not found" });
  res.json({ summary });
});

const addLogSchema = z.object({
  memberId: z.string().min(1),
  createdBy: z.string().default("family-user"),
  text: z.string().min(3),
  type: z.enum(["text", "voice"]),
  occurredAt: z.string().datetime().optional(),
  tags: z.array(z.string()).optional()
});

app.post("/api/families/:familyId/logs", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = req as { auth?: { userId: string; role: "owner" | "caregiver" | "viewer"; email: string } };
  const parsed = addLogSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid log payload" });
  const log = await createLog(req.params.familyId, {
    ...parsed.data,
    contributorId: auth.auth?.userId || parsed.data.createdBy,
    contributorRole: auth.auth?.role || "viewer",
    occurredAt: parsed.data.occurredAt || new Date().toISOString()
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

app.patch("/api/families/:familyId/logs/:logId", requireRole(["owner", "caregiver", "viewer"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = req as { auth?: { userId: string; role: "owner" | "caregiver" | "viewer"; email: string } };
  const existing = await getLogById(req.params.familyId, req.params.logId);
  if (!existing) return res.status(404).json({ message: "Log not found" });
  const canEdit =
    auth.auth?.role === "owner" ||
    auth.auth?.role === "caregiver" ||
    (auth.auth?.role === "viewer" && existing.contributorId === auth.auth?.userId);
  if (!canEdit) return res.status(403).json({ message: "Insufficient permissions for this log" });
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

app.delete("/api/families/:familyId/logs/:logId", requireRole(["owner", "caregiver", "viewer"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = req as { auth?: { userId: string; role: "owner" | "caregiver" | "viewer"; email: string } };
  const existing = await getLogById(req.params.familyId, req.params.logId);
  if (!existing) return res.status(404).json({ message: "Log not found" });
  const canDelete =
    auth.auth?.role === "owner" ||
    auth.auth?.role === "caregiver" ||
    (auth.auth?.role === "viewer" && existing.contributorId === auth.auth?.userId);
  if (!canDelete) return res.status(403).json({ message: "Insufficient permissions for this log" });
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

app.post("/api/families/:familyId/logs/voice", upload.single("audio"), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const auth = req as { auth?: { userId: string; role: "owner" | "caregiver" | "viewer"; email: string } };
  const bodySchema = z.object({
    memberId: z.string().min(1),
    createdBy: z.string().default("family-user"),
    transcript: z.string().min(3).optional()
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid voice log payload" });

  const file = req.file;
  if (!file && !parsed.data.transcript) {
    return res.status(400).json({ message: "Audio file or transcript is required" });
  }
  const transcript = parsed.data.transcript || "Voice note received. Transcription in progress.";
  const audioBase64 = file?.buffer?.toString("base64");
  const audioUrl = file ? `upload://voice/${Date.now()}-${Math.random().toString(36).slice(2, 9)}` : undefined;
  const log = await createLog(req.params.familyId, {
    memberId: parsed.data.memberId,
    createdBy: parsed.data.createdBy,
    contributorId: auth.auth?.userId || parsed.data.createdBy,
    contributorRole: auth.auth?.role || "viewer",
    text: transcript,
    type: "voice",
    occurredAt: new Date().toISOString(),
    audioBase64,
    audioUrl,
    transcript: parsed.data.transcript || undefined,
    transcriptionStatus: parsed.data.transcript ? "completed" : file ? "processing" : "pending"
  });

  if (!parsed.data.transcript && file && audioBase64) {
    processVoiceLogTranscriptionAsync({
      logId: log.id,
      familyId: req.params.familyId,
      memberId: parsed.data.memberId,
      mimeType: file.mimetype || "audio/webm",
      audioBase64
    });
  }

  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: (req as { auth?: { userId: string } }).auth?.userId || "unknown",
    actorEmail: (req as { auth?: { email: string } }).auth?.email || "unknown",
    action: "log.create.voice",
    targetType: "log",
    targetId: log.id,
    metadata: { memberId: log.memberId }
  });
  res.status(202).json({ log });
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
  const auth = req as { auth?: { userId: string; email: string; role?: "owner" | "caregiver" | "viewer" } };
  const includeDebug = parsedQuery.data.debug === 1;
  if (includeDebug && auth.auth?.role !== "owner") {
    return res.status(403).json({ message: "Debug insights are owner-only" });
  }
  const precomputedInsights = await listPrecomputedInsightsForUser(
    req.params.familyId,
    auth.auth?.userId || ""
  );
  const insightsForResponse = includeDebug
    ? precomputedInsights
    : precomputedInsights.map((ins) => {
        const { decisionReasons: _debugDecisionReasons, ...safe } = ins;
        return safe;
      });
  await writeAuditLog({
    familyId: req.params.familyId,
    actorUserId: auth.auth?.userId || "unknown",
    actorEmail: auth.auth?.email || "unknown",
    action: "insight.fetch.precomputed",
    targetType: "insight_batch",
    metadata: { debug: includeDebug }
  });
  res.json({ insights: insightsForResponse });
});

app.get("/api/families/:familyId/insights/latest", async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const snapshot = await getLatestInsightsSnapshot(req.params.familyId);
  res.json({ insights: snapshot || [] });
});

app.get("/api/families/:familyId/automation/status", requireRole(["owner", "caregiver", "viewer"]), async (req, res) => {
  if ((req as { auth?: { familyId: string } }).auth?.familyId !== req.params.familyId) {
    return res.status(403).json({ message: "Forbidden family access" });
  }
  const [status, settings] = await Promise.all([
    getAutomationStatus(req.params.familyId),
    getAutomationSettings(req.params.familyId)
  ]);
  res.json({ status, settings });
});

app.post("/api/families/:familyId/automation/run", requireRole(["owner", "caregiver"]), async (req, res) => {
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

app.patch("/api/families/:familyId/automation/settings", requireRole(["owner"]), async (req, res) => {
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

app.get("/api/families/:familyId/audit-logs", requireRole(["owner"]), async (req, res) => {
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

app.post("/api/families/:familyId/chat/ingest", requireRole(["owner", "caregiver"]), async (req, res) => {
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
  requireRole(["owner", "caregiver"]),
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
  requireRole(["owner", "caregiver"]),
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
