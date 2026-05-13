import { useApp } from "@/context/AppContext";
import type { Insight } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  Info,
  TrendingUp,
  Loader2,
  Stethoscope
} from "lucide-react";
import type { CareGuidanceItem } from "@/types/care-guidance";
import { formatEvidenceLogLabel } from "@/lib/evidence-log-label";
import { useAppHub } from "@/lib/hub-outlet";
import { motion } from "framer-motion";
import { CopyHint } from "@/components/CopyHint";
import { CARE_GUIDANCE_ROUTING, INSIGHTS_NON_CLINICAL } from "@/lib/disclaimer-copy";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

function priorityLabel(priority?: Insight["priority"]): string {
  if (priority === "high") return "High";
  if (priority === "medium") return "Medium";
  return "Low";
}

function priorityPillClasses(priority?: Insight["priority"]): string {
  if (priority === "high") return "bg-destructive/10 text-destructive border-destructive/20";
  if (priority === "medium") return "bg-warning/10 text-warning border-warning/20";
  return "bg-muted/80 text-muted-foreground border-border/60";
}

function careUrgencyClasses(urgency: CareGuidanceItem["urgency"]): string {
  if (urgency === "high") return "bg-warning/15 text-warning-foreground border-warning/30";
  if (urgency === "moderate") return "bg-primary/8 text-primary border-primary/20";
  return "bg-muted/70 text-muted-foreground border-border/60";
}

export default function InsightsPage() {
  const { members, logs, getAllInsights, getAllCareGuidance, careGuidanceDisclaimer, insightsLoading } = useApp();
  const navigate = useNavigate();
  const inInsightsHub = useAppHub()?.hub === "insights";
  const insights = getAllInsights();
  const careGuidanceItems = getAllCareGuidance();

  const grouped: Record<string, typeof insights> = {};
  insights.forEach((ins) => {
    const member = members.find((m) => m.id === ins.memberId);
    const name = member?.name || "Unknown";
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(ins);
  });

  const totalAlerts = insights.filter((i) => i.severity === "alert").length;
  const totalWarnings = insights.filter((i) => i.severity === "warning").length;

  const showThinking = insightsLoading && insights.length === 0;
  const openEvidenceLog = (memberId: string, logId: string) => {
    navigate(`/member/${memberId}?logId=${encodeURIComponent(logId)}`);
  };

  const careByMemberId = new Map<string, CareGuidanceItem[]>();
  for (const row of careGuidanceItems) {
    const arr = careByMemberId.get(row.memberId) || [];
    arr.push(row);
    careByMemberId.set(row.memberId, arr);
  }

  return (
    <div className="app-shell app-safe-bottom">
      <motion.div
        className={`px-5 pb-6 relative overflow-hidden ${inInsightsHub ? "pt-4" : "pt-12"}`}
        style={{ background: "linear-gradient(180deg, #4f49a7 0%, #49439c 100%)" }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="organic-orb h-36 w-36 -top-12 -right-10" />
        <div className="organic-orb h-24 w-24 top-2 left-20" />
        <div className="flex items-center gap-3">
          {!inInsightsHub && (
            <motion.button
              onClick={() => navigate("/")}
              className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
              whileTap={{ scale: 0.9 }}
              type="button"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-5 w-5" />
            </motion.button>
          )}
          <div className="min-w-0 flex flex-1 items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-white" aria-hidden />
            </div>
            <h1 className="font-display font-bold text-white text-lg">Family insights</h1>
            <CopyHint label="About these insights" content={INSIGHTS_NON_CLINICAL} className="text-white/80 hover:bg-white/15 hover:text-white" />
          </div>
        </div>
      </motion.div>

      {insights.length > 0 && (
        <motion.p
          className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          {totalAlerts > 0 ? (
            <>
              <span className="font-medium text-foreground">{totalAlerts}</span>{" "}
              {totalAlerts === 1 ? "item may" : "items may"} need attention soon.{" "}
            </>
          ) : null}
          {totalWarnings > 0 ? (
            <>
              <span className="font-medium text-foreground">{totalWarnings}</span>{" "}
              {totalWarnings === 1 ? "is" : "are"} worth a closer look.{" "}
            </>
          ) : null}
          {totalAlerts === 0 && totalWarnings === 0 ? "Here is what stood out from recent notes." : null}
        </motion.p>
      )}

      <motion.div
        className="px-5 py-3 space-y-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.details className="glass-card rounded-2xl p-4 border border-border/40 group" variants={fadeUp}>
          <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Tips</p>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground group-open:hidden">Show</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden group-open:inline">Hide</span>
          </summary>
          <div className="mt-3 space-y-2 border-t border-border/30 pt-3 text-[11px] text-muted-foreground leading-relaxed">
            <p>
              <span className="font-medium text-foreground">Info / Warning / Alert</span> — strength of the pattern in your notes.
            </p>
            <p>
              <span className="font-medium text-foreground">Evidence</span> — tap a log id to open the source note.
            </p>
            <p className="text-[10px] pt-1">{careGuidanceDisclaimer}</p>
          </div>
        </motion.details>

        <motion.section className="space-y-3" variants={fadeUp}>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
              <Stethoscope className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <h2 className="text-sm font-display font-semibold text-foreground">Care guidance</h2>
            <CopyHint label="About care guidance" content={CARE_GUIDANCE_ROUTING} />
          </div>

          {careGuidanceItems.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Nothing here yet — keep logging symptoms in plain language.</p>
          ) : (
            <div className="space-y-5">
              {[...careByMemberId.entries()].map(([memberId, rows]) => {
                const memberLabel =
                  rows[0]?.memberName?.trim() ||
                  members.find((m) => m.id === memberId)?.name ||
                  "Family member";
                return (
                <div key={memberId} className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{memberLabel}</p>
                  <div className="space-y-2.5">
                    {rows.map((row, i) => (
                      <motion.div
                        key={row.id}
                        className="rounded-2xl border border-border/50 bg-card/40 p-4 shadow-sm"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                      >
                        <div className="flex flex-wrap items-start gap-2 gap-y-1.5">
                          <p className="text-sm font-semibold text-foreground leading-snug">{row.symptomLabel}</p>
                          <span
                            className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-medium capitalize ${careUrgencyClasses(
                              row.urgency
                            )}`}
                          >
                            Urgency: {row.urgency}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{row.category}</p>
                        <p className="text-[11px] text-foreground/85 mt-2 leading-relaxed">
                          <span className="font-medium text-foreground/90">Consider discussing with:</span>{" "}
                          {row.suggestedSpecialist}
                        </p>
                        <p className="text-xs text-foreground/90 mt-2 leading-relaxed">{row.explanation}</p>
                        {row.evidenceLogIds.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] text-muted-foreground/90">Related notes</p>
                            <div className="flex flex-wrap gap-1.5">
                              {row.evidenceLogIds.slice(0, 4).map((logId) => (
                                <button
                                  key={`${row.id}-${logId}`}
                                  type="button"
                                  title={formatEvidenceLogLabel(logId, logs, { memberId: row.memberId, maxLen: 120 })}
                                  onClick={() => openEvidenceLog(row.memberId, logId)}
                                  className="inline-flex items-center max-w-[min(100%,14rem)] rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors text-left truncate"
                                >
                                  {formatEvidenceLogLabel(logId, logs, { memberId: row.memberId, maxLen: 48 })}
                                </button>
                              ))}
                              {row.evidenceLogIds.length > 4 ? (
                                <span className="text-[10px] text-muted-foreground/90 py-0.5">
                                  +{row.evidenceLogIds.length - 4} more
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </motion.div>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          <details className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground/80">Notice</summary>
            <p className="mt-2 leading-relaxed">{careGuidanceDisclaimer}</p>
          </details>
        </motion.section>

        {showThinking && (
          <motion.div
            className="glass-card rounded-2xl p-8 flex flex-col items-center gap-3 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Loader2 className="h-8 w-8 text-primary animate-spin" aria-hidden />
            <p className="text-sm font-medium text-foreground">Pulling together highlights…</p>
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
                          <span
                            className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-medium ${priorityPillClasses(
                              ins.priority
                            )}`}
                          >
                            {priorityLabel(ins.priority)}
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
                            <p className="text-[10px] text-muted-foreground/90">Related notes</p>
                            <div className="flex flex-wrap gap-1.5">
                              {evidenceIds.slice(0, 3).map((logId) => (
                                <button
                                  key={`${ins.id}-${logId}`}
                                  type="button"
                                  title={formatEvidenceLogLabel(logId, logs, {
                                    memberId: ins.memberId,
                                    snippet: snippetsByLogId.get(logId),
                                    maxLen: 140
                                  })}
                                  onClick={() => openEvidenceLog(ins.memberId, logId)}
                                  className="inline-flex items-center max-w-[min(100%,14rem)] rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors text-left truncate"
                                >
                                  {formatEvidenceLogLabel(logId, logs, {
                                    memberId: ins.memberId,
                                    snippet: snippetsByLogId.get(logId),
                                    maxLen: 48
                                  })}
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
          <p className="px-5 py-10 text-center text-[11px] text-muted-foreground">No patterns yet — a few detailed notes usually bring the first themes.</p>
        )}
      </motion.div>

    </div>
  );
}
