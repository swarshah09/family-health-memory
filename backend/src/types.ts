export type Severity = "info" | "warning" | "alert";
export type UserRole = "owner" | "caregiver" | "viewer";
export type InsightType = "trend" | "frequency" | "correlation" | "anomaly" | "red_flag";
export type InsightPriority = "low" | "medium" | "high";

export interface FamilyMember {
  id: string;
  familyId: string;
  name: string;
  age: number;
  relationship: string;
  notes?: string;
  createdAt: string;
}

export interface HealthLog {
  id: string;
  familyId: string;
  memberId: string;
  createdBy: string;
  contributorId: string;
  contributorRole: UserRole;
  text: string;
  type: "text" | "voice";
  tags: string[];
  audioUrl?: string;
  transcript?: string;
  transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
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
  familyId: string;
  email: string;
  name: string;
  role: UserRole;
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
}
