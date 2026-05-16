import { useApp } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Heart,
  Plus,
  Sparkles,
  UserPlus
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AddMemberDialog from "@/components/AddMemberDialog";
import AddLogDialog from "@/components/AddLogDialog";
import PulseScanCard from "@/components/PulseScanCard";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { canOpenAddLogDialog, pickDefaultLogMemberId } from "@/lib/pick-default-log-member";
import { isHeadUser } from "@/lib/collaboration-roles";
import { sortLogsNewestFirst } from "../lib/dashboard-from-logs";

export default function Dashboard() {
  const {
    user,
    members,
    logs,
    getAllInsights,
    getLogsForMember,
    pendingJoinInboxCount,
    workspaceName,
    workspaceTagline,
    dashboardPeopleFilterId
  } = useApp();
  const navigate = useNavigate();
  const [showAddMember, setShowAddMember] = useState(false);
  const [addLogOpen, setAddLogOpen] = useState(false);
  const [addLogMemberId, setAddLogMemberId] = useState("");
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  const insights = getAllInsights();
  const alertCount = insights.filter((i) => i.severity === "alert").length;
  const warningCount = insights.filter((i) => i.severity === "warning").length;

  const trackedMembers = useMemo(
    () => members.filter((m) => !m.linkedUserId || m.linkedUserId !== user?.id),
    [members, user?.id]
  );

  const filteredMembers = useMemo(() => {
    if (!dashboardPeopleFilterId) return trackedMembers;
    return trackedMembers.filter((m) => m.id === dashboardPeopleFilterId);
  }, [trackedMembers, dashboardPeopleFilterId]);

  const filteredLogs = useMemo(() => {
    const base = logs.filter((l) => trackedMembers.some((m) => m.id === l.memberId));
    const scoped = dashboardPeopleFilterId
      ? base.filter((l) => l.memberId === dashboardPeopleFilterId)
      : base;
    return sortLogsNewestFirst(scoped);
  }, [logs, trackedMembers, dashboardPeopleFilterId]);

  const filteredInsights = useMemo(() => {
    const base = insights.filter((i) => trackedMembers.some((m) => m.id === i.memberId));
    return dashboardPeopleFilterId ? base.filter((i) => i.memberId === dashboardPeopleFilterId) : base;
  }, [insights, trackedMembers, dashboardPeopleFilterId]);

  const myHealthMember = useMemo(
    () => members.find((m) => m.linkedUserId === user?.id),
    [members, user?.id]
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLine = new Date()
    .toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();

  const workspaceTitle = workspaceName?.trim() || user?.familyName?.trim() || "Your family";

  const pulseScanMember = useMemo(() => {
    const list = filteredMembers.length ? filteredMembers : trackedMembers;
    return list[0];
  }, [filteredMembers, trackedMembers]);

  const inactiveMembersLabel = useMemo(() => {
    const list = filteredMembers.length ? filteredMembers : trackedMembers;
    const quiet = list.filter((member) => {
      const memberLogs = getLogsForMember(member.id);
      if (!memberLogs.length) return true;
      const last = new Date(memberLogs[0].timestamp).getTime();
      return Date.now() - last > 1000 * 60 * 60 * 24 * 3;
    });
    if (!quiet.length) return "";
    return quiet.map((m) => `${m.name} (${m.relationship})`).join(", ");
  }, [filteredMembers, trackedMembers, getLogsForMember]);

  const weatherHeadline = useMemo(() => {
    const top = filteredInsights[0];
    if (alertCount > 0) return "A few threads need a gentle look.";
    if (warningCount > 0 || inactiveMembersLabel) return "Mostly calm, with one gentle watch.";
    if (top?.title) return top.title.length > 72 ? `${top.title.slice(0, 70)}…` : top.title;
    return "Mostly calm, with one gentle watch.";
  }, [filteredInsights, alertCount, warningCount, inactiveMembersLabel]);

  const weatherBody = useMemo(() => {
    const top = filteredInsights[0];
    if (top?.description) {
      const t = top.description.trim();
      return t.length > 220 ? `${t.slice(0, 217)}…` : t;
    }
    if (inactiveMembersLabel) {
      return `${inactiveMembersLabel} could use a quiet check-in when you have a moment.`;
    }
    return "Your notes are weaving together steadily — keep capturing small moments; patterns emerge when you least force them.";
  }, [filteredInsights, inactiveMembersLabel]);

  const canAddObservation = canOpenAddLogDialog(members, user);

  const timelineCap = timelineExpanded ? 10 : 1;
  const timelineLogs = useMemo(() => filteredLogs.slice(0, timelineCap), [filteredLogs, timelineCap]);
  const collapsedMoreCount = Math.max(0, filteredLogs.length - 1);
  const showTimelineToggle = filteredLogs.length > 1 || timelineExpanded;

  useEffect(() => {
    setTimelineExpanded(false);
  }, [dashboardPeopleFilterId]);

  const openAddLog = () => {
    const pick = pickDefaultLogMemberId(members, user?.id, dashboardPeopleFilterId, user);
    if (!pick) {
      if (isHeadUser(user)) setShowAddMember(true);
      return;
    }
    setAddLogMemberId(pick);
    setAddLogOpen(true);
  };

  const memberDotClass = (memberId: string) => {
    const sev = insights.filter((i) => i.memberId === memberId).map((i) => i.severity);
    if (sev.includes("alert")) return "bg-accent ring-2 ring-accent/30";
    if (sev.includes("warning")) return "bg-amber-400 ring-2 ring-amber-400/35";
    return "bg-primary/55 ring-2 ring-primary/25";
  };

  return (
    <div className="app-shell app-safe-bottom">
      <div className="relative border-b border-border/40 bg-background">
        <div className="mx-auto max-w-[min(88rem,calc(100%-1.5rem))] px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-5 lg:px-8 lg:pb-12 lg:pt-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{dateLine}</p>
          <div className="mt-4 max-w-3xl">
            <h1 className="font-serif-display text-[1.65rem] font-semibold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[2.35rem]">
              {greeting}, {user?.name || "there"}.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Here&apos;s what your family quietly noted, sensed, and started caring about today.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-2.5">
              {canAddObservation ? (
                <Button type="button" className="btn-chronicle-primary rounded-full px-5 py-2 text-sm" onClick={openAddLog}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add observation
                </Button>
              ) : null}
              {(filteredInsights.length > 0 || alertCount > 0 || warningCount > 0) && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-border/70 bg-card/80 px-4 py-2 text-sm shadow-sm"
                  onClick={() => navigate("/insights/patterns")}
                >
                  <Sparkles className="mr-2 h-4 w-4 opacity-70" aria-hidden />
                  View patterns
                </Button>
              )}
              {myHealthMember && (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => navigate("/health/my")}
                >
                  <Heart className="mr-2 h-4 w-4 opacity-70" aria-hidden />
                  My health
                </Button>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <AnimatePresence>
              {alertCount > 0 && (
                <motion.button
                  type="button"
                  onClick={() => navigate("/insights/patterns")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/85 p-4 text-left dark:border-amber-900/45 dark:bg-amber-950/25"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                >
                  <Sparkles className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {alertCount} priority insight{alertCount > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">Open patterns when you have a quiet moment.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </motion.button>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {pendingJoinInboxCount > 0 && (
                <motion.button
                  type="button"
                  onClick={() => navigate("/family/workspace")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 p-4 text-left"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                >
                  <UserPlus className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {pendingJoinInboxCount} join request{pendingJoinInboxCount > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">Review on Family workspace.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[min(88rem,calc(100%-1.5rem))] space-y-6 px-4 py-8 sm:px-6 lg:space-y-8 lg:px-8 lg:py-10">
        {/* Top grid: weather + pulse scan */}
        <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
          <motion.section
            className="chronicle-card flex flex-col justify-between rounded-[1.75rem] p-6 sm:p-7 lg:col-span-6 lg:min-h-[17.5rem]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Today&apos;s family weather
              </p>
              <h2 className="font-serif-display mt-3 text-2xl font-semibold leading-snug text-foreground sm:text-[1.75rem]">
                {weatherHeadline}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{weatherBody}</p>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border/50 pt-5">
              {(filteredMembers.length ? filteredMembers : trackedMembers).map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-full border border-border/50 bg-muted/25 py-1 pl-1 pr-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-xs font-bold text-muted-foreground">
                    {(m.name?.trim()?.[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="text-xs font-medium text-foreground">{m.name}</span>
                  <span className={cn("ml-0.5 h-2.5 w-2.5 rounded-full", memberDotClass(m.id))} title="Status" />
                </div>
              ))}
            </div>
          </motion.section>

          <motion.div
            className="lg:col-span-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            <PulseScanCard
              memberId={pulseScanMember?.id}
              memberLabel={
                pulseScanMember
                  ? `${pulseScanMember.name} (${pulseScanMember.relationship})`
                  : "Your family"
              }
            />
          </motion.div>
        </div>

        {/* Timeline + insights */}
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
          <section className="lg:col-span-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  The family timeline
                </p>
                <h2 className="font-serif-display mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  A soft chronicle.
                </h2>
              </div>
              {canAddObservation ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-full border-border/70 text-xs"
                  onClick={openAddLog}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                  New
                </Button>
              ) : null}
            </div>
            <div className="relative mt-6 border-l border-border/60 pl-5 sm:pl-6">
              {filteredLogs.length === 0 ? (
                <p className="py-8 text-sm text-muted-foreground">No observations yet for this view.</p>
              ) : (
                <ul className="space-y-6">
                  {timelineLogs.map((log) => {
                    const member = members.find((m) => m.id === log.memberId);
                    const when = formatDistanceToNow(new Date(log.timestamp), { addSuffix: true });
                    return (
                      <li key={log.id} className="relative">
                        <span
                          className={cn(
                            "absolute -left-[calc(1.25rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background sm:-left-[calc(1.5rem+5px)]",
                            log.type === "voice" ? "bg-primary" : "bg-muted-foreground/50"
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => navigate(`/member/${log.memberId}`)}
                          className="w-full rounded-2xl border border-border/50 bg-card/80 p-4 text-left transition hover:border-primary/25 hover:bg-muted/20"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {when} · {new Date(log.timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                              {(member?.name?.[0] ?? "?").toUpperCase()}
                            </span>
                            {log.type === "voice" && (
                              <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Voice
                              </span>
                            )}
                            {log.tags?.slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="rounded-full border border-primary/15 bg-primary/8 px-2 py-0.5 text-[10px] font-medium capitalize text-primary"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 text-sm text-foreground">
                            <span className="font-medium">{member?.name}</span>
                            <span className="text-muted-foreground"> · noted by </span>
                            <span className="text-muted-foreground">You</span>
                          </p>
                          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                            {log.text || (log.type === "voice" ? "Voice observation" : "")}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {showTimelineToggle ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-4 w-full rounded-full text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setTimelineExpanded((open) => !open)}
                >
                  {timelineExpanded ? (
                    <>
                      <ChevronUp className="mr-2 h-4 w-4" aria-hidden />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-2 h-4 w-4" aria-hidden />
                      Show {collapsedMoreCount} more{" "}
                      {collapsedMoreCount === 1 ? "entry" : "entries"}
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </section>

          <section className="lg:col-span-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">AI insights · gentle</p>
            <h2 className="font-serif-display mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              What the memory noticed.
            </h2>
            <div className="mt-6 space-y-4">
              {filteredInsights.length === 0 ? (
                <div className="rounded-[1.75rem] border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                  Patterns will appear as you add observations. Visit{" "}
                  <button type="button" className="font-medium text-primary underline" onClick={() => navigate("/insights/patterns")}>
                    Insights
                  </button>{" "}
                  for the full view.
                </div>
              ) : (
                filteredInsights.slice(0, 4).map((ins) => {
                  const member = members.find((m) => m.id === ins.memberId);
                  const conf =
                    typeof ins.confidence === "number"
                      ? ins.confidence <= 1
                        ? Math.round(ins.confidence * 100)
                        : Math.round(ins.confidence)
                      : 84;
                  const bucket =
                    ins.keyword?.toLowerCase().includes("cardio") || ins.title.toLowerCase().includes("bp")
                      ? "Cardio"
                      : "Care";
                  return (
                    <article
                      key={ins.id}
                      className="chronicle-card rounded-[1.75rem] p-5 sm:p-6"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          AI insight · {bucket}
                        </p>
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {conf}% sure
                        </span>
                      </div>
                      <h3 className="mt-3 font-display text-lg font-semibold text-foreground sm:text-xl">{ins.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {(ins.description || ins.summary || "").length > 280
                          ? `${(ins.description || ins.summary || "").slice(0, 277)}…`
                          : ins.description || ins.summary || "A gentle read of your recent notes."}
                      </p>
                      <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-4">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                          {(member?.name?.[0] ?? user?.name?.[0] ?? "?").toUpperCase()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{member?.name ?? "Family"}</span>
                          {member?.relationship ? ` (${member.relationship})` : ""}
                        </span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* My health + family shortcuts */}
        <div className="grid gap-3 sm:grid-cols-2">
          {myHealthMember && (
            <button
              type="button"
              onClick={() => navigate(`/member/${myHealthMember.id}`)}
              className="chronicle-card flex items-center gap-4 rounded-[1.75rem] p-4 text-left transition hover:border-primary/25"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Heart className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">My health</p>
                <p className="mt-0.5 font-medium text-foreground">{myHealthMember.name}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/family/workspace")}
            className="chronicle-card flex items-center gap-4 rounded-[1.75rem] p-4 text-left transition hover:border-primary/25"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Clock className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Workspace</p>
              <p className="mt-0.5 font-medium text-foreground">{workspaceTitle}</p>
              {workspaceTagline?.trim() ? (
                <p className="truncate text-xs text-muted-foreground">{workspaceTagline.trim()}</p>
              ) : null}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
          </button>
        </div>

        {/* People you track — compact row */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">People you track</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs"
              onClick={() => setShowAddMember(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
              Add
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {trackedMembers.map((member) => {
              const memberLogs = getLogsForMember(member.id);
              const lastLog = memberLogs[0];
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => navigate(`/member/${member.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border/60 bg-card/90 px-3 py-2.5 text-left transition hover:border-primary/30 sm:max-w-[14rem]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                    {member.name[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{member.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {lastLog
                        ? `${formatDistanceToNow(new Date(lastLog.timestamp), { addSuffix: true })}`
                        : "No notes yet"}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
                </button>
              );
            })}
          </div>
          {trackedMembers.length === 0 && (
            <div className="rounded-[1.75rem] border border-dashed border-border/70 bg-muted/20 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No tracked people yet</p>
              <p className="mt-1 px-4 text-xs text-muted-foreground">Add someone you help care for.</p>
              <Button className="btn-chronicle-primary mt-4 rounded-full" onClick={() => setShowAddMember(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Add first member
              </Button>
            </div>
          )}
        </section>
      </div>

      <AddMemberDialog open={showAddMember} onClose={() => setShowAddMember(false)} />
      {addLogMemberId ? (
        <AddLogDialog open={addLogOpen} onClose={() => setAddLogOpen(false)} memberId={addLogMemberId} />
      ) : null}
    </div>
  );
}
