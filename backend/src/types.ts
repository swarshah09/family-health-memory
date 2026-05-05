export type Severity = "info" | "warning" | "alert";
export type UserRole = "owner" | "caregiver" | "viewer";

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
  text: string;
  type: "text" | "voice";
  tags: string[];
  occurredAt: string;
  createdAt: string;
}

export type InsightSource = "rules" | "model";

export interface Insight {
  id: string;
  familyId: string;
  memberId: string;
  title: string;
  description: string;
  severity: Severity;
  keyword: string;
  count: number;
  confidence: number;
  evidenceLogIds: string[];
  createdAt: string;
  /** How this insight was produced — helps families understand reliability. */
  source?: InsightSource;
}

export interface AuthUser {
  id: string;
  familyId: string;
  email: string;
  name: string;
  role: UserRole;
}
