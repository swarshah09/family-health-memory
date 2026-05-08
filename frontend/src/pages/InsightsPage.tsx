import { useApp } from "@/context/AppContext";
import type { Insight } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, AlertTriangle, Info, TrendingUp, Shield, Loader2, ListChecks, CheckCircle2, Circle } from "lucide-react";
import { motion } from "framer-motion";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

function consistencyHint(ins: Insight): string | null {
  const c = ins.confidence;
  if (typeof c !== "number" || Number.isNaN(c)) {
    return ins.source === "rules" ? "Based on recurring words in saved notes" : null;
  }
  if (c >= 0.78) return "Stronger repetition across your logs";
  if (c >= 0.62) return "Shows up repeatedly—worth noticing";
  return "Possible pattern—consider adding dates or details next time";
}

function insightTypeLabel(type?: Insight["type"]): string {
  if (type === "red_flag") return "Red flag";
  if (type === "frequency") return "Frequency";
  if (type === "correlation") return "Correlation";
  if (type === "anomaly") return "Anomaly";
  return "Trend";
}

function priorityPillClasses(priority?: Insight["priority"]): string {
  if (priority === "high") return "bg-destructive/10 text-destructive border-destructive/20";
  if (priority === "medium") return "bg-warning/10 text-warning border-warning/20";
  return "bg-muted/80 text-muted-foreground border-border/60";
}

export default function InsightsPage() {
  const { members, getAllInsights, insightsLoading } = useApp();
  const navigate = useNavigate();
  const insights = getAllInsights();

  const grouped: Record<string, typeof insights> = {};
  insights.forEach((ins) => {
    const member = members.find((m) => m.id === ins.memberId);
    const name = member?.name || "Unknown";
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(ins);
  });

  const totalAlerts = insights.filter((i) => i.severity === "alert").length;
  const totalWarnings = insights.filter((i) => i.severity === "warning").length;
  const hasInsights = insights.length > 0;
  const hasEvidenceLinked = insights.some((i) => (i.sourceLogIds || i.evidence || []).length > 0);
  const hasHighPriority = insights.some((i) => i.priority === "high" || i.severity === "alert");

  const showThinking = insightsLoading && insights.length === 0;
  const openEvidenceLog = (memberId: string, logId: string) => {
    navigate(`/member/${memberId}?logId=${encodeURIComponent(logId)}`);
  };

  return (
    <div className="app-shell app-safe-bottom">
      <motion.div
        className="px-5 pt-12 pb-6 relative overflow-hidden"
        style={{ background: "linear-gradient(180deg, #4f49a7 0%, #49439c 100%)" }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="organic-orb h-36 w-36 -top-12 -right-10" />
        <div className="organic-orb h-24 w-24 top-2 left-20" />
        <div className="flex items-center gap-3">
          <motion.button
            onClick={() => navigate("/")}
            className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
            whileTap={{ scale: 0.9 }}
            type="button"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" />
          </motion.button>
          <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-white text-lg">Family Insights</h1>
            <p className="text-[11px] text-white/70 leading-snug">
              Clear observations built from shared logs with linked evidence for quick review
            </p>
          </div>
        </div>
      </motion.div>

      {insights.length > 0 && (
        <motion.div
          className="px-5 py-4 grid grid-cols-3 gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          {[
            { label: "Alerts", value: totalAlerts, color: "destructive", icon: AlertTriangle },
            { label: "Warnings", value: totalWarnings, color: "warning", icon: Shield },
            { label: "Themes", value: insights.length, color: "primary", icon: TrendingUp },
          ].map(({ label, value, color, icon: Icon }) => (
            <motion.div
              key={label}
              className="glass-card rounded-2xl px-3 py-3.5 text-center"
              whileHover={{ scale: 1.02 }}
            >
              <div
                className="h-8 w-8 rounded-xl mx-auto mb-2 flex items-center justify-center"
                style={{ background: `hsl(var(--${color}) / 0.1)` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: `hsl(var(--${color}))` }} aria-hidden />
              </div>
              <p className="text-xl font-display font-bold text-foreground">{value}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      <motion.div
        className="px-5 py-3 space-y-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.details className="glass-card rounded-2xl p-4 group" variants={fadeUp}>
          <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Quick start (3 steps)</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {[hasInsights, hasEvidenceLinked, hasHighPriority].filter(Boolean).length}/3 done - Show steps
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground group-open:hidden">Expand</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden group-open:inline">Collapse</span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/30 pt-3">
            <p className="text-xs text-muted-foreground">
              This page turns raw logs into readable patterns so you can quickly decide what needs follow-up.
            </p>
            <div className="space-y-2">
              {[
                {
                  done: hasInsights,
                  title: "Check each member's pattern list",
                  desc: "Start by scanning the most recent insights for each person."
                },
                {
                  done: hasEvidenceLinked,
                  title: "Open evidence logs",
                  desc: "Tap log IDs to verify each insight against original notes."
                },
                {
                  done: hasHighPriority,
                  title: "Prioritize high alerts first",
                  desc: "Handle high-priority or alert-level items before low-priority observations."
                }
              ].map((step) => (
                <div key={step.title} className="rounded-xl border border-border/40 bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    {step.done ? (
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className={`text-xs font-medium ${step.done ? "text-success" : "text-foreground"}`}>{step.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.details>

        <motion.details className="glass-card rounded-2xl p-4 border border-border/40 group" variants={fadeUp}>
          <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Need help reading this page?</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Show guide</p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground group-open:hidden">Expand</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden group-open:inline">Collapse</span>
          </summary>
          <div className="mt-3 space-y-2.5 border-t border-border/30 pt-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Use these terms to decide what to follow up first.
            </p>
            <div className="space-y-1.5 text-[11px] text-foreground/85">
              <p><span className="font-semibold text-foreground">Info:</span> light observation, monitor over time.</p>
              <p><span className="font-semibold text-foreground">Warning:</span> repeated pattern, check in soon.</p>
              <p><span className="font-semibold text-foreground">Alert:</span> stronger concern, review today and consider clinical follow-up.</p>
              <p><span className="font-semibold text-foreground">Evidence logs:</span> source notes that support an insight.</p>
            </div>
          </div>
        </motion.details>

        {showThinking && (
          <motion.div
            className="glass-card rounded-2xl p-8 flex flex-col items-center gap-3 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Loader2 className="h-8 w-8 text-primary animate-spin" aria-hidden />
            <p className="text-sm font-medium text-foreground">Reviewing notes…</p>
            <p className="text-xs text-muted-foreground max-w-[280px]">
              We scan recent logs twice: once for repeated phrases (~30 days) and once for broader themes—this takes a moment.
            </p>
          </motion.div>
        )}

        {Object.entries(grouped).map(([name, memberInsights]) => (
          <motion.div key={name} variants={fadeUp}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-8 w-8 rounded-xl health-gradient-soft flex items-center justify-center border border-primary/10">
                <span className="text-primary font-display font-bold text-sm">{name[0]}</span>
              </div>
              <h2 className="text-sm font-display font-semibold text-foreground">{name}</h2>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {memberInsights.length} theme{memberInsights.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2.5 ml-1">
              {memberInsights.map((ins, i) => {
                const badge =
                  ins.source === "rules" ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/50">
                      <ListChecks className="h-3 w-3" aria-hidden />
                      Rule-based
                    </span>
                  ) : ins.source === "model" ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/15">
                      <Sparkles className="h-3 w-3" aria-hidden />
                      AI-assisted
                    </span>
                  ) : null;
                const hint = consistencyHint(ins);
                const summaryText = ins.summary || ins.description;
                const detailLines = (ins.details || []).filter(Boolean).slice(0, 3);
                const evidenceIds = (ins.sourceLogIds || ins.evidence || []).filter(Boolean);
                const snippetsByLogId = new Map(
                  (ins.evidenceSnippets || []).map((item) => [item.logId, item.snippet])
                );

                return (
                  <motion.div
                    key={ins.id}
                    className={`glass-card rounded-2xl p-4 border-l-[3px] ${
                      ins.severity === "alert"
                        ? "border-l-destructive"
                        : ins.severity === "warning"
                        ? "border-l-warning"
                        : "border-l-primary"
                    }`}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          background:
                            ins.severity === "alert"
                              ? "hsl(var(--destructive) / 0.1)"
                              : ins.severity === "warning"
                              ? "hsl(var(--warning) / 0.1)"
                              : "hsl(var(--primary) / 0.1)",
                        }}
                        aria-hidden
                      >
                        {ins.severity === "alert" ? (
                          <AlertTriangle className="h-4 w-4" style={{ color: "hsl(var(--destructive))" }} />
                        ) : ins.severity === "warning" ? (
                          <AlertTriangle className="h-4 w-4" style={{ color: "hsl(var(--warning))" }} />
                        ) : (
                          <Info className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                          <p className="text-sm font-semibold text-foreground leading-snug">{ins.title}</p>
                          {badge}
                          <span className="inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {insightTypeLabel(ins.type)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-medium ${priorityPillClasses(
                              ins.priority
                            )}`}
                          >
                            {`Priority: ${ins.priority || "medium"}`}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{summaryText}</p>
                        {detailLines.length > 0 && (
                          <ul className="space-y-1 pt-0.5">
                            {detailLines.map((line) => (
                              <li key={`${ins.id}-${line}`} className="text-[11px] text-foreground/80 leading-relaxed">
                                • {line}
                              </li>
                            ))}
                          </ul>
                        )}
                        {evidenceIds.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground/90">Evidence logs</p>
                            <div className="flex flex-wrap gap-1.5">
                              {evidenceIds.slice(0, 3).map((logId) => (
                                <button
                                  key={`${ins.id}-${logId}`}
                                  type="button"
                                  title={snippetsByLogId.get(logId) || "Open source log"}
                                  onClick={() => openEvidenceLog(ins.memberId, logId)}
                                  className="inline-flex items-center rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
                                >
                                  {logId}
                                </button>
                              ))}
                              {evidenceIds.length > 3 ? (
                                <span className="inline-flex items-center rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/90">
                                  +{evidenceIds.length - 3} more
                                </span>
                              ) : null}
                            </div>
                          </div>
                        )}
                        {ins.evidenceSnippets && ins.evidenceSnippets.length > 0 ? (
                          <div className="space-y-0.5 pt-0.5">
                            {ins.evidenceSnippets.slice(0, 2).map((item) => (
                              <p key={`${ins.id}-snippet-${item.logId}`} className="text-[10px] text-muted-foreground/80">
                                <span className="font-medium text-foreground/70">{item.logId}:</span> {item.snippet}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        {hint ? <p className="text-[10px] text-muted-foreground/80 italic">{hint}</p> : null}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-lg">
                          <TrendingUp className="h-3 w-3" aria-hidden />
                          <span className="font-medium">{ins.count} notes</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}

        {!showThinking && insights.length === 0 && (
          <motion.div
            className="text-center py-20 glass-card rounded-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="h-16 w-16 rounded-3xl bg-muted mx-auto mb-4 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-foreground font-display font-semibold">No themes yet—or still gathering detail</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-[300px] mx-auto leading-relaxed">
              Patterns appear after a few overlapping notes within the past month. Mention specific symptoms or times—short
              “fine today” logs help less than richer observations.
            </p>
          </motion.div>
        )}
      </motion.div>

      <div className="px-5 pb-4">
        <div className="rounded-2xl border border-warning/25 bg-warning/10 p-4">
          <p className="text-[10px] uppercase tracking-wider text-warning font-semibold">Important</p>
          <p className="text-xs text-foreground/85 mt-1.5 leading-relaxed">
            These summaries are reminders from YOUR saved notes—they are{" "}
            <span className="font-medium text-foreground">not medical diagnoses or emergency guidance</span>. Use them to
            prep questions for clinicians and to coordinate care calmly at home.
          </p>
        </div>
      </div>
    </div>
  );
}
