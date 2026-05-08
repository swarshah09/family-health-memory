import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import {
  ArrowLeft,
  Bell,
  ClipboardList,
  Cog,
  Crown,
  Download,
  FileSearch,
  Plus,
  PlayCircle,
  Shield,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

type NotificationItem = {
  id: string;
  memberId: string;
  message: string;
  severity: "info" | "warning" | "alert";
  isRead: boolean;
  createdAt: string;
};

type AIObservabilitySummary = {
  lookbackDays: number;
  totalEvents: number;
  failures: number;
  retryEvents: number;
  insightSuccessRate: number;
  extractionFailures: number;
  trend: Array<{
    date: string;
    successes: number;
    failures: number;
    retries: number;
  }>;
  recentFailures: Array<{
    stage: "extractor" | "trend" | "insight";
    errorMessage: string | null;
    timestamp: string;
  }>;
};

type ReengagementPrompt = {
  id: string;
  memberId: string;
  triggerType: "inactive_logging" | "recurring_unresolved" | "no_followup_after_trend";
  prompt: string;
  reason: string;
  severity: "info" | "warning";
  createdAt: string;
};

export default function AdminPage() {
  const navigate = useNavigate();
  const {
    user,
    members,
    logs,
    familyUsers,
    loadFamilyUsers,
    inviteFamilyUser,
    updateFamilyUserRole,
    addMember,
    removeMember,
    refreshFamilyData
  } = useApp();
  const token = localStorage.getItem("fhm_access_token");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"caregiver" | "viewer">("viewer");
  const [memberName, setMemberName] = useState("");
  const [memberAge, setMemberAge] = useState("");
  const [memberRelation, setMemberRelation] = useState("");
  const [memberNotes, setMemberNotes] = useState("");
  const [status, setStatus] = useState<{
    lastRunAt: string | null;
    lastRunStatus: "success" | "failed" | null;
    insightsGenerated: number;
    notificationsCreated: number;
  } | null>(null);
  const [settings, setSettings] = useState<{
    minMentions: number;
    minConfidence: number;
    notificationsEnabled: boolean;
  } | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [observability, setObservability] = useState<AIObservabilitySummary | null>(null);
  const [observabilityDays, setObservabilityDays] = useState("7");
  const [observabilityLoading, setObservabilityLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "team" | "members" | "alerts" | "audit">("overview");
  const [teamQuery, setTeamQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [alertQuery, setAlertQuery] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditActorEmail, setAuditActorEmail] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditLimit] = useState(40);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditRows, setAuditRows] = useState<
    Array<{
      id: string;
      actorEmail: string;
      action: string;
      targetType: string;
      targetId?: string;
      metadata: Record<string, unknown>;
      createdAt: string;
    }>
  >([]);
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    userId: string;
    name: string;
    nextRole: "owner" | "caregiver" | "viewer";
  } | null>(null);
  const [pendingRolePassword, setPendingRolePassword] = useState("");
  const [updatingRole, setUpdatingRole] = useState(false);
  const [pendingMemberDelete, setPendingMemberDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);
  const [reengagementPrompts, setReengagementPrompts] = useState<ReengagementPrompt[]>([]);

  const latestLogs = useMemo(
    () => [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 8),
    [logs]
  );

  const memberNameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members]
  );

  const fetchAutomation = async () => {
    if (!user || !token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [statusRes, notifRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/families/${user.familyId}/automation/status`, { headers }),
      fetch(`${API_BASE_URL}/api/families/${user.familyId}/notifications`, { headers })
    ]);
    if (statusRes.ok) {
      const statusJson = await statusRes.json();
      setStatus(statusJson.status || null);
      setSettings(statusJson.settings || null);
    }
    if (notifRes.ok) {
      const notifJson = await notifRes.json();
      setNotifications(notifJson.notifications || []);
    }
  };

  const fetchReengagementPrompts = async () => {
    if (!user || !token) return;
    const response = await fetch(`${API_BASE_URL}/api/families/${user.familyId}/reengagement-prompts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    const json = (await response.json()) as { prompts?: ReengagementPrompt[] };
    setReengagementPrompts(json.prompts || []);
  };

  const toIsoOrNull = (v: string): string | null => {
    if (!v.trim()) return null;
    const dt = new Date(v);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  };

  const fetchAuditLogs = async (offset = 0) => {
    if (!user || !token) return;
    const params = new URLSearchParams({ limit: String(auditLimit), offset: String(offset) });
    if (auditAction.trim()) params.set("action", auditAction.trim());
    if (auditActorEmail.trim()) params.set("actorEmail", auditActorEmail.trim());
    const fromIso = toIsoOrNull(auditFrom);
    const toIso = toIsoOrNull(auditTo);
    if (fromIso) params.set("from", fromIso);
    if (toIso) params.set("to", toIso);
    const response = await fetch(
      `${API_BASE_URL}/api/families/${user.familyId}/audit-logs?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (!response.ok) {
      toast.error("Failed to load audit logs");
      return;
    }
    const json = await response.json();
    setAuditRows(json.auditLogs || []);
    setAuditTotal(Number(json.total || 0));
    setAuditOffset(Number(json.offset || 0));
  };

  const fetchObservability = async () => {
    if (!user || !token) return;
    const days = Number(observabilityDays) || 7;
    setObservabilityLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/families/${user.familyId}/ai-observability?days=${Math.min(
          Math.max(days, 1),
          90
        )}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!response.ok) {
        toast.error("Failed to load AI observability");
        return;
      }
      const json = (await response.json()) as AIObservabilitySummary;
      setObservability(json);
    } finally {
      setObservabilityLoading(false);
    }
  };

  const exportCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    const keys = Object.keys(rows[0]);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!user) return;
    loadFamilyUsers().catch(() => {});
    fetchAutomation().catch(() => {});
    fetchObservability().catch(() => {});
    fetchReengagementPrompts().catch(() => {});
  }, [user?.familyId]);

  useEffect(() => {
    if (activeTab !== "audit") return;
    fetchAuditLogs(auditOffset).catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "overview") return;
    fetchObservability().catch(() => {});
  }, [activeTab, observabilityDays]);

  useEffect(() => {
    if (activeTab !== "overview") return;
    const timer = window.setInterval(() => {
      fetchObservability().catch(() => {});
      fetchReengagementPrompts().catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [activeTab, observabilityDays, user?.familyId]);

  if (user?.role !== "owner") {
    return (
      <div className="app-shell app-safe-bottom">
        <div className="px-5 pt-14">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div className="glass-card rounded-2xl p-5 mt-4">
            <p className="text-base font-semibold text-foreground">Owner-only console</p>
            <p className="text-sm text-muted-foreground mt-1">
              This admin page can only be accessed by the family owner account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const runNow = async () => {
    if (!user || !token) return;
    const response = await fetch(`${API_BASE_URL}/api/families/${user.familyId}/automation/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      toast.error("Failed to run automation");
      return;
    }
    toast.success("Automation run completed");
    await refreshFamilyData();
    await fetchAutomation();
  };

  const saveSettings = async () => {
    if (!user || !token || !settings) return;
    const response = await fetch(`${API_BASE_URL}/api/families/${user.familyId}/automation/settings`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      toast.error("Failed to save thresholds");
      return;
    }
    toast.success("Threshold settings updated");
    await fetchAutomation();
  };

  const markRead = async (notificationId: string) => {
    if (!user || !token) return;
    const response = await fetch(`${API_BASE_URL}/api/families/${user.familyId}/notifications/${notificationId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)));
  };

  const filteredUsers = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    if (!q) return familyUsers;
    return familyUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q)
    );
  }, [familyUsers, teamQuery]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.relationship.toLowerCase().includes(q) ||
        (m.notes || "").toLowerCase().includes(q)
    );
  }, [members, memberQuery]);

  const filteredNotifications = useMemo(() => {
    const q = alertQuery.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((n) => n.message.toLowerCase().includes(q) || n.severity.includes(q));
  }, [notifications, alertQuery]);

  const confirmRoleChange = () => {
    if (!pendingRoleChange || updatingRole) return;
    if (!pendingRolePassword.trim()) {
      toast.error("Current password is required");
      return;
    }
    setUpdatingRole(true);
    updateFamilyUserRole(pendingRoleChange.userId, pendingRoleChange.nextRole, pendingRolePassword.trim())
      .then(() => {
        toast.success(`Role updated for ${pendingRoleChange.name}`);
        setPendingRoleChange(null);
        setPendingRolePassword("");
      })
      .catch((err: Error) => toast.error(err.message || "Role update failed"))
      .finally(() => setUpdatingRole(false));
  };

  const confirmMemberDelete = () => {
    if (!pendingMemberDelete || deletingMember) return;
    setDeletingMember(true);
    removeMember(pendingMemberDelete.id)
      .then(() => {
        toast.success(`${pendingMemberDelete.name} removed`);
        setPendingMemberDelete(null);
      })
      .catch((err: Error) => toast.error(err.message || "Could not remove member"))
      .finally(() => setDeletingMember(false));
  };

  const maxDailyEvents = useMemo(() => {
    if (!observability?.trend?.length) return 1;
    return Math.max(
      1,
      ...observability.trend.map((point) => point.successes + point.failures)
    );
  }, [observability]);

  return (
    <div className="app-shell app-safe-bottom bg-[#151412] text-white">
      <div className="bg-[#1d1a18] border-b border-white/10 px-5 pt-12 pb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-white/60 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="h-8 w-8 rounded-xl bg-warning/20 flex items-center justify-center">
            <Crown className="h-4 w-4 text-warning" />
          </div>
          <div>
            <h1 className="font-display font-bold text-white text-lg">Admin Console</h1>
            <p className="text-[11px] text-white/55">Owner controls for family operations</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-2">
          <div className="grid grid-cols-5 gap-2">
            {[
              { id: "overview", label: "Overview" },
              { id: "team", label: "Team" },
              { id: "members", label: "Members" },
              { id: "alerts", label: "Alerts" },
              { id: "audit", label: "Audit" }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`h-9 rounded-xl text-xs font-medium transition-colors ${
                  activeTab === tab.id ? "bg-success text-success-foreground" : "bg-black/10 text-white/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "overview" && (
          <>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-3">
            <p className="text-[11px] text-white/55">Members</p>
            <p className="text-xl font-semibold">{members.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-3">
            <p className="text-[11px] text-white/55">Team users</p>
            <p className="text-xl font-semibold">{familyUsers.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-3">
            <p className="text-[11px] text-white/55">Logs</p>
            <p className="text-xl font-semibold">{logs.length}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Cog className="h-4 w-4 text-success" />
            <p className="text-sm font-semibold">Automation</p>
          </div>
          <p className="text-xs text-white/60">
            Last run: {status?.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : "Never"} | Result:{" "}
            {status?.lastRunStatus || "N/A"} | Insights: {status?.insightsGenerated || 0} | Notifications:{" "}
            {status?.notificationsCreated || 0}
          </p>
          <Button onClick={runNow} className="h-9 rounded-xl bg-success hover:bg-success/90">
            <PlayCircle className="h-4 w-4 mr-2" /> Run analysis now
          </Button>
          {settings && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <p className="text-xs text-white/55 mb-1">Min mentions</p>
                <Input
                  type="number"
                  value={settings.minMentions}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, minMentions: Number(e.target.value || "3") } : prev
                    )
                  }
                />
              </div>
              <div>
                <p className="text-xs text-white/55 mb-1">Min confidence</p>
                <Input
                  type="number"
                  step="0.05"
                  value={settings.minConfidence}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, minConfidence: Number(e.target.value || "0.7") } : prev
                    )
                  }
                />
              </div>
              <div className="col-span-2 flex items-center justify-between text-sm">
                <span>Pain alerts</span>
                <button
                  type="button"
                  onClick={() =>
                    setSettings((prev) =>
                      prev ? { ...prev, notificationsEnabled: !prev.notificationsEnabled } : prev
                    )
                  }
                  className={`h-7 w-12 rounded-full p-1 transition-soft ${
                    settings.notificationsEnabled ? "bg-success" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white transition-soft ${
                      settings.notificationsEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <div className="col-span-2">
                <Button onClick={saveSettings} className="h-9 rounded-xl">
                  Save thresholds
                </Button>
              </div>
            </div>
          )}
        </div>
            <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-warning" />
                  <p className="text-sm font-semibold">AI observability</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() =>
                      exportCsv(
                        `ai-observability-${new Date().toISOString().slice(0, 10)}.csv`,
                        (observability?.trend || []).map((point) => ({
                          date: point.date,
                          successes: point.successes,
                          failures: point.failures,
                          retries: point.retries
                        }))
                      )
                    }
                  >
                    <Download className="h-4 w-4 mr-2" /> Export
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() => fetchObservability()}
                    disabled={observabilityLoading}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-white/60">Lookback</p>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={observabilityDays}
                  onChange={(e) => setObservabilityDays(e.target.value)}
                  className="h-8 w-20"
                />
                <p className="text-xs text-white/60">days</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 p-3">
                  <p className="text-[11px] text-white/55">Insight success rate</p>
                  <p className="text-lg font-semibold">
                    {observability ? `${(observability.insightSuccessRate * 100).toFixed(1)}%` : "--"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 p-3">
                  <p className="text-[11px] text-white/55">Total stage events</p>
                  <p className="text-lg font-semibold">{observability?.totalEvents ?? "--"}</p>
                </div>
                <div className="rounded-xl border border-white/10 p-3">
                  <p className="text-[11px] text-white/55">AI processing failures</p>
                  <p className="text-lg font-semibold text-destructive">{observability?.failures ?? "--"}</p>
                </div>
                <div className="rounded-xl border border-white/10 p-3">
                  <p className="text-[11px] text-white/55">Extraction failures</p>
                  <p className="text-lg font-semibold text-destructive">{observability?.extractionFailures ?? "--"}</p>
                </div>
                <div className="rounded-xl border border-white/10 p-3 col-span-2">
                  <p className="text-[11px] text-white/55">Retry events</p>
                  <p className="text-lg font-semibold">{observability?.retryEvents ?? "--"}</p>
                </div>
              </div>
              <p className="text-xs text-white/50">
                {observabilityLoading
                  ? "Loading observability metrics..."
                  : "Metrics reflect extractor/trend/insight stage logs from background AI processing. Auto-refresh: 30s."}
              </p>
              {observability?.trend?.length ? (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-white/60">Daily stage trend</p>
                  {observability.trend.map((point) => {
                    const total = point.successes + point.failures;
                    const successWidth = total ? (point.successes / maxDailyEvents) * 100 : 0;
                    const failureWidth = total ? (point.failures / maxDailyEvents) * 100 : 0;
                    return (
                      <div key={point.date} className="grid grid-cols-[78px_1fr] gap-2 items-center">
                        <p className="text-[11px] text-white/50">{point.date.slice(5)}</p>
                        <div className="rounded-md bg-black/25 h-3 overflow-hidden flex">
                          <div className="bg-success/80 h-3" style={{ width: `${successWidth}%` }} />
                          <div className="bg-destructive/80 h-3" style={{ width: `${failureWidth}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className="pt-1">
                <p className="text-xs text-white/60 mb-1">Recent failures</p>
                <div className="space-y-1.5">
                  {(observability?.recentFailures || []).map((item, idx) => (
                    <div key={`${item.timestamp}-${idx}`} className="rounded-lg border border-white/10 p-2">
                      <p className="text-[11px] text-white/50">
                        {new Date(item.timestamp).toLocaleString()} · {item.stage}
                      </p>
                      <p className="text-xs text-white/80 mt-1 line-clamp-2">
                        {item.errorMessage || "No error message captured"}
                      </p>
                    </div>
                  ))}
                  {!observability?.recentFailures?.length && (
                    <p className="text-xs text-white/50">No recent failures in this lookback window.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-4">
              <p className="text-sm font-semibold mb-2">Recent log activity</p>
              <div className="space-y-2">
                {latestLogs.map((l) => (
                  <div key={l.id} className="rounded-lg border border-white/10 p-2.5">
                    <p className="text-xs text-white/50">
                      {new Date(l.timestamp).toLocaleString()} · {memberNameById.get(l.memberId) || "Unknown"}
                    </p>
                    <p className="text-sm mt-1 line-clamp-2">{l.text}</p>
                  </div>
                ))}
                {latestLogs.length === 0 && <p className="text-xs text-white/50">No logs yet.</p>}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-semibold">Contextual re-engagement</p>
                <Button variant="outline" className="h-8" onClick={() => fetchReengagementPrompts()}>
                  Refresh
                </Button>
              </div>
              <div className="space-y-2">
                {reengagementPrompts.slice(0, 6).map((prompt) => {
                  const memberName = memberNameById.get(prompt.memberId) || "Member";
                  return (
                    <div key={prompt.id} className="rounded-lg border border-white/10 p-3">
                      <p className="text-xs text-white/50">
                        {memberName} · {prompt.reason}
                      </p>
                      <p className="text-sm mt-1">{prompt.prompt}</p>
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          className="h-8"
                          onClick={() => navigate(`/member/${prompt.memberId}`)}
                        >
                          Open member timeline
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {reengagementPrompts.length === 0 ? (
                  <p className="text-xs text-white/50">No contextual follow-up prompts right now.</p>
                ) : null}
              </div>
            </div>
          </>
        )}

        {activeTab === "team" && (
          <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Team & roles</p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Search users by name, email, role"
              value={teamQuery}
              onChange={(e) => setTeamQuery(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() =>
                exportCsv(
                  "family-users.csv",
                  filteredUsers.map((u) => ({ name: u.name, email: u.email, role: u.role }))
                )
              }
            >
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            <Input placeholder="Name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
            <Input
              placeholder="Email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "caregiver" | "viewer")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="caregiver">Caregiver</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                if (!inviteName.trim() || !inviteEmail.trim()) {
                  toast.error("Name and email are required");
                  return;
                }
                inviteFamilyUser(inviteEmail.trim(), inviteName.trim(), inviteRole)
                  .then((result) => {
                    setInviteName("");
                    setInviteEmail("");
                    toast.success("User invited", {
                      description: result.temporaryPassword
                        ? `Temporary password: ${result.temporaryPassword}`
                        : "Existing family user updated."
                    });
                  })
                  .catch((err: Error) => toast.error(err.message || "Invite failed"));
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Invite user
            </Button>
          </div>
          <div className="space-y-2">
            {filteredUsers.map((u) => (
              <div key={u.id} className="rounded-xl border border-white/10 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-white/55">{u.email}</p>
                </div>
                <Select
                  value={u.role}
                  onValueChange={(value) =>
                    (() => {
                      const nextRole = value as "owner" | "caregiver" | "viewer";
                      const ownerSensitive = u.role === "owner" || nextRole === "owner";
                      if (ownerSensitive) {
                        setPendingRoleChange({ userId: u.id, name: u.name, nextRole });
                        return;
                      }
                      updateFamilyUserRole(u.id, nextRole)
                        .then(() => toast.success(`Role updated for ${u.name}`))
                        .catch((err: Error) => toast.error(err.message || "Role update failed"));
                    })()
                  }
                >
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="caregiver">Caregiver</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          </div>
        )}

        {activeTab === "members" && (
          <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold">Member management</p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Search members by name, relationship, notes"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() =>
                exportCsv(
                  "family-members.csv",
                  filteredMembers.map((m) => ({
                    name: m.name,
                    age: m.age,
                    relationship: m.relationship,
                    notes: m.notes || ""
                  }))
                )
              }
            >
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Member name"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              className="col-span-2"
            />
            <Input
              placeholder="Age"
              type="number"
              value={memberAge}
              onChange={(e) => setMemberAge(e.target.value)}
            />
            <Input
              placeholder="Relationship"
              value={memberRelation}
              onChange={(e) => setMemberRelation(e.target.value)}
            />
            <Input
              placeholder="Notes (optional)"
              value={memberNotes}
              onChange={(e) => setMemberNotes(e.target.value)}
              className="col-span-2"
            />
            <Button
              className="col-span-2"
              onClick={() => {
                const age = Number(memberAge);
                if (!memberName.trim() || !memberRelation.trim() || !Number.isFinite(age) || age <= 0) {
                  toast.error("Provide valid name, age and relationship");
                  return;
                }
                addMember({
                  name: memberName.trim(),
                  age,
                  relationship: memberRelation.trim(),
                  notes: memberNotes.trim() || undefined
                })
                  .then(() => {
                    setMemberName("");
                    setMemberAge("");
                    setMemberRelation("");
                    setMemberNotes("");
                    toast.success("Member added");
                  })
                  .catch((err: Error) => toast.error(err.message || "Failed to add member"));
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add member
            </Button>
          </div>
          <div className="space-y-2">
            {filteredMembers.map((m) => (
              <div key={m.id} className="rounded-xl border border-white/10 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {m.name} ({m.age})
                  </p>
                  <p className="text-xs text-white/55">{m.relationship}</p>
                </div>
                <Button
                  variant="destructive"
                  className="h-8"
                  onClick={() => setPendingMemberDelete({ id: m.id, name: m.name })}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          </div>
        )}

        {activeTab === "alerts" && (
          <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold">Latest notifications</p>
          </div>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Search alerts by message or severity"
              value={alertQuery}
              onChange={(e) => setAlertQuery(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() =>
                exportCsv(
                  "alerts.csv",
                  filteredNotifications.map((n) => ({
                    createdAt: n.createdAt,
                    severity: n.severity,
                    isRead: n.isRead,
                    message: n.message
                  }))
                )
              }
            >
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          </div>
          <div className="space-y-2.5">
            {filteredNotifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`w-full text-left rounded-xl p-3 border ${
                  n.isRead ? "border-white/10 bg-black/10" : "border-success/30 bg-success/10"
                }`}
              >
                <p className="text-xs text-white/50">
                  {new Date(n.createdAt).toLocaleString()} · {n.severity}
                </p>
                <p className="text-sm mt-1">{n.message}</p>
              </button>
            ))}
            {filteredNotifications.length === 0 && <p className="text-xs text-white/50">No notifications found.</p>}
          </div>
          </div>
        )}

        {activeTab === "audit" && (
          <div className="rounded-2xl border border-white/10 bg-[#201d1b] p-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-4 w-4 text-warning" />
              <p className="text-sm font-semibold">Audit log viewer</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
              <Input
                placeholder="Filter by action (e.g. member.create)"
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
              />
              <Input
                placeholder="Filter by actor email"
                value={auditActorEmail}
                onChange={(e) => setAuditActorEmail(e.target.value)}
              />
              <Input
                type="datetime-local"
                value={auditFrom}
                onChange={(e) => setAuditFrom(e.target.value)}
              />
              <Input
                type="datetime-local"
                value={auditTo}
                onChange={(e) => setAuditTo(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAuditOffset(0);
                    fetchAuditLogs(0);
                  }}
                >
                  <FileSearch className="h-4 w-4 mr-2" /> Apply
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    exportCsv(
                      "audit-logs.csv",
                      auditRows.map((r) => ({
                        createdAt: r.createdAt,
                        actorEmail: r.actorEmail,
                        action: r.action,
                        targetType: r.targetType,
                        targetId: r.targetId || "",
                        metadata: JSON.stringify(r.metadata || {})
                      }))
                    )
                  }
                >
                  <Download className="h-4 w-4 mr-2" /> Export
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {auditRows.map((r) => (
                <div key={r.id} className="rounded-lg border border-white/10 p-3">
                  <p className="text-xs text-white/50">
                    {new Date(r.createdAt).toLocaleString()} · {r.actorEmail}
                  </p>
                  <p className="text-sm mt-1">
                    <span className="font-medium">{r.action}</span> on {r.targetType}
                    {r.targetId ? ` (${r.targetId})` : ""}
                  </p>
                  {Object.keys(r.metadata || {}).length > 0 ? (
                    <p className="text-xs text-white/55 mt-1 line-clamp-2">
                      metadata: {JSON.stringify(r.metadata)}
                    </p>
                  ) : null}
                </div>
              ))}
              {auditRows.length === 0 && <p className="text-xs text-white/50">No audit records found.</p>}
            </div>
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-white/50">
                Showing {auditRows.length ? auditOffset + 1 : 0}-
                {Math.min(auditOffset + auditRows.length, auditTotal)} of {auditTotal}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={auditOffset === 0}
                  onClick={() => {
                    const next = Math.max(auditOffset - auditLimit, 0);
                    fetchAuditLogs(next);
                  }}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={auditOffset + auditRows.length >= auditTotal}
                  onClick={() => fetchAuditLogs(auditOffset + auditLimit)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <AlertDialog
        open={!!pendingRoleChange}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingRoleChange(null);
            setPendingRolePassword("");
          }
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm role change</AlertDialogTitle>
            <AlertDialogDescription>
              You are updating owner-level permissions for {pendingRoleChange?.name || "this user"}.
              Enter your current account password to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="password"
            placeholder="Current account password"
            value={pendingRolePassword}
            onChange={(e) => setPendingRolePassword(e.target.value)}
            className="h-10 rounded-xl"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingRole}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmRoleChange();
              }}
              disabled={updatingRole}
            >
              {updatingRole ? "Updating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!pendingMemberDelete}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingMemberDelete(null);
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {pendingMemberDelete?.name || "this member"} and all related logs.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMember}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmMemberDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingMember}
            >
              {deletingMember ? "Deleting..." : "Delete member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
