import { useCallback, useEffect, useMemo, useState, useRef, createContext, useContext, ReactNode } from "react";
import { AppRequestError, authHttpFailure } from "@/lib/toast-errors";
import type { MemorySearchResult } from "@/types/memory-search";
import type { CareGuidanceItem } from "@/types/care-guidance";
import { CARE_GUIDANCE_DISCLAIMER_FALLBACK } from "@/types/care-guidance";

export interface CareCollaboratorLink {
  userId: string;
  note?: string;
  since?: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  age: number;
  relationship: string;
  /** When set, this profile is that user's personal "My Health" space. */
  linkedUserId?: string;
  notes?: string;
  avatar?: string;
  careCollaborators?: CareCollaboratorLink[];
}

export type VoiceLogClientMeta = {
  mimeType?: string;
  sizeBytes?: number;
  storage?: "disk" | "inline";
  durationSec?: number;
  clientSource?: "recording" | "upload";
  transcriber?: string;
};

export interface HealthLog {
  id: string;
  memberId: string;
  contributorId: string;
  ownerUserId?: string;
  createdByUserId?: string;
  sourceType?: "self" | "caregiver";
  visibility?: "private" | "family";
  contributorRole: "owner" | "caregiver" | "viewer" | "HEAD" | "MEMBER";
  text: string;
  timestamp: string;
  type: "text" | "voice";
  tags?: string[];
  audioUrl?: string;
  transcript?: string;
  transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
  rawAudioMetadata?: VoiceLogClientMeta;
}

export interface Insight {
  id: string;
  memberId: string;
  type?: "trend" | "frequency" | "correlation" | "anomaly" | "red_flag";
  title: string;
  summary?: string;
  details?: string[];
  priority?: "low" | "medium" | "high";
  evidence?: string[];
  sourceLogIds?: string[];
  evidenceSnippets?: Array<{ logId: string; snippet: string }>;
  description: string;
  severity: "info" | "warning" | "alert";
  keyword: string;
  count: number;
  confidence?: number;
  date: string;
  /** Present when API returns provenance (`rules` = keyword tally, `model` = Gemini synthesis). */
  source?: "rules" | "model";
}

export type FamilyActivityEvent = {
  id: string;
  contributorId: string;
  contributorName: string;
  contributorEmail: string;
  action: string;
  timestamp: string;
  targetType: string;
  targetId?: string;
  metadata: Record<string, unknown>;
};

interface AppState {
  isAuthenticated: boolean;
  user: {
    id?: string;
    email: string;
    name: string;
    familyId?: string;
    role?: "owner" | "caregiver" | "viewer";
    workspaceRole?: "head" | "member";
    familyRole?: "HEAD" | "MEMBER";
    familyName?: string;
    profilePictureUrl?: string;
    description?: string;
  } | null;
  members: FamilyMember[];
  logs: HealthLog[];
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, name: string, password: string, opts?: { familyName?: string }) => Promise<void>;
  requestFamilyMembership: (input: {
    email: string;
    name: string;
    password: string;
    targetFamilyId: string;
  }) => Promise<{ message: string }>;
  logout: () => void;
  addMember: (member: Omit<FamilyMember, "id" | "linkedUserId">) => Promise<void>;
  updateMember: (id: string, member: Partial<Omit<FamilyMember, "id" | "linkedUserId">>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  addLog: (log: { memberId: string; text: string; type: "text" | "voice"; tags?: string[] }) => Promise<void>;
  updateLog: (id: string, updates: { text: string; tags: string[] }) => Promise<void>;
  removeLog: (id: string) => Promise<void>;
  addVoiceLog: (
    memberId: string,
    file: File,
    transcript?: string,
    clientAudio?: { durationSec?: number; source?: "recording" | "upload" }
  ) => Promise<void>;
  familyUsers: Array<{
    id: string;
    email: string;
    name: string;
    role: "owner" | "caregiver" | "viewer";
    familyRole?: "HEAD" | "MEMBER";
    workspaceRole?: "head" | "member";
  }>;
  loadFamilyUsers: (ctx?: {
    familyId: string;
    role?: "owner" | "caregiver" | "viewer";
  }) => Promise<void>;
  updateFamilyUserRole: (
    userId: string,
    role: "owner" | "caregiver" | "viewer",
    currentPassword?: string
  ) => Promise<void>;
  setFamilyUserRole: (userId: string, familyRole: "HEAD" | "MEMBER") => Promise<void>;
  inviteFamilyUser: (
    email: string,
    name: string,
    role: "caregiver" | "viewer"
  ) => Promise<
    | { kind: "active"; user: { id: string; email: string; name: string; role: "owner" | "caregiver" | "viewer" } }
    | {
        kind: "pending";
        invitation: {
          id: string;
          email: string;
          inviteeName: string;
          role: "caregiver" | "viewer";
          expiresAt: string;
          acceptUrl: string;
        };
      }
  >;
  acceptInvitation: (token: string, password: string, name?: string) => Promise<void>;
  fetchActivityFeed: (limit?: number) => Promise<FamilyActivityEvent[]>;
  memorySearch: (input: {
    query: string;
    memberId?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  }) => Promise<MemorySearchResult>;
  getLogsForMember: (memberId: string) => HealthLog[];
  hasPendingVoiceLogs: (memberId?: string) => boolean;
  getInsightsForMember: (memberId: string) => Insight[];
  getAllInsights: () => Insight[];
  getCareGuidanceForMember: (memberId: string) => CareGuidanceItem[];
  getAllCareGuidance: () => CareGuidanceItem[];
  careGuidanceDisclaimer: string;
  refreshFamilyData: () => Promise<void>;
  insightsLoading: boolean;
  lastDataRefreshAt: number | null;
  /** Pending join requests for family heads (same source as Family workspace; drives dock badge). */
  pendingJoinInboxCount: number;
  refreshJoinRequestInbox: () => Promise<void>;
  updateProfile: (patch: { name?: string; description?: string | null }) => Promise<void>;
  uploadProfilePhoto: (file: File) => Promise<void>;
  leaveFamily: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

type SessionUser = NonNullable<AppState["user"]>;

function sessionUserFromApi(u: Record<string, unknown>): SessionUser {
  return {
    id: typeof u.id === "string" ? u.id : undefined,
    email: String(u.email || ""),
    name: String(u.name || ""),
    ...(typeof u.familyId === "string" && u.familyId ? { familyId: u.familyId } : {}),
    role: u.role as SessionUser["role"],
    workspaceRole: (u.workspaceRole as SessionUser["workspaceRole"]) ?? undefined,
    familyRole: (u.familyRole as SessionUser["familyRole"]) ?? undefined,
    familyName: (u.familyName as string | undefined) ?? undefined,
    profilePictureUrl: (u.profilePictureUrl as string | undefined) ?? undefined,
    description: (u.description as string | undefined) ?? undefined
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{
    id?: string;
    email: string;
    name: string;
    familyId?: string;
    role?: "owner" | "caregiver" | "viewer";
    workspaceRole?: "head" | "member";
    familyRole?: "HEAD" | "MEMBER";
    familyName?: string;
    profilePictureUrl?: string;
    description?: string;
  } | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("fhm_access_token"));
  const [refreshToken, setRefreshToken] = useState<string | null>(
    localStorage.getItem("fhm_refresh_token")
  );
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [careGuidance, setCareGuidance] = useState<CareGuidanceItem[]>([]);
  const [careGuidanceDisclaimer, setCareGuidanceDisclaimer] = useState(CARE_GUIDANCE_DISCLAIMER_FALLBACK);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [lastDataRefreshAt, setLastDataRefreshAt] = useState<number | null>(null);
  const [familyUsers, setFamilyUsers] = useState<AppState["familyUsers"]>([]);
  const [pendingJoinInboxCount, setPendingJoinInboxCount] = useState(0);

  const syncJoinRequestInboxForProfile = useCallback(
    async (
      profile: {
        familyId?: string;
        role?: "owner" | "caregiver" | "viewer";
        workspaceRole?: "head" | "member";
        familyRole?: "HEAD" | "MEMBER";
      } | null,
      bearer: string | null
    ) => {
      if (!profile?.familyId || !bearer) {
        setPendingJoinInboxCount(0);
        return;
      }
      const isHead = profile.role === "owner" || profile.workspaceRole === "head" || profile.familyRole === "HEAD";
      if (!isHead) {
        setPendingJoinInboxCount(0);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/families/${profile.familyId}/join-requests`, {
          headers: { Authorization: `Bearer ${bearer}` }
        });
        if (!res.ok) {
          if (res.status === 403) setPendingJoinInboxCount(0);
          return;
        }
        const json = (await res.json()) as { joinRequests?: unknown[] };
        const list = json.joinRequests;
        setPendingJoinInboxCount(Array.isArray(list) ? list.length : 0);
      } catch {
        /* ignore */
      }
    },
    []
  );

  const refreshJoinRequestInbox = useCallback(async () => {
    await syncJoinRequestInboxForProfile(user, token || localStorage.getItem("fhm_access_token"));
  }, [user, token, syncJoinRequestInboxForProfile]);

  const refreshAccessToken = async (): Promise<string | null> => {
    const rawRefreshToken = refreshToken || localStorage.getItem("fhm_refresh_token");
    if (!rawRefreshToken) return null;
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rawRefreshToken })
    });
    if (!response.ok) {
      // If refresh endpoint is unavailable or token is invalid, clear stale session.
      if (response.status === 400 || response.status === 401 || response.status === 404) {
        setPendingJoinInboxCount(0);
        setUser(null);
        setToken(null);
        setRefreshToken(null);
        setIsAuthenticated(false);
        setFamilyUsers([]);
        setMembers([]);
        setLogs([]);
        setInsights([]);
        setCareGuidance([]);
        setCareGuidanceDisclaimer(CARE_GUIDANCE_DISCLAIMER_FALLBACK);
        localStorage.removeItem("fhm_access_token");
        localStorage.removeItem("fhm_refresh_token");
        localStorage.removeItem("fhm_user");
      }
      return null;
    }
    const json = await response.json();
    const nextAccessToken = json.accessToken as string;
    const nextRefreshToken = json.refreshToken as string;
    setToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
    localStorage.setItem("fhm_access_token", nextAccessToken);
    localStorage.setItem("fhm_refresh_token", nextRefreshToken);
    return nextAccessToken;
  };

  const apiFetch = async (url: string, init: RequestInit = {}) => {
    const currentToken = token || localStorage.getItem("fhm_access_token");
    const headers = new Headers(init.headers || {});
    if (currentToken) headers.set("Authorization", `Bearer ${currentToken}`);
    const first = await fetch(url, { ...init, headers });
    if (first.status !== 401) return first;
    const nextToken = await refreshAccessToken();
    if (!nextToken) return first;
    headers.set("Authorization", `Bearer ${nextToken}`);
    return fetch(url, { ...init, headers });
  };

  const ensureOk = async (response: Response, fallbackMessage: string) => {
    if (response.ok) return;
    let message = fallbackMessage;
    try {
      const json = (await response.json()) as { message?: string };
      if (json?.message) message = json.message;
    } catch {
      // Keep fallback message if response is not JSON.
    }
    throw new Error(message);
  };

  const hydrateFromApi = async (targetFamilyId: string) => {
    if (!token && !localStorage.getItem("fhm_access_token")) return;
    setInsightsLoading(true);
    try {
      const [membersRes, logsRes, insightsRes, careGuidanceRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/api/families/${targetFamilyId}/members`),
        apiFetch(`${API_BASE_URL}/api/families/${targetFamilyId}/logs`),
        apiFetch(`${API_BASE_URL}/api/families/${targetFamilyId}/insights`),
        apiFetch(`${API_BASE_URL}/api/families/${targetFamilyId}/care-guidance`)
      ]);
      const membersJson = await membersRes.json();
      const logsJson = await logsRes.json();
      const insightsJson = await insightsRes.json();
      if (careGuidanceRes.ok) {
        const cgJson = (await careGuidanceRes.json()) as {
          items?: CareGuidanceItem[];
          disclaimer?: string;
        };
        setCareGuidance(Array.isArray(cgJson.items) ? cgJson.items : []);
        setCareGuidanceDisclaimer(
          typeof cgJson.disclaimer === "string" && cgJson.disclaimer.trim()
            ? cgJson.disclaimer.trim()
            : CARE_GUIDANCE_DISCLAIMER_FALLBACK
        );
      } else {
        setCareGuidance([]);
        setCareGuidanceDisclaimer(CARE_GUIDANCE_DISCLAIMER_FALLBACK);
      }

      setMembers(membersJson.members || []);
      setLogs(
        (logsJson.logs || []).map(
          (log: {
            id: string;
            memberId: string;
            contributorId?: string;
            ownerUserId?: string;
            createdByUserId?: string;
            sourceType?: "self" | "caregiver";
            visibility?: "private" | "family";
            contributorRole?: "owner" | "caregiver" | "viewer" | "HEAD" | "MEMBER";
            text: string;
            type: "text" | "voice";
            occurredAt: string;
            tags?: string[];
            audioUrl?: string;
            transcript?: string;
            transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
            rawAudioMetadata?: VoiceLogClientMeta;
          }) => ({
            id: log.id,
            memberId: log.memberId,
            contributorId: log.contributorId || "unknown",
            ...(log.ownerUserId ? { ownerUserId: log.ownerUserId } : {}),
            ...(log.createdByUserId ? { createdByUserId: log.createdByUserId } : {}),
            ...(log.sourceType ? { sourceType: log.sourceType } : {}),
            ...(log.visibility ? { visibility: log.visibility } : {}),
            contributorRole: log.contributorRole || "viewer",
            text: log.text,
            type: log.type,
            timestamp: log.occurredAt,
            tags: log.tags || [],
            audioUrl: log.audioUrl,
            transcript: log.transcript,
            transcriptionStatus: log.transcriptionStatus,
            rawAudioMetadata: log.rawAudioMetadata
          })
        )
      );
      setInsights(
        (insightsJson.insights || []).map(
          (ins: {
            id: string;
            memberId: string;
            type?: Insight["type"];
            title: string;
            summary?: string;
            details?: string[];
            priority?: Insight["priority"];
            evidence?: string[];
            sourceLogIds?: string[];
            evidenceSnippets?: Array<{ logId: string; snippet: string }>;
            description: string;
            severity: Insight["severity"];
            keyword: string;
            count: number;
            confidence?: number;
            createdAt: string;
            source?: Insight["source"];
          }) => ({
            id: ins.id,
            memberId: ins.memberId,
            type: ins.type,
            title: ins.title,
            summary: ins.summary,
            details: ins.details,
            priority: ins.priority,
            evidence: ins.evidence,
            sourceLogIds: ins.sourceLogIds,
            evidenceSnippets: ins.evidenceSnippets,
            description: ins.description || ins.summary || "",
            severity:
              ins.severity ||
              (ins.priority === "high" ? "alert" : ins.priority === "medium" ? "warning" : "info"),
            keyword: ins.keyword || ins.type || "pattern",
            count: typeof ins.count === "number" ? ins.count : (ins.evidence || []).length,
            confidence: ins.confidence,
            date: ins.createdAt,
            source: ins.source,
          })
        )
      );
      setLastDataRefreshAt(Date.now());
    } finally {
      setInsightsLoading(false);
    }
  };

  const personalHealthEnsureAttempted = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.familyId || !user?.id) {
      personalHealthEnsureAttempted.current = false;
      return;
    }
    if (members.some((m) => m.linkedUserId === user.id)) return;
    if (personalHealthEnsureAttempted.current) return;
    personalHealthEnsureAttempted.current = true;
    void (async () => {
      const r = await apiFetch(`${API_BASE_URL}/api/me/ensure-personal-health-member`, { method: "POST" });
      if (r.ok && user.familyId) await hydrateFromApi(user.familyId);
    })();
  }, [isAuthenticated, user?.familyId, user?.id, members.length]);

  useEffect(() => {
    const rawUser = localStorage.getItem("fhm_user");
    if (rawUser && (token || localStorage.getItem("fhm_access_token"))) {
      const parsedUser = JSON.parse(rawUser) as SessionUser;
      setUser(parsedUser);
      setIsAuthenticated(true);
      if (parsedUser.familyId) {
        hydrateFromApi(parsedUser.familyId).catch(() => {});
        loadFamilyUsers({
          familyId: parsedUser.familyId,
          role: parsedUser.role
        }).catch(() => {});
      }
      void syncJoinRequestInboxForProfile(parsedUser, localStorage.getItem("fhm_access_token"));
    }
  }, [syncJoinRequestInboxForProfile]);

  useEffect(() => {
    if (!user || !isAuthenticated) return;
    if (!user.familyId) return;
    if (!hasPendingVoiceLogs()) return;
    const timer = setInterval(() => {
      hydrateFromApi(user.familyId!).catch(() => {});
    }, 3500);
    return () => clearInterval(timer);
  }, [user?.familyId, isAuthenticated, logs]);

  useEffect(() => {
    if (!isAuthenticated || !user?.familyId) {
      setPendingJoinInboxCount(0);
      return;
    }
    const isHead = user.familyRole === "HEAD" || user.role === "owner" || user.workspaceRole === "head";
    if (!isHead) {
      setPendingJoinInboxCount(0);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void refreshJoinRequestInbox();
    };
    tick();
    const id = setInterval(tick, 45_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isAuthenticated, user?.familyId, user?.role, user?.workspaceRole, user?.familyRole, token, refreshJoinRequestInbox]);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const { title, description } = await authHttpFailure(res, "login");
      throw new AppRequestError(title, description);
    }
    const json = await res.json();
    const nextUser = sessionUserFromApi(json.user as Record<string, unknown>);
    const nextAccessToken = json.accessToken as string;
    const nextRefreshToken = json.refreshToken as string;
    setUser(nextUser);
    setToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
    localStorage.setItem("fhm_access_token", nextAccessToken);
    localStorage.setItem("fhm_refresh_token", nextRefreshToken);
    localStorage.setItem("fhm_user", JSON.stringify(nextUser));
    setIsAuthenticated(true);
    if (nextUser.familyId) {
      await hydrateFromApi(nextUser.familyId);
      await loadFamilyUsers({ familyId: nextUser.familyId, role: nextUser.role });
    }
    await syncJoinRequestInboxForProfile(nextUser, nextAccessToken);
  };

  const requestFamilyMembership = async (input: {
    email: string;
    name: string;
    password: string;
    targetFamilyId: string;
  }) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/request-family-membership`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    if (!res.ok) {
      const { title, description } = await authHttpFailure(res, "signup");
      throw new AppRequestError(title, description);
    }
    const json = (await res.json()) as { message?: string };
    return { message: json.message || "Request submitted." };
  };

  const signup = async (email: string, name: string, password: string, opts?: { familyName?: string }) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name,
        password,
        ...(opts?.familyName?.trim() ? { familyName: opts.familyName.trim() } : {})
      })
    });
    if (!res.ok) {
      const { title, description } = await authHttpFailure(res, "signup");
      throw new AppRequestError(title, description);
    }
    const json = await res.json();
    const nextUser = sessionUserFromApi(json.user as Record<string, unknown>);
    const nextAccessToken = json.accessToken as string;
    const nextRefreshToken = json.refreshToken as string;
    setUser(nextUser);
    setToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
    localStorage.setItem("fhm_access_token", nextAccessToken);
    localStorage.setItem("fhm_refresh_token", nextRefreshToken);
    localStorage.setItem("fhm_user", JSON.stringify(nextUser));
    setIsAuthenticated(true);
    if (nextUser.familyId) {
      await hydrateFromApi(nextUser.familyId);
      await loadFamilyUsers({ familyId: nextUser.familyId, role: nextUser.role });
    }
    await syncJoinRequestInboxForProfile(nextUser, nextAccessToken);
  };

  const logout = () => {
    personalHealthEnsureAttempted.current = false;
    const rawRefreshToken = refreshToken || localStorage.getItem("fhm_refresh_token");
    if (rawRefreshToken) {
      fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rawRefreshToken })
      }).catch(() => {});
    }
    setPendingJoinInboxCount(0);
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setIsAuthenticated(false);
    setFamilyUsers([]);
    setMembers([]);
    setLogs([]);
    setInsights([]);
    setCareGuidance([]);
    setCareGuidanceDisclaimer(CARE_GUIDANCE_DISCLAIMER_FALLBACK);
    localStorage.removeItem("fhm_access_token");
    localStorage.removeItem("fhm_refresh_token");
    localStorage.removeItem("fhm_user");
  };

  const addMember = async (member: Omit<FamilyMember, "id" | "linkedUserId">) => {
    if (!user?.familyId) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(member)
    });
    await ensureOk(response, "Failed to add family member");
    await hydrateFromApi(user.familyId);
  };

  const removeMember = async (id: string) => {
    if (!user?.familyId) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/members/${id}`, {
      method: "DELETE"
    });
    await ensureOk(response, "Failed to remove family member");
    await hydrateFromApi(user.familyId);
  };

  const updateMember = async (id: string, member: Partial<Omit<FamilyMember, "id">>) => {
    if (!user?.familyId) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(member)
    });
    await ensureOk(response, "Failed to update family member");
    await hydrateFromApi(user.familyId);
  };

  const addLog = async (log: { memberId: string; text: string; type: "text" | "voice"; tags?: string[] }) => {
    if (!user?.familyId) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: log.memberId,
        createdBy: user?.email || "family-user",
        text: log.text,
        type: log.type,
        tags: log.tags || []
      })
    });
    await ensureOk(response, "Failed to create log");
    await hydrateFromApi(user.familyId);
  };

  const updateLog = async (id: string, updates: { text: string; tags: string[] }) => {
    if (!user?.familyId) {
      setLogs((prev) =>
        prev.map((l) => (l.id === id ? { ...l, text: updates.text, tags: updates.tags } : l))
      );
      return;
    }
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/logs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: updates.text, tags: updates.tags })
    });
    await ensureOk(response, "Failed to update log");
    await hydrateFromApi(user.familyId);
  };

  const removeLog = async (id: string) => {
    if (!user?.familyId) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/logs/${id}`, {
      method: "DELETE"
    });
    await ensureOk(response, "Failed to delete log");
    await hydrateFromApi(user.familyId);
  };

  const addVoiceLog = async (
    memberId: string,
    file: File,
    transcript?: string,
    clientAudio?: { durationSec?: number; source?: "recording" | "upload" }
  ) => {
    if (!user?.familyId) throw new Error("Not authenticated");
    const formData = new FormData();
    formData.append("audio", file);
    formData.append("memberId", memberId);
    formData.append("createdBy", user.email);
    if (transcript?.trim()) formData.append("transcript", transcript.trim());
    if (clientAudio && (clientAudio.durationSec != null || clientAudio.source)) {
      formData.append(
        "audioClientMeta",
        JSON.stringify({
          ...(typeof clientAudio.durationSec === "number" ? { durationSec: clientAudio.durationSec } : {}),
          ...(clientAudio.source ? { source: clientAudio.source } : {})
        })
      );
    }
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/logs/voice`, {
      method: "POST",
      body: formData
    });
    await ensureOk(response, "Failed to upload voice log");
    await hydrateFromApi(user.familyId);
  };

  const loadFamilyUsers = async (ctx?: {
    familyId: string;
    role?: "owner" | "caregiver" | "viewer";
  }) => {
    const familyId = ctx?.familyId ?? user?.familyId;
    if (!familyId) return;
    const response = await apiFetch(`${API_BASE_URL}/api/families/${familyId}/users`);
    if (response.status === 403) {
      setFamilyUsers([]);
      return;
    }
    await ensureOk(response, "Failed to load family users");
    const json = await response.json();
    setFamilyUsers(json.users || []);
  };

  const updateFamilyUserRole = async (
    userId: string,
    role: "owner" | "caregiver" | "viewer",
    currentPassword?: string
  ) => {
    if (!user?.familyId) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, ...(currentPassword ? { currentPassword } : {}) })
    });
    await ensureOk(response, "Failed to update role");
    await loadFamilyUsers();
  };

  const inviteFamilyUser = async (
    email: string,
    name: string,
    role: "caregiver" | "viewer"
  ) => {
    if (!user?.familyId) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/users/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role })
    });
    await ensureOk(response, "Failed to invite user");
    const json = (await response.json()) as {
      user?: { id: string; email: string; name: string; role: "owner" | "caregiver" | "viewer" };
      invitation?: {
        id: string;
        email: string;
        inviteeName: string;
        role: "caregiver" | "viewer";
        expiresAt: string;
        acceptUrl: string;
      };
    };
    await loadFamilyUsers();
    if (json.invitation) {
      return {
        kind: "pending" as const,
        invitation: json.invitation
      };
    }
    if (json.user) {
      return { kind: "active" as const, user: json.user };
    }
    throw new Error("Unexpected invite response");
  };

  const setFamilyUserRole = async (targetUserId: string, familyRole: "HEAD" | "MEMBER") => {
    if (!user?.familyId) throw new Error("Not authenticated");
    const response = await apiFetch(
      `${API_BASE_URL}/api/families/${user.familyId}/users/${targetUserId}/family-role`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyRole })
      }
    );
    await ensureOk(response, "Failed to update workspace role");
    await loadFamilyUsers();
  };

  const updateProfile = async (patch: { name?: string; description?: string | null }) => {
    if (!user) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/me/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    await ensureOk(response, "Failed to update profile");
    const json = (await response.json()) as { user?: Record<string, unknown> };
    if (!json.user) throw new Error("Invalid profile response");
    const next = sessionUserFromApi(json.user);
    setUser(next);
    localStorage.setItem("fhm_user", JSON.stringify(next));
  };

  const uploadProfilePhoto = async (file: File) => {
    if (!user) throw new Error("Not authenticated");
    const formData = new FormData();
    formData.append("photo", file);
    const response = await apiFetch(`${API_BASE_URL}/api/me/profile-photo`, {
      method: "POST",
      body: formData
    });
    await ensureOk(response, "Failed to upload photo");
    const json = (await response.json()) as { user?: Record<string, unknown> };
    if (!json.user) throw new Error("Invalid photo response");
    const next = sessionUserFromApi(json.user);
    setUser(next);
    localStorage.setItem("fhm_user", JSON.stringify(next));
  };

  const leaveFamily = async () => {
    const response = await apiFetch(`${API_BASE_URL}/api/auth/leave-family`, { method: "POST" });
    if (response.status === 409) {
      let msg = "Another member must be HEAD before you can leave.";
      try {
        const j = (await response.json()) as { message?: string };
        if (j?.message) msg = j.message;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    await ensureOk(response, "Could not leave family");
    setMembers([]);
    setLogs([]);
    setInsights([]);
    setCareGuidance([]);
    setCareGuidanceDisclaimer(CARE_GUIDANCE_DISCLAIMER_FALLBACK);
    setFamilyUsers([]);
    setPendingJoinInboxCount(0);
    setUser((prev) => {
      if (!prev) return null;
      const next: SessionUser = {
        ...prev,
        familyId: undefined,
        familyRole: undefined,
        familyName: undefined,
        workspaceRole: undefined,
        role: "viewer"
      };
      localStorage.setItem("fhm_user", JSON.stringify(next));
      return next;
    });
  };

  const fetchActivityFeed = useCallback(async (limit = 40): Promise<FamilyActivityEvent[]> => {
    if (!user?.familyId) return [];
    const response = await apiFetch(
      `${API_BASE_URL}/api/families/${user.familyId}/activity?limit=${encodeURIComponent(String(limit))}`
    );
    if (!response.ok) return [];
    const json = (await response.json()) as { events?: FamilyActivityEvent[] };
    return json.events || [];
  }, [user?.familyId, token]);

  const acceptInvitation = async (inviteToken: string, password: string, name?: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/accept-invitation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken, password, ...(name?.trim() ? { name: name.trim() } : {}) })
    });
    if (!res.ok) {
      const { title, description } = await authHttpFailure(res, "signup");
      throw new AppRequestError(title, description);
    }
    const json = await res.json();
    const nextUser = sessionUserFromApi(json.user as Record<string, unknown>);
    const nextAccessToken = json.accessToken as string;
    const nextRefreshToken = json.refreshToken as string;
    setUser(nextUser);
    setToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
    localStorage.setItem("fhm_access_token", nextAccessToken);
    localStorage.setItem("fhm_refresh_token", nextRefreshToken);
    localStorage.setItem("fhm_user", JSON.stringify(nextUser));
    setIsAuthenticated(true);
    if (nextUser.familyId) {
      await hydrateFromApi(nextUser.familyId);
      await loadFamilyUsers({ familyId: nextUser.familyId });
    }
    await syncJoinRequestInboxForProfile(nextUser, nextAccessToken);
  };

  const getLogsForMember = (memberId: string) =>
    logs
      .filter((l) => l.memberId === memberId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const hasPendingVoiceLogs = (memberId?: string) =>
    logs.some(
      (l) =>
        l.type === "voice" &&
        (memberId ? l.memberId === memberId : true) &&
        (l.transcriptionStatus === "pending" || l.transcriptionStatus === "processing")
    );

  const getInsightsForMember = useMemo(
    () => (memberId: string) => insights.filter((insight) => insight.memberId === memberId),
    [insights]
  );
  const getAllInsights = useMemo(() => () => insights, [insights]);

  const getCareGuidanceForMember = useMemo(
    () => (memberId: string) => careGuidance.filter((row) => row.memberId === memberId),
    [careGuidance]
  );
  const getAllCareGuidance = useMemo(() => () => careGuidance, [careGuidance]);

  const refreshFamilyData = async () => {
    if (!user?.familyId) return;
    await hydrateFromApi(user.familyId);
  };

  const memorySearch = async (input: {
    query: string;
    memberId?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<MemorySearchResult> => {
    if (!user?.familyId) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/memory-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: input.query,
        ...(input.memberId ? { memberId: input.memberId } : {}),
        ...(input.history?.length ? { history: input.history } : {})
      })
    });
    if (response.status === 404) {
      throw new Error(
        "Memory search returned 404 — the API you are calling does not expose this route yet. Start or restart the backend from this repo (cd backend && npm run dev), or update your deployed API. Tip: POST the same URL without Authorization should return 401, not 404, when the route exists."
      );
    }
    if (response.status === 403) {
      let serverMsg = "";
      try {
        const j = (await response.clone().json()) as { message?: string };
        if (j?.message) serverMsg = ` (${j.message})`;
      } catch {
        /* ignore */
      }
      throw new Error(
        `Memory search was forbidden (403)${serverMsg}. If you recently changed families or roles, sign out and back in so your token matches this workspace.`
      );
    }
    await ensureOk(response, "Memory search failed");
    const json = (await response.json()) as { result?: MemorySearchResult };
    if (!json.result) throw new Error("Invalid memory search response");
    return json.result;
  };

  return (
    <AppContext.Provider
      value={{
        isAuthenticated, user, members, logs,
        login, signup, requestFamilyMembership, logout, addMember, updateMember, removeMember,
        addLog, updateLog, removeLog, addVoiceLog, familyUsers, loadFamilyUsers, updateFamilyUserRole,
        setFamilyUserRole,
        inviteFamilyUser,
        acceptInvitation,
        fetchActivityFeed,
        memorySearch,
        getLogsForMember, hasPendingVoiceLogs, getInsightsForMember, getAllInsights,
        getCareGuidanceForMember,
        getAllCareGuidance,
        careGuidanceDisclaimer,
        refreshFamilyData,
        insightsLoading,
        lastDataRefreshAt,
        pendingJoinInboxCount,
        refreshJoinRequestInbox,
        updateProfile,
        uploadProfilePhoto,
        leaveFamily,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
