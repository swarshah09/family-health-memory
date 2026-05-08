import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import type { HealthLog } from "@/context/AppContext";
import { ArrowLeft, Plus, Mic, Sparkles, Trash2, FileText, Search, Download, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AddLogDialog from "@/components/AddLogDialog";
import EditLogDialog from "@/components/EditLogDialog";
import EditMemberDialog from "@/components/EditMemberDialog";
import InsightBadge from "@/components/InsightBadge";
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
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

type WeeklyDigest = {
  id?: string;
  userId?: string;
  personId?: string;
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
};

type TimelineNarrativeEvent = {
  id: string;
  title: string;
  description: string;
  stage: "onset" | "progression" | "recurrence" | "cluster";
  symptoms: string[];
  startAt: string;
  endAt: string;
  sourceLogIds: string[];
};

type DoctorVisitSummary = {
  title: string;
  periodLabel: string;
  generatedAt: string;
  recurringSymptoms: Array<{ symptom: string; count: number }>;
  trendAnalysis: Array<{ symptom: string; count: number; previousCount: number; trend: "increasing" | "decreasing" | "stable" }>;
  majorChangesTimeline: Array<{ date: string; event: string; details: string }>;
  medicationObservations: string[];
  summary: string;
};

function formatDateGroup(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    user,
    members,
    getLogsForMember,
    getInsightsForMember,
    removeMember,
    removeLog,
    hasPendingVoiceLogs,
    lastDataRefreshAt
  } = useApp();
  const [showAddLog, setShowAddLog] = useState(false);
  const [editingLog, setEditingLog] = useState<HealthLog | null>(null);
  const [showEditMember, setShowEditMember] = useState(false);
  const [query, setQuery] = useState("");
  const [nowTs, setNowTs] = useState(Date.now());
  const [logPendingDelete, setLogPendingDelete] = useState<HealthLog | null>(null);
  const [deletingLog, setDeletingLog] = useState(false);
  const [memberPendingDelete, setMemberPendingDelete] = useState(false);
  const [deletingMember, setDeletingMember] = useState(false);
  const [digests, setDigests] = useState<WeeklyDigest[]>([]);
  const [digestsLoading, setDigestsLoading] = useState(false);
  const [expandedDigestIds, setExpandedDigestIds] = useState<Record<string, boolean>>({});
  const [timelineEvents, setTimelineEvents] = useState<TimelineNarrativeEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [focusedLogId, setFocusedLogId] = useState<string | null>(null);
  const [doctorSummary, setDoctorSummary] = useState<DoctorVisitSummary | null>(null);
  const [doctorSummaryLoading, setDoctorSummaryLoading] = useState(false);

  const member = members.find((m) => m.id === id);
  if (!member)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Member not found</p>
      </div>
    );

  const logs = getLogsForMember(member.id);
  const insights = getInsightsForMember(member.id);
  const pendingVoice = hasPendingVoiceLogs(member.id);
  const token = localStorage.getItem("fhm_access_token");
  const selectedLogIdFromUrl = searchParams.get("logId");

  useEffect(() => {
    if (!pendingVoice) return;
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pendingVoice]);

  useEffect(() => {
    if (!selectedLogIdFromUrl) return;
    setFocusedLogId(selectedLogIdFromUrl);
    const node = document.getElementById(`log-${selectedLogIdFromUrl}`);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => {
      setFocusedLogId(null);
      const next = new URLSearchParams(searchParams);
      next.delete("logId");
      setSearchParams(next, { replace: true });
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [selectedLogIdFromUrl, searchParams, setSearchParams]);

  useEffect(() => {
    if (!user?.id || !token) return;
    setDigestsLoading(true);
    fetch(`${API_BASE_URL}/api/digests/${user.id}/${member.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load digests");
        const json = (await response.json()) as { digests?: WeeklyDigest[] };
        setDigests(json.digests || []);
      })
      .catch(() => {
        setDigests([]);
      })
      .finally(() => setDigestsLoading(false));
  }, [user?.id, member.id, token]);

  useEffect(() => {
    if (!user?.familyId || !token) return;
    setTimelineLoading(true);
    fetch(`${API_BASE_URL}/api/families/${user.familyId}/timeline/${member.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load timeline events");
        const json = (await response.json()) as { events?: TimelineNarrativeEvent[] };
        setTimelineEvents(json.events || []);
      })
      .catch(() => {
        setTimelineEvents([]);
      })
      .finally(() => setTimelineLoading(false));
  }, [user?.familyId, member.id, token, logs.length]);

  useEffect(() => {
    if (!user?.familyId || !token) return;
    setDoctorSummaryLoading(true);
    fetch(`${API_BASE_URL}/api/families/${user.familyId}/doctor-summary/${member.id}?days=30`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load doctor summary");
        const json = (await response.json()) as { summary?: DoctorVisitSummary };
        setDoctorSummary(json.summary || null);
      })
      .catch(() => setDoctorSummary(null))
      .finally(() => setDoctorSummaryLoading(false));
  }, [user?.familyId, member.id, token, logs.length]);

  const lastUpdatedText = (() => {
    if (!lastDataRefreshAt) return "sync pending";
    const seconds = Math.max(0, Math.floor((nowTs - lastDataRefreshAt) / 1000));
    return `last updated ${seconds}s ago`;
  })();

  const grouped: Record<string, typeof logs> = {};
  logs
    .filter((log) => log.text.toLowerCase().includes(query.toLowerCase()))
    .forEach((log) => {
    const key = formatDateGroup(new Date(log.timestamp));
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(log);
  });

  const handleRemove = () => {
    setMemberPendingDelete(true);
  };

  const confirmRemoveMember = () => {
    if (deletingMember) return;
    setDeletingMember(true);
    removeMember(member.id)
      .then(() => {
        toast.success(`${member.name} removed`);
        setMemberPendingDelete(false);
        navigate("/");
      })
      .catch(() => toast.error("Could not remove member"))
      .finally(() => setDeletingMember(false));
  };

  const handleExportReport = () => {
    const reportLines = [
      `Family Health Memory Report`,
      `Member: ${member.name}`,
      `Age: ${member.age}`,
      `Relationship: ${member.relationship}`,
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "Recent Insights:",
      ...insights.slice(0, 6).map((ins) => {
        const how =
          ins.source === "model" ? " AI narrative" : ins.source === "rules" ? " recurring phrase" : "";
        return `- ${ins.title} (${ins.count} notes, ${ins.severity}${how})`;
      }),
      "",
      "Recent Logs:",
      ...logs.slice(0, 20).map((log) => `- [${new Date(log.timestamp).toLocaleString()}] ${log.text}`)
    ];
    const blob = new Blob([reportLines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${member.name.toLowerCase().replace(/\s+/g, "-")}-health-report.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  const openPrintableDoctorSummary = () => {
    navigate(`/member/${member.id}/doctor-summary`);
  };

  const handleDeleteLog = (log: HealthLog) => {
    setLogPendingDelete(log);
  };

  const openSourceLog = (logId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("logId", logId);
    setSearchParams(next);
  };

  const confirmDeleteLog = () => {
    if (!logPendingDelete || deletingLog) return;
    setDeletingLog(true);
    removeLog(logPendingDelete.id)
      .then(() => {
        toast.success("Log deleted");
        setLogPendingDelete(null);
      })
      .catch((error: Error) => toast.error(error.message || "Could not delete log"))
      .finally(() => setDeletingLog(false));
  };

  return (
    <div className="app-shell app-safe-bottom">
      {/* Header */}
      <motion.div
        className="bg-card border-b border-border/40 px-5 pt-12 pb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <motion.button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft className="h-5 w-5" />
          </motion.button>
          <motion.div
            className="h-12 w-12 rounded-2xl health-gradient-soft flex items-center justify-center border border-primary/10"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <span className="text-primary font-display font-bold text-lg">{member.name[0]}</span>
          </motion.div>
          <div className="flex-1">
            <h1 className="font-display font-bold text-foreground text-lg">{member.name}</h1>
            <p className="text-xs text-muted-foreground">{member.age} years · {member.relationship}</p>
          </div>
          <motion.button
            onClick={() => setShowEditMember(true)}
            className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <Pencil className="h-4 w-4" />
          </motion.button>
          <motion.button
            onClick={handleExportReport}
            className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
            whileTap={{ scale: 0.9 }}
            title="Export quick text report"
          >
            <Download className="h-4 w-4" />
          </motion.button>
          <motion.button
            onClick={openPrintableDoctorSummary}
            className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors text-xs"
            whileTap={{ scale: 0.9 }}
            title="Print / Save PDF doctor summary"
          >
            PDF
          </motion.button>
          <motion.button
            onClick={handleRemove}
            className="text-muted-foreground hover:text-destructive p-2 rounded-xl hover:bg-destructive/10 transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <Trash2 className="h-4 w-4" />
          </motion.button>
        </div>
        {member.notes && (
          <motion.div
            className="text-xs text-muted-foreground bg-muted/60 rounded-xl px-4 py-3 border border-border/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="font-medium text-foreground/70">Medical Notes:</span> {member.notes}
          </motion.div>
        )}
      </motion.div>

      {/* AI Insights strip */}
      <AnimatePresence>
        {insights.length > 0 && (
          <motion.div
            className="px-5 py-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <motion.div
                className="h-6 w-6 rounded-lg bg-insight/10 flex items-center justify-center"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 3 }}
              >
                <Sparkles className="h-3.5 w-3.5 text-insight" />
              </motion.div>
              <span className="text-sm font-display font-semibold text-foreground">AI Insights</span>
              <span className="text-xs text-muted-foreground">• Past 7 days</span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
              {insights.map((ins, i) => (
                <motion.div
                  key={ins.id}
                  className={`flex-shrink-0 glass-card rounded-xl px-4 py-3 max-w-[220px] border-l-2 ${
                    ins.severity === "alert"
                      ? "border-l-destructive"
                      : ins.severity === "warning"
                      ? "border-l-warning"
                      : "border-l-primary"
                  }`}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <p className="text-xs font-medium text-foreground leading-snug">{ins.title}</p>
                  <div className="mt-2">
                    <InsightBadge severity={ins.severity} text={`${ins.count}× this week`} />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-5 py-2">
        <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-3 mb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-display font-semibold text-foreground">Doctor Visit Summary</p>
              <p className="section-subtitle">Readable 30-day clinical handoff snapshot</p>
            </div>
            <button
              type="button"
              onClick={openPrintableDoctorSummary}
              className="text-xs rounded-lg px-3 py-1.5 bg-primary text-primary-foreground"
            >
              Print / PDF
            </button>
          </div>
          {doctorSummaryLoading ? (
            <p className="text-xs text-muted-foreground">Preparing summary...</p>
          ) : doctorSummary ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{doctorSummary.summary}</p>
              <ul className="space-y-1">
                {doctorSummary.recurringSymptoms.slice(0, 3).map((item) => (
                  <li key={item.symptom} className="text-[11px] text-foreground/85">• {item.symptom} ({item.count})</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No doctor summary available yet.</p>
          )}
        </div>
        <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-3">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div>
              <p className="text-sm font-display font-semibold text-foreground">Weekly Digest</p>
              <p className="section-subtitle">Precomputed weekly trends and comparisons</p>
            </div>
          </div>
          {digestsLoading ? (
            <p className="text-xs text-muted-foreground">Loading digest...</p>
          ) : digests.length === 0 ? (
            <p className="text-xs text-muted-foreground">No weekly digest available yet.</p>
          ) : (
            <div className="space-y-3">
              {digests.slice(0, 4).map((digest, index) => {
                const digestId = digest.id || `${digest.generatedAt}-${index}`;
                const expanded = Boolean(expandedDigestIds[digestId]);
                return (
                  <div key={digestId} className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{digest.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{digest.summary}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(digest.generatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {digest.comparison.symptomIncrease.slice(0, 2).map((item) => (
                        <span key={`inc-${item}`} className="chip-soft bg-warning/15 text-warning border-warning/30">
                          {item} ↑
                        </span>
                      ))}
                      {digest.comparison.symptomDecrease.slice(0, 2).map((item) => (
                        <span key={`dec-${item}`} className="chip-soft bg-success/15 text-success border-success/30">
                          {item} ↓
                        </span>
                      ))}
                      {digest.comparison.newlyAppeared.slice(0, 2).map((item) => (
                        <span key={`new-${item}`} className="chip-soft bg-primary/15 text-primary border-primary/30">
                          New: {item}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-1">
                      {(expanded ? digest.highlights : digest.highlights.slice(0, 2)).map((hl, idx) => (
                        <div key={`${hl.title}-${idx}`} className="rounded-lg border border-border/30 bg-background/60 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold text-foreground">{hl.title}</p>
                            <span className="text-[10px] text-muted-foreground">
                              {hl.priority} · {Math.round((hl.confidence || 0) * 100)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{hl.description}</p>
                          {hl.evidenceSnippets?.length ? (
                            <div className="mt-1 space-y-0.5">
                              {hl.evidenceSnippets.slice(0, expanded ? 3 : 1).map((snip) => (
                                <p key={`${hl.title}-${snip.logId}`} className="text-[10px] text-muted-foreground/90">
                                  <button
                                    type="button"
                                    className="underline underline-offset-2"
                                    onClick={() => openSourceLog(snip.logId)}
                                  >
                                    {snip.logId}
                                  </button>
                                  : {snip.snippet}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    {digest.highlights.length > 2 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDigestIds((prev) => ({
                            ...prev,
                            [digestId]: !prev[digestId]
                          }))
                        }
                        className="text-[11px] text-primary"
                      >
                        {expanded ? "Show less" : `Show ${digest.highlights.length - 2} more highlights`}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-2">
        <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-3">
          <div>
            <p className="text-sm font-display font-semibold text-foreground">Timeline Narrative</p>
            <p className="text-xs text-muted-foreground">Chronological symptom progression events</p>
          </div>
          {timelineLoading ? (
            <p className="text-xs text-muted-foreground">Building timeline narrative...</p>
          ) : timelineEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No timeline narrative events yet.</p>
          ) : (
            <div className="space-y-2">
              {timelineEvents.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-xl border border-border/40 bg-muted/30 px-3 py-2 interactive-row">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">{event.title}</p>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{event.stage}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{event.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(event.startAt).toLocaleDateString()} - {new Date(event.endAt).toLocaleDateString()}
                  </p>
                  {event.sourceLogIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {event.sourceLogIds.slice(0, 3).map((logId) => (
                        <button
                          key={`${event.id}-${logId}`}
                          type="button"
                          onClick={() => openSourceLog(logId)}
                          className="inline-flex items-center rounded-md border border-border/70 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
                        >
                          {logId}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="px-5 py-4">
        {pendingVoice && (
          <div className="mb-3 text-[11px] text-warning bg-warning/10 border border-warning/25 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
            <span>Voice transcription is still processing. This timeline updates automatically.</span>
            <span className="text-warning/80">{lastUpdatedText}</span>
          </div>
        )}
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-display font-semibold text-foreground">Health Timeline</h2>
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-xs text-muted-foreground">({logs.length} entries)</span>
        </div>
        <div className="glass-card rounded-xl px-3 py-2.5 mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symptoms, medication, sleep..."
            className="bg-transparent text-sm flex-1 outline-none placeholder:text-muted-foreground"
          />
        </div>

        {Object.entries(grouped).map(([dateLabel, dateLogs]) => (
          <div key={dateLabel} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2">{dateLabel}</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>

            <motion.div className="space-y-3" variants={stagger} initial="hidden" animate="show">
              {dateLogs.map((log) => (
                <motion.div key={log.id} id={`log-${log.id}`} className="flex gap-3" variants={fadeUp}>
                  <div className="flex flex-col items-center pt-1">
                    <motion.div
                      className={`h-3 w-3 rounded-full ring-4 ring-background ${
                        log.type === "voice" ? "bg-accent" : "bg-primary"
                      }`}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    />
                    <div className="w-px flex-1 bg-gradient-to-b from-border to-transparent mt-1" />
                  </div>
                  <motion.div
                    className={`glass-card rounded-2xl p-4 flex-1 mb-1 ${
                      focusedLogId === log.id ? "ring-2 ring-primary/50" : ""
                    }`}
                    whileHover={{ scale: 1.01 }}
                  >
                    <div className="flex items-center gap-2 mb-1.5 justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {log.type === "voice" && (
                          <div className="h-5 w-5 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                            <Mic className="h-3 w-3 text-accent" />
                          </div>
                        )}
                        <span className="text-[11px] text-muted-foreground font-medium">
                          {format(new Date(log.timestamp), "h:mm a")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <motion.button
                          type="button"
                          onClick={() => setEditingLog(log)}
                          className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/80 shrink-0"
                          whileTap={{ scale: 0.92 }}
                          aria-label="Edit log"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </motion.button>
                        <motion.button
                          type="button"
                          onClick={() => handleDeleteLog(log)}
                          className="text-muted-foreground hover:text-destructive p-1.5 rounded-lg hover:bg-destructive/10 shrink-0"
                          whileTap={{ scale: 0.92 }}
                          aria-label="Delete log"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </motion.button>
                      </div>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{log.text}</p>
                    {log.type === "voice" && log.transcriptionStatus && (
                      <div className="mt-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            log.transcriptionStatus === "completed"
                              ? "bg-success/15 border-success/30 text-success"
                              : log.transcriptionStatus === "failed"
                                ? "bg-destructive/15 border-destructive/30 text-destructive"
                                : "bg-warning/15 border-warning/30 text-warning"
                          }`}
                        >
                          {log.transcriptionStatus === "completed"
                            ? "Transcript ready"
                            : log.transcriptionStatus === "failed"
                              ? "Transcription failed"
                              : "Transcription in progress"}
                        </span>
                      </div>
                    )}
                    {log.tags && log.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {log.tags.map((tag) => (
                          <span
                            key={`${log.id}-${tag}`}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        ))}

        {logs.length === 0 && (
          <motion.div
            className="text-center py-20 glass-card rounded-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="doc-stack mb-4">
              <span />
              <span />
              <span>
                <FileText className="h-6 w-6 text-muted-foreground/45" />
              </span>
            </div>
            <p className="text-foreground font-display font-semibold">No logs yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tap + to add the first observation</p>
          </motion.div>
        )}
      </div>

      {/* FAB */}
      <motion.button
        onClick={() => setShowAddLog(true)}
        className="fixed fab-above-dock right-5 sm:right-6 h-14 w-14 rounded-2xl bg-accent shadow-glow-lg flex items-center justify-center z-50"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, delay: 0.4 }}
      >
        <Plus className="h-6 w-6 text-primary-foreground" />
      </motion.button>

      <AddLogDialog open={showAddLog} onClose={() => setShowAddLog(false)} memberId={member.id} />
      <EditLogDialog open={!!editingLog} onClose={() => setEditingLog(null)} log={editingLog} />
      <EditMemberDialog open={showEditMember} onClose={() => setShowEditMember(false)} member={member} />
      <AlertDialog open={!!logPendingDelete} onOpenChange={(nextOpen) => !nextOpen && setLogPendingDelete(null)}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this log entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this note from {member.name}&apos;s timeline. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 line-clamp-2">
            {logPendingDelete?.text || ""}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingLog}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmDeleteLog();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingLog}
            >
              {deletingLog ? "Deleting..." : "Delete log"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={memberPendingDelete} onOpenChange={setMemberPendingDelete}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {member.name} and all timeline logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMember}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmRemoveMember();
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
