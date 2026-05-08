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
    contributorId: { type: String, required: true, index: true },
    contributorRole: { type: String, enum: ["owner", "caregiver", "viewer"], required: true, index: true },
    text: { type: String, required: true },
    type: { type: String, enum: ["text", "voice"], required: true },
    tags: { type: [String], default: [] },
    audioUrl: { type: String },
    transcript: { type: String },
    transcriptionStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true
    },
    audioBase64: { type: String },
    occurredAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

const storedInsightSchema = new Schema(
  {
    id: { type: String, required: true },
    familyId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["trend", "frequency", "correlation", "anomaly", "red_flag"],
      required: true
    },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    details: { type: [String], required: true, default: [] },
    confidence: { type: Number, required: true, default: 0 },
    priority: { type: String, enum: ["low", "medium", "high"], required: true },
    evidence: { type: [String], required: true, default: [] },
    // Backward-compatible fields retained while frontend migration settles.
    description: { type: String, required: true },
    severity: { type: String, enum: ["info", "warning", "alert"], required: true },
    keyword: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    sourceLogIds: { type: [String], required: true, default: [] },
    evidenceSnippets: {
      type: [
        new Schema(
          {
            logId: { type: String, required: true },
            snippet: { type: String, required: true }
          },
          { _id: false }
        )
      ],
      required: true,
      default: []
    },
    evidenceLogIds: { type: [String], required: true, default: [] },
    createdAt: { type: Date, required: true },
    source: { type: String, enum: ["rules", "model"] },
    decisionReasons: { type: [String] }
  },
  { _id: false }
);

const insightSnapshotSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    generatedAt: { type: Date, required: true, index: true },
    insights: { type: [storedInsightSchema], required: true, default: [] }
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

const chatInputSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    rawText: { type: String, required: true },
    extractedData: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

const chatContextSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, unique: true, index: true },
    lastPersonId: { type: String },
    lastPersonLabel: { type: String },
    lastSymptoms: { type: [String], default: [] },
    lastSeenAt: { type: Date }
  },
  { timestamps: true }
);

const precomputedInsightSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    personId: { type: String, required: true, index: true },
    insights: { type: [storedInsightSchema], required: true, default: [] },
    generatedAt: { type: Date, required: true, index: true },
    sourceLogIds: { type: [String], required: true, default: [] },
    confidenceScore: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);
precomputedInsightSchema.index({ userId: 1, personId: 1 }, { unique: true });

const weeklyDigestSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    personId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    highlights: {
      type: [
        new Schema(
          {
            type: {
              type: String,
              enum: ["recurring", "trend", "new_symptom", "resolved_symptom", "red_flag", "behavioral_change"],
              required: true
            },
            title: { type: String, required: true },
            description: { type: String, required: true },
            priority: { type: String, enum: ["low", "medium", "high"], required: true, default: "low" },
            confidence: { type: Number, required: true, default: 0 },
            evidenceLogIds: { type: [String], required: true, default: [] },
            evidenceSnippets: {
              type: [
                new Schema(
                  {
                    logId: { type: String, required: true },
                    snippet: { type: String, required: true }
                  },
                  { _id: false }
                )
              ],
              default: []
            }
          },
          { _id: false }
        )
      ],
      required: true,
      default: []
    },
    comparison: {
      symptomIncrease: { type: [String], required: true, default: [] },
      symptomDecrease: { type: [String], required: true, default: [] },
      newlyAppeared: { type: [String], required: true, default: [] },
      resolved: { type: [String], required: true, default: [] }
    },
    generatedAt: { type: Date, required: true, index: true },
    weekStart: { type: Date, required: true, index: true },
    weekEnd: { type: Date, required: true, index: true },
    sourceLogIds: { type: [String], required: true, default: [] }
  },
  { timestamps: true, collection: "weekly_digests" }
);
weeklyDigestSchema.index({ familyId: 1, userId: 1, personId: 1, generatedAt: -1 });
weeklyDigestSchema.index({ userId: 1, personId: 1, weekStart: 1 }, { unique: true });
weeklyDigestSchema.index({ userId: 1, personId: 1, generatedAt: -1 });

const aiProcessingLogSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    personId: { type: String, required: true, index: true },
    stage: { type: String, enum: ["extractor", "trend", "insight"], required: true, index: true },
    status: { type: String, enum: ["success", "failure"], required: true, index: true },
    errorMessage: { type: String },
    retryCount: { type: Number, required: true, default: 0 },
    timestamp: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);
aiProcessingLogSchema.index({ familyId: 1, stage: 1, timestamp: -1 });
precomputedInsightSchema.index({ familyId: 1, userId: 1, personId: 1, generatedAt: -1 });

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
export const ChatInputModel = mongoose.model("ChatInput", chatInputSchema);
export const ChatContextModel = mongoose.model("ChatContext", chatContextSchema);
export const PrecomputedInsightModel = mongoose.model("PrecomputedInsight", precomputedInsightSchema);
export const WeeklyDigestModel = mongoose.model("WeeklyDigest", weeklyDigestSchema);
export const AIProcessingLogModel = mongoose.model("AIProcessingLog", aiProcessingLogSchema);
