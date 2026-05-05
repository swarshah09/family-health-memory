import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    familyId: { type: String, required: true, index: true },
    role: { type: String, enum: ["owner", "caregiver", "viewer"], required: true, default: "viewer" }
  },
  { timestamps: true }
);

const familyMemberSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    relationship: { type: String, required: true },
    notes: { type: String }
  },
  { timestamps: true }
);

const healthLogSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    text: { type: String, required: true },
    type: { type: String, enum: ["text", "voice"], required: true },
    tags: { type: [String], default: [] },
    audioBase64: { type: String },
    occurredAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

const insightSnapshotSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    generatedAt: { type: Date, required: true, index: true },
    insights: { type: [Schema.Types.Mixed], required: true, default: [] }
  },
  { timestamps: true }
);

const refreshTokenSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date }
  },
  { timestamps: true }
);

const auditLogSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    actorUserId: { type: String, required: true, index: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

const automationSettingSchema = new Schema(
  {
    familyId: { type: String, required: true, unique: true, index: true },
    minMentions: { type: Number, required: true, default: 3 },
    minConfidence: { type: Number, required: true, default: 0.7 },
    notificationsEnabled: { type: Boolean, required: true, default: true }
  },
  { timestamps: true }
);

const automationRunSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    runType: { type: String, enum: ["manual", "scheduled"], required: true },
    status: { type: String, enum: ["success", "failed"], required: true },
    insightsGenerated: { type: Number, required: true, default: 0 },
    notificationsCreated: { type: Number, required: true, default: 0 },
    errorMessage: { type: String }
  },
  { timestamps: true }
);

const notificationSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    insightId: { type: String, required: true },
    message: { type: String, required: true },
    severity: { type: String, enum: ["info", "warning", "alert"], required: true },
    isRead: { type: Boolean, required: true, default: false }
  },
  { timestamps: true }
);

const chatMessageSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    senderName: { type: String, required: true },
    text: { type: String, required: true },
    source: {
      type: String,
      enum: ["family_app", "whatsapp", "chat_simulator"],
      required: true,
      default: "family_app"
    },
    structuredResult: { type: Schema.Types.Mixed },
    autoLogCreated: { type: Boolean, required: true, default: false, index: true },
    resolvedHealthLogId: { type: String },
    dismissedAt: { type: Date }
  },
  { timestamps: true }
);

export const UserModel = mongoose.model("User", userSchema);
export const FamilyMemberModel = mongoose.model("FamilyMember", familyMemberSchema);
export const HealthLogModel = mongoose.model("HealthLog", healthLogSchema);
export const InsightSnapshotModel = mongoose.model("InsightSnapshot", insightSnapshotSchema);
export const RefreshTokenModel = mongoose.model("RefreshToken", refreshTokenSchema);
export const AuditLogModel = mongoose.model("AuditLog", auditLogSchema);
export const AutomationSettingModel = mongoose.model("AutomationSetting", automationSettingSchema);
export const AutomationRunModel = mongoose.model("AutomationRun", automationRunSchema);
export const NotificationModel = mongoose.model("Notification", notificationSchema);
export const ChatMessageModel = mongoose.model("ChatMessage", chatMessageSchema);
