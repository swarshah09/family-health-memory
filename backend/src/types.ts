export type Severity = "info" | "warning" | "alert";
/** @deprecated Legacy care-team roles; prefer {@link FamilyRole}. Kept for DB migration and log contributorRole. */
export type UserRole = "owner" | "caregiver" | "viewer";
export type WorkspaceRole = "head" | "member";
/** Family workspace permission: multiple HEADs allowed; MEMBER read-all, edit-own logs only. */
export type FamilyRole = "HEAD" | "MEMBER";
export type LogVisibility = "private" | "family";
export type LogSourceType = "self" | "caregiver";
export type LogAccessPermissionLevel = "VIEW_ONLY" | "CONTRIBUTOR" | "FULL_ACCESS";

/** Explicit care-team assignment on a member profile (metadata for collaborators). */
export interface ContributorLink {
  userId: string;
  note?: string;
  /** ISO timestamp when this person was linked to the care team */
  since?: string;
}
export type InsightType = "trend" | "frequency" | "correlation" | "anomaly" | "red_flag";
export type InsightPriority = "low" | "medium" | "high";

export interface FamilyMember {
  id: string;
  familyId: string;
  /** If set, this care profile is bound to that family user account (personal health). */
  linkedUserId?: string;
  name: string;
  age: number;
  relationship: string;
  notes?: string;
  /** Family users designated as collaborators for this profile (multiple contributors). */
  careCollaborators?: ContributorLink[];
  createdAt: string;
}

/** Structured vital reading (dashboard + future charts). */
export interface VitalReading {
  id: string;
  familyId: string;
  memberId: string;
  kind: "blood_pressure" | "glucose";
  systolic?: number;
  diastolic?: number;
  mgDl?: number;
  recordedAt: string;
  createdByUserId?: string;
}

/** One AM/PM medication slot for a calendar day (UTC date key). */
export interface MedicationSlot {
  id: string;
  familyId: string;
  memberId: string;
  /** ISO date YYYY-MM-DD (UTC). */
  dayKey: string;
  /** 0 = morning, 1 = evening. */
  slotHalf: 0 | 1;
  status: "taken" | "missed" | "late" | "pending";
  updatedAt: string;
}

/** Camera fingertip pulse rhythm snapshot (wellness only; not diagnostic). */
export interface WellnessPulseSession {
  id: string;
  familyId: string;
  memberId: string;
  createdByUserId: string;
  /** Approximate beats per minute from PPG; not medical-grade. */
  heartRate: number;
  /** 0–1 signal quality estimate. */
  signalConfidence: number;
  sessionDurationSec: number;
  capturedAt: string;
  /** Normalized samples for light UI replay (optional, bounded length). */
  waveformSamples?: number[];
}

/** Activity feed row aligned with audit events. */
export interface FamilyActivityEvent {
  id: string;
  contributorId: string;
  contributorName: string;
  contributorEmail: string;
  action: string;
  timestamp: string;
  targetType: string;
  targetId?: string;
  metadata: Record<string, unknown>;
}

/** Captured once at upload; extended after transcription completes. */
export type VoiceRawAudioMetadata = {
  mimeType: string;
  sizeBytes: number;
  fileExtension?: string;
  storage: "disk" | "inline";
  uploadedAt?: string;
  /** Client-reported recording length when available (seconds). */
  durationSec?: number;
  /** How the clip was captured in the app. */
  clientSource?: "recording" | "upload";
  /** whisper-1, gemini, or fallback label */
  transcriber?: string;
  transcriptCharCount?: number;
  whisperTemperature?: number;
  transcriptionError?: string;
};

export interface HealthLog {
  id: string;
  familyId: string;
  memberId: string;
  createdBy: string;
  contributorId: string;
  /** Legacy care-team roles or new HEAD/MEMBER. */
  contributorRole: UserRole | FamilyRole;
  /** Subject of the health record when the profile is linked to a user account; absent for dependent-only profiles. */
  ownerUserId?: string;
  createdByUserId?: string;
  sourceType?: LogSourceType;
  /** private = subject + heads; family = broader family visibility for caregiver observations. */
  visibility?: LogVisibility;
  text: string;
  type: "text" | "voice";
  tags: string[];
  audioUrl?: string;
  transcript?: string;
  transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
  rawAudioMetadata?: VoiceRawAudioMetadata;
  occurredAt: string;
  createdAt: string;
}

export type InsightSource = "rules" | "model";

export interface Insight {
  id: string;
  familyId: string;
  memberId: string;
  type: InsightType;
  title: string;
  summary: string;
  details: string[];
  priority: InsightPriority;
  evidence: string[];
  description: string;
  severity: Severity;
  keyword: string;
  count: number;
  confidence: number;
  sourceLogIds: string[];
  evidenceSnippets?: Array<{ logId: string; snippet: string }>;
  evidenceLogIds: string[];
  createdAt: string;
  /** How this insight was produced — helps families understand reliability. */
  source?: InsightSource;
  /** Debug-only trace for why an insight passed decision filtering. */
  decisionReasons?: string[];
}

export interface AuthUser {
  id: string;
  /** Absent when the user has left their family and not yet joined another. */
  familyId?: string;
  email: string;
  name: string;
  familyRole: FamilyRole;
  /** @deprecated Use familyRole */
  role?: UserRole;
  /** @deprecated Use familyRole === "HEAD" */
  workspaceRole?: WorkspaceRole;
  profilePictureUrl?: string;
  description?: string;
  /** Display name of the private family workspace (when configured). */
  familyName?: string;
}

/** Structured activity row (also backed by audit logs). */
export interface FamilyPermissionActivity {
  id: string;
  action: string;
  actorId: string;
  actorEmail: string;
  targetUserId?: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface FamilyWorkspace {
  familyId: string;
  name: string;
  tagline?: string;
  createdByUserId: string;
  createdAt: string;
}

export interface JoinFamilyRequestRow {
  id: string;
  targetFamilyId: string;
  email: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface LogAccessGrantRow {
  id: string;
  familyId: string;
  granteeUserId: string;
  memberProfileId: string;
  permission: LogAccessPermissionLevel;
  grantedByUserId: string;
  active: boolean;
  createdAt: string;
}

export interface MemberLogAccessRequestRow {
  id: string;
  familyId: string;
  requesterUserId: string;
  targetMemberId: string;
  requestedPermission: LogAccessPermissionLevel;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

/** Grounded conversational answer over family health logs (not medical advice). */
export interface MemorySearchCitation {
  logId: string;
  memberId: string;
  memberName: string;
  occurredAt: string;
  excerpt: string;
  rationale?: string;
}

export interface MemorySearchResult {
  answer: string;
  citations: MemorySearchCitation[];
  followUpSuggestions: string[];
  confidence: "high" | "medium" | "low";
  logsConsidered: number;
  /** True when GEMINI_API_KEY is missing — UI can show setup hint */
  modelDisabled?: boolean;
}

export interface WeeklyDigest {
  id: string;
  familyId: string;
  userId: string;
  personId: string;
  generatedAt: string;
  title: string;
  summary: string;
  highlights: Array<{
    type: "recurring" | "trend" | "new_symptom" | "resolved_symptom" | "red_flag" | "behavioral_change";
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    confidence: number;
    evidenceLogIds: string[];
    evidenceSnippets?: Array<{ logId: string; snippet: string }>;
  }>;
  comparison: {
    symptomIncrease: string[];
    symptomDecrease: string[];
    newlyAppeared: string[];
    resolved: string[];
  };
  /** Present when loaded from stored weekly digest documents */
  weekStart?: string;
  weekEnd?: string;
  sourceLogIds?: string[];
}
