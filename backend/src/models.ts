import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    /** Set when the user belongs to a family; cleared when they leave. */
    familyId: { type: String, required: false, index: true, sparse: true },
    /** @deprecated Prefer familyRole */
    role: { type: String, enum: ["owner", "caregiver", "viewer"], required: false, default: "viewer" },
    workspaceRole: { type: String, enum: ["head", "member"], required: false, index: true },
    familyRole: { type: String, enum: ["HEAD", "MEMBER"], required: false, index: true },
    profilePictureUrl: { type: String, required: false },
    description: { type: String, required: false, maxlength: 2000 }
  },
  { timestamps: true }
);

const familyWorkspaceSchema = new Schema(
  {
    familyId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    /** Optional short line under the workspace name in the UI (Chronicle-style). */
    tagline: { type: String, required: false, maxlength: 160 },
    createdByUserId: { type: String, required: true, index: true }
  },
  { timestamps: true }
);

const joinFamilyRequestSchema = new Schema(
  {
    targetFamilyId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, index: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], required: true, default: "pending", index: true },
    resolvedByUserId: { type: String },
    resolvedAt: { type: Date },
    message: { type: String }
  },
  { timestamps: true }
);
joinFamilyRequestSchema.index({ targetFamilyId: 1, email: 1, status: 1 });

const logAccessGrantSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    granteeUserId: { type: String, required: true, index: true },
    memberProfileId: { type: String, required: true, index: true },
    permission: {
      type: String,
      enum: ["VIEW_ONLY", "CONTRIBUTOR", "FULL_ACCESS"],
      required: true
    },
    grantedByUserId: { type: String, required: true },
    active: { type: Boolean, required: true, default: true, index: true }
  },
  { timestamps: true }
);
logAccessGrantSchema.index({ familyId: 1, granteeUserId: 1, memberProfileId: 1, active: 1 });

const memberLogAccessRequestSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    requesterUserId: { type: String, required: true, index: true },
    targetMemberId: { type: String, required: true, index: true },
    requestedPermission: {
      type: String,
      enum: ["VIEW_ONLY", "CONTRIBUTOR", "FULL_ACCESS"],
      required: true
    },
    status: { type: String, enum: ["pending", "approved", "rejected"], required: true, default: "pending", index: true },
    resolvedByUserId: { type: String },
    resolvedAt: { type: Date }
  },
  { timestamps: true }
);
memberLogAccessRequestSchema.index({ familyId: 1, targetMemberId: 1, requesterUserId: 1, status: 1 });


const familyMemberSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    /** When set, this profile is that user's personal "My Health" space (one per user per family). */
    linkedUserId: { type: String, required: false, index: true, sparse: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    relationship: { type: String, required: true },
    notes: { type: String },
    careCollaborators: {
      type: [
        new Schema(
          {
            userId: { type: String, required: true },
            note: { type: String },
            since: { type: Date }
          },
          { _id: false }
        )
      ],
      default: undefined
    }
  },
  { timestamps: true }
);
familyMemberSchema.index({ familyId: 1, linkedUserId: 1 }, { unique: true, sparse: true });

const familyInvitationSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, index: true },
    inviteeName: { type: String, required: true },
    role: { type: String, enum: ["caregiver", "viewer"], required: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    invitedByUserId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);
familyInvitationSchema.index({ familyId: 1, email: 1 });

const healthLogSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    contributorId: { type: String, required: true, index: true },
    contributorRole: {
      type: String,
      enum: ["owner", "caregiver", "viewer", "HEAD", "MEMBER"],
      required: true,
      index: true
    },
    ownerUserId: { type: String, index: true },
    createdByUserId: { type: String, index: true },
    /** self = subject recorded their own entry; caregiver = someone else recorded it (observation). */
    sourceType: { type: String, enum: ["self", "caregiver"], required: false, index: true },
    visibility: { type: String, enum: ["private", "family"], index: true },
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
    rawAudioMetadata: { type: Schema.Types.Mixed, default: undefined },
    audioBase64: { type: String },
    occurredAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

const vitalReadingSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    kind: { type: String, enum: ["blood_pressure", "glucose"], required: true, index: true },
    systolic: { type: Number },
    diastolic: { type: Number },
    mgDl: { type: Number },
    recordedAt: { type: Date, required: true, index: true },
    createdByUserId: { type: String, index: true }
  },
  { timestamps: true, collection: "vital_readings" }
);
vitalReadingSchema.index({ familyId: 1, memberId: 1, recordedAt: -1 });

const medicationSlotSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    dayKey: { type: String, required: true },
    slotHalf: { type: Number, enum: [0, 1], required: true },
    status: {
      type: String,
      enum: ["taken", "missed", "late", "pending"],
      required: true,
      default: "pending",
      index: true
    }
  },
  { timestamps: true, collection: "medication_slots" }
);
medicationSlotSchema.index({ familyId: 1, memberId: 1, dayKey: 1, slotHalf: 1 }, { unique: true });

const wellnessPulseSessionSchema = new Schema(
  {
    familyId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    createdByUserId: { type: String, required: true, index: true },
    heartRate: { type: Number, required: true },
    signalConfidence: { type: Number, required: true },
    sessionDurationSec: { type: Number, required: true },
    capturedAt: { type: Date, required: true, index: true },
    waveformSamples: { type: [Number], required: false, default: undefined }
  },
  { timestamps: true, collection: "wellness_pulse_sessions" }
);
wellnessPulseSessionSchema.index({ familyId: 1, memberId: 1, capturedAt: -1 });

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
weeklyDigestSchema.index({ familyId: 1, personId: 1, generatedAt: -1 });
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
export const FamilyWorkspaceModel = mongoose.model("FamilyWorkspace", familyWorkspaceSchema);
export const JoinFamilyRequestModel = mongoose.model("JoinFamilyRequest", joinFamilyRequestSchema);
export const LogAccessGrantModel = mongoose.model("LogAccessGrant", logAccessGrantSchema);
export const MemberLogAccessRequestModel = mongoose.model("MemberLogAccessRequest", memberLogAccessRequestSchema);
export const FamilyInvitationModel = mongoose.model("FamilyInvitation", familyInvitationSchema);
export const FamilyMemberModel = mongoose.model("FamilyMember", familyMemberSchema);
export const HealthLogModel = mongoose.model("HealthLog", healthLogSchema);
export const VitalReadingModel = mongoose.model("VitalReading", vitalReadingSchema);
export const MedicationSlotModel = mongoose.model("MedicationSlot", medicationSlotSchema);
export const WellnessPulseSessionModel = mongoose.model("WellnessPulseSession", wellnessPulseSessionSchema);
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
