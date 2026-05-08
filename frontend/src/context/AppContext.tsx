import { useEffect, useMemo, useState, createContext, useContext, ReactNode } from "react";

export interface FamilyMember {
  id: string;
  name: string;
  age: number;
  relationship: string;
  notes?: string;
  avatar?: string;
}

export interface HealthLog {
  id: string;
  memberId: string;
  contributorId: string;
  contributorRole: "owner" | "caregiver" | "viewer";
  text: string;
  timestamp: string;
  type: "text" | "voice";
  tags?: string[];
  audioUrl?: string;
  transcript?: string;
  transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
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

interface AppState {
  isAuthenticated: boolean;
  user: { id?: string; email: string; name: string; familyId: string; role?: "owner" | "caregiver" | "viewer" } | null;
  members: FamilyMember[];
  logs: HealthLog[];
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  addMember: (member: Omit<FamilyMember, "id">) => Promise<void>;
  updateMember: (id: string, member: Omit<FamilyMember, "id">) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  addLog: (log: { memberId: string; text: string; type: "text" | "voice"; tags?: string[] }) => Promise<void>;
  updateLog: (id: string, updates: { text: string; tags: string[] }) => Promise<void>;
  removeLog: (id: string) => Promise<void>;
  addVoiceLog: (memberId: string, file: File, transcript?: string) => Promise<void>;
  familyUsers: Array<{ id: string; email: string; name: string; role: "owner" | "caregiver" | "viewer" }>;
  loadFamilyUsers: (ctx?: {
    familyId: string;
    role?: "owner" | "caregiver" | "viewer";
  }) => Promise<void>;
  updateFamilyUserRole: (
    userId: string,
    role: "owner" | "caregiver" | "viewer",
    currentPassword?: string
  ) => Promise<void>;
  inviteFamilyUser: (
    email: string,
    name: string,
    role: "caregiver" | "viewer"
  ) => Promise<{ temporaryPassword?: string }>;
  getLogsForMember: (memberId: string) => HealthLog[];
  hasPendingVoiceLogs: (memberId?: string) => boolean;
  getInsightsForMember: (memberId: string) => Insight[];
  getAllInsights: () => Insight[];
  refreshFamilyData: () => Promise<void>;
  insightsLoading: boolean;
  lastDataRefreshAt: number | null;
}

const AppContext = createContext<AppState | null>(null);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export function AppProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ id?: string; email: string; name: string; familyId: string; role?: "owner" | "caregiver" | "viewer" } | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("fhm_access_token"));
  const [refreshToken, setRefreshToken] = useState<string | null>(
    localStorage.getItem("fhm_refresh_token")
  );
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [lastDataRefreshAt, setLastDataRefreshAt] = useState<number | null>(null);
  const [familyUsers, setFamilyUsers] = useState<Array<{ id: string; email: string; name: string; role: "owner" | "caregiver" | "viewer" }>>([]);

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
        setUser(null);
        setToken(null);
        setRefreshToken(null);
        setIsAuthenticated(false);
        setFamilyUsers([]);
        setMembers([]);
        setLogs([]);
        setInsights([]);
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
      const [membersRes, logsRes, insightsRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/api/families/${targetFamilyId}/members`),
        apiFetch(`${API_BASE_URL}/api/families/${targetFamilyId}/logs`),
        apiFetch(`${API_BASE_URL}/api/families/${targetFamilyId}/insights`)
      ]);
      const membersJson = await membersRes.json();
      const logsJson = await logsRes.json();
      const insightsJson = await insightsRes.json();

      setMembers(membersJson.members || []);
      setLogs(
        (logsJson.logs || []).map(
          (log: {
            id: string;
            memberId: string;
            contributorId?: string;
            contributorRole?: "owner" | "caregiver" | "viewer";
            text: string;
            type: "text" | "voice";
            occurredAt: string;
            tags?: string[];
            audioUrl?: string;
            transcript?: string;
            transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
          }) => ({
            id: log.id,
            memberId: log.memberId,
            contributorId: log.contributorId || "unknown",
            contributorRole: log.contributorRole || "viewer",
            text: log.text,
            type: log.type,
            timestamp: log.occurredAt,
            tags: log.tags || [],
            audioUrl: log.audioUrl,
            transcript: log.transcript,
            transcriptionStatus: log.transcriptionStatus
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

  useEffect(() => {
    const rawUser = localStorage.getItem("fhm_user");
    if (rawUser && (token || localStorage.getItem("fhm_access_token"))) {
      const parsedUser = JSON.parse(rawUser) as { id?: string; email: string; name: string; familyId: string; role?: "owner" | "caregiver" | "viewer" };
      setUser(parsedUser);
      setIsAuthenticated(true);
      hydrateFromApi(parsedUser.familyId).catch(() => {});
      loadFamilyUsers({
        familyId: parsedUser.familyId,
        role: parsedUser.role
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!user || !isAuthenticated) return;
    if (!hasPendingVoiceLogs()) return;
    const timer = setInterval(() => {
      hydrateFromApi(user.familyId).catch(() => {});
    }, 3500);
    return () => clearInterval(timer);
  }, [user?.familyId, isAuthenticated, logs]);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Login failed");
    const json = await res.json();
    const nextUser = {
      id: json.user.id as string | undefined,
      email: json.user.email as string,
      name: json.user.name as string,
      familyId: json.user.familyId as string,
      role: json.user.role as "owner" | "caregiver" | "viewer"
    };
    const nextAccessToken = json.accessToken as string;
    const nextRefreshToken = json.refreshToken as string;
    setUser(nextUser);
    setToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
    localStorage.setItem("fhm_access_token", nextAccessToken);
    localStorage.setItem("fhm_refresh_token", nextRefreshToken);
    localStorage.setItem("fhm_user", JSON.stringify(nextUser));
    setIsAuthenticated(true);
    await hydrateFromApi(nextUser.familyId);
    await loadFamilyUsers({ familyId: nextUser.familyId, role: nextUser.role });
  };

  const signup = async (email: string, name: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password }),
    });
    if (!res.ok) throw new Error("Signup failed");
    const json = await res.json();
    const nextUser = {
      id: json.user.id as string | undefined,
      email: json.user.email as string,
      name: json.user.name as string,
      familyId: json.user.familyId as string,
      role: json.user.role as "owner" | "caregiver" | "viewer"
    };
    const nextAccessToken = json.accessToken as string;
    const nextRefreshToken = json.refreshToken as string;
    setUser(nextUser);
    setToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
    localStorage.setItem("fhm_access_token", nextAccessToken);
    localStorage.setItem("fhm_refresh_token", nextRefreshToken);
    localStorage.setItem("fhm_user", JSON.stringify(nextUser));
    setIsAuthenticated(true);
    await hydrateFromApi(nextUser.familyId);
    await loadFamilyUsers({ familyId: nextUser.familyId, role: nextUser.role });
  };

  const logout = () => {
    const rawRefreshToken = refreshToken || localStorage.getItem("fhm_refresh_token");
    if (rawRefreshToken) {
      fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rawRefreshToken })
      }).catch(() => {});
    }
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setIsAuthenticated(false);
    setFamilyUsers([]);
    setMembers([]);
    setLogs([]);
    setInsights([]);
    localStorage.removeItem("fhm_access_token");
    localStorage.removeItem("fhm_refresh_token");
    localStorage.removeItem("fhm_user");
  };

  const addMember = async (member: Omit<FamilyMember, "id">) => {
    if (!user) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(member)
    });
    await ensureOk(response, "Failed to add family member");
    await hydrateFromApi(user.familyId);
  };

  const removeMember = async (id: string) => {
    if (!user) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/members/${id}`, {
      method: "DELETE"
    });
    await ensureOk(response, "Failed to remove family member");
    await hydrateFromApi(user.familyId);
  };

  const updateMember = async (id: string, member: Omit<FamilyMember, "id">) => {
    if (!user) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(member)
    });
    await ensureOk(response, "Failed to update family member");
    await hydrateFromApi(user.familyId);
  };

  const addLog = async (log: { memberId: string; text: string; type: "text" | "voice"; tags?: string[] }) => {
    if (!user) throw new Error("Not authenticated");
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
    if (!user) {
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
    if (!user) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/logs/${id}`, {
      method: "DELETE"
    });
    await ensureOk(response, "Failed to delete log");
    await hydrateFromApi(user.familyId);
  };

  const addVoiceLog = async (memberId: string, file: File, transcript?: string) => {
    if (!user) throw new Error("Not authenticated");
    const formData = new FormData();
    formData.append("audio", file);
    formData.append("memberId", memberId);
    formData.append("createdBy", user.email);
    if (transcript?.trim()) formData.append("transcript", transcript.trim());
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
    const role = ctx?.role ?? user?.role;
    if (!familyId) return;
    if (role === "viewer") {
      setFamilyUsers([]);
      return;
    }
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
    if (!user) throw new Error("Not authenticated");
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
  ): Promise<{ temporaryPassword?: string }> => {
    if (!user) throw new Error("Not authenticated");
    const response = await apiFetch(`${API_BASE_URL}/api/families/${user.familyId}/users/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role })
    });
    await ensureOk(response, "Failed to invite user");
    const json = await response.json();
    await loadFamilyUsers();
    return { temporaryPassword: json.user?.temporaryPassword as string | undefined };
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

  const refreshFamilyData = async () => {
    if (!user) return;
    await hydrateFromApi(user.familyId);
  };

  return (
    <AppContext.Provider
      value={{
        isAuthenticated, user, members, logs,
        login, signup, logout, addMember, updateMember, removeMember,
        addLog, updateLog, removeLog, addVoiceLog, familyUsers, loadFamilyUsers, updateFamilyUserRole, inviteFamilyUser,
        getLogsForMember, hasPendingVoiceLogs, getInsightsForMember, getAllInsights,
        refreshFamilyData,
        insightsLoading,
        lastDataRefreshAt,
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
