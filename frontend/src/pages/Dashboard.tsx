import { useApp } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, ChevronRight, Sparkles, TrendingUp, Clock, Heart, Users, FileText, UserPlus, Home } from "lucide-react";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AddMemberDialog from "@/components/AddMemberDialog";
import InsightBadge from "@/components/InsightBadge";
import { formatDistanceToNow } from "date-fns";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export default function Dashboard() {
  const { user, members, logs, getAllInsights, getLogsForMember, pendingJoinInboxCount } = useApp();
  const navigate = useNavigate();
  const [showAddMember, setShowAddMember] = useState(false);
  const insights = getAllInsights();
  const alertCount = insights.filter((i) => i.severity === "alert").length;
  const warningCount = insights.filter((i) => i.severity === "warning").length;

  const trackedMembers = useMemo(
    () => members.filter((m) => !m.linkedUserId || m.linkedUserId !== user?.id),
    [members, user?.id]
  );
  const myHealthMember = useMemo(
    () => members.find((m) => m.linkedUserId === user?.id),
    [members, user?.id]
  );

  const trackedLogCount = useMemo(
    () => trackedMembers.reduce((sum, m) => sum + logs.filter((l) => l.memberId === m.id).length, 0),
    [trackedMembers, logs]
  );

  const topInsight = insights[0];
  const inactiveMembers = trackedMembers.filter((member) => {
    const logsForMember = getLogsForMember(member.id);
    if (!logsForMember.length) return true;
    const last = new Date(logsForMember[0].timestamp).getTime();
    return Date.now() - last > 1000 * 60 * 60 * 24 * 3;
  });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="app-shell app-safe-bottom">
      {/* Hero header */}
      <motion.div
        className="relative overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="px-5 pt-14 pb-20 relative" style={{ background: "linear-gradient(180deg, #0f5b56 0%, #0e4e49 100%)" }}>
          {/* Decorative circles */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/4" />

          <div className="mb-8 flex items-start justify-between gap-3 pr-10 relative z-10">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="min-w-0"
            >
              <p className="text-primary-foreground/70 text-sm font-medium">{greeting},</p>
              <h1 className="text-2xl font-display font-bold text-primary-foreground">{user?.name || "User"} 👋</h1>
            </motion.div>
          </div>

          <div className="flex flex-col gap-3 relative z-10">
            {/* Alert banner */}
            <AnimatePresence>
              {alertCount > 0 && (
                <motion.button
                  onClick={() => navigate("/insights/patterns")}
                  className="w-full bg-primary-foreground/15 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3 border border-primary-foreground/20"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <motion.div
                    className="h-10 w-10 rounded-xl bg-primary-foreground/20 flex items-center justify-center"
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
                  >
                    <Sparkles className="h-5 w-5 text-primary-foreground" />
                  </motion.div>
                  <div className="flex-1 text-left">
                    <p className="text-primary-foreground text-sm font-semibold">
                      {alertCount} priority insight{alertCount > 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-foreground">{alertCount}</span>
                  </div>
                </motion.button>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {pendingJoinInboxCount > 0 && (
                <motion.button
                  type="button"
                  onClick={() => navigate("/family/workspace")}
                  className="w-full bg-amber-400/20 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3 border border-amber-300/35"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="h-10 w-10 rounded-xl bg-amber-400/25 flex items-center justify-center shrink-0">
                    <UserPlus className="h-5 w-5 text-amber-100" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-primary-foreground text-sm font-semibold">
                      {pendingJoinInboxCount} join request{pendingJoinInboxCount > 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-amber-400/30 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary-foreground">{pendingJoinInboxCount}</span>
                  </div>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Stats cards overlapping header */}
        <motion.div
          className="px-5 -mt-10 relative z-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Tracked", value: trackedMembers.length, icon: Users, color: "primary" },
              { label: "Logs", value: trackedLogCount, icon: FileText, color: "accent" },
              { label: "Patterns", value: alertCount + warningCount, icon: TrendingUp, color: "insight" },
            ].map(({ label, value, icon: Icon, color }) => (
            <motion.div
                key={label}
              className="rounded-2xl px-3 py-4 text-center shadow-soft bg-white"
                whileHover={{ scale: 1.03, y: -2 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <div
                  className="h-9 w-9 rounded-xl mx-auto mb-2 flex items-center justify-center"
                  style={{
                    background:
                      label === "Tracked"
                        ? "hsl(var(--accent) / 0.16)"
                        : label === "Logs"
                        ? "hsl(var(--success) / 0.16)"
                        : "hsl(var(--warning) / 0.18)",
                  }}
                >
                  <Icon
                    className="h-4 w-4"
                    style={{
                      color:
                        label === "Tracked"
                          ? "hsl(var(--accent))"
                          : label === "Logs"
                          ? "hsl(var(--success))"
                          : "hsl(35 86% 46%)",
                    }}
                  />
                </div>
                <p className="text-xl font-display font-bold text-foreground">{value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mt-0.5">{label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Family members */}
      <div className="px-5 mt-6">
        <div className="grid grid-cols-1 gap-3 mb-5">
          {myHealthMember && (
            <motion.button
              type="button"
              onClick={() => navigate(`/member/${myHealthMember.id}`)}
              className="w-full glass-card-hover rounded-2xl p-4 flex items-center gap-4 text-left border border-primary/15"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Heart className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">My Health</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{myHealthMember.name}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            </motion.button>
          )}
          <motion.button
            type="button"
            onClick={() => navigate("/family/workspace")}
            className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 text-left border border-border/50 hover:border-primary/25 transition-colors"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center shrink-0">
              <Home className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Family</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">Family & team</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          </motion.button>
        </div>
        {topInsight && (
          <motion.button
            onClick={() => navigate("/insights/patterns")}
            className="w-full mb-4 glass-card-hover rounded-2xl p-4 text-left"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Insight</p>
            <p className="text-sm font-medium text-foreground mt-1">{topInsight.title}</p>
          </motion.button>
        )}
        {inactiveMembers.length > 0 && (
          <div className="mb-4 glass-card rounded-2xl p-4 border border-warning/20 border-l-4 border-l-warning">
            <p className="text-[10px] uppercase tracking-widest text-warning font-semibold">Follow-up suggestion</p>
            <p className="text-sm text-foreground mt-1">Quiet logs: {inactiveMembers.map((m) => m.name).join(", ")}</p>
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-title">People you track</h2>
          </div>
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddMember(true)}
              className="gap-1.5 text-xs rounded-xl border-border/60 hover:border-primary/30 hover:bg-primary/5"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </motion.div>
        </div>

        <motion.div className="space-y-3" variants={stagger} initial="hidden" animate="show">
          {trackedMembers.map((member) => {
            const memberLogs = getLogsForMember(member.id);
            const memberInsights = insights.filter((i) => i.memberId === member.id);
            const lastLog = memberLogs[0];
            const hasAlert = memberInsights.some((i) => i.severity === "alert");

            return (
              <motion.button
                key={member.id}
                onClick={() => navigate(`/member/${member.id}`)}
                className="w-full glass-card-hover rounded-2xl p-4 flex items-center gap-4 text-left"
                variants={fadeUp}
                whileTap={{ scale: 0.98 }}
              >
                <div className="relative">
                  <div className="h-14 w-14 rounded-2xl health-gradient-soft flex items-center justify-center border border-primary/10">
                    <span className="text-primary font-display font-bold text-lg">{member.name[0]}</span>
                  </div>
                  {hasAlert && (
                    <motion.div
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive border-2 border-card flex items-center justify-center"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <span className="text-[8px] font-bold text-destructive-foreground">!</span>
                    </motion.div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-semibold text-foreground">{member.name}</h3>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {member.age}y · {member.relationship}
                    </span>
                  </div>
                  {lastLog && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDistanceToNow(new Date(lastLog.timestamp), { addSuffix: true })} — {lastLog.text.slice(0, 45)}…
                      </p>
                    </div>
                  )}
                  {memberInsights.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {memberInsights.slice(0, 3).map((ins) => (
                        <InsightBadge key={ins.id} severity={ins.severity} text={ins.keyword} />
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
              </motion.button>
            );
          })}
        </motion.div>

        {trackedMembers.length === 0 && (
          <motion.div
            className="text-center py-20 glass-card rounded-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="h-16 w-16 rounded-3xl health-gradient-soft mx-auto mb-4 flex items-center justify-center">
              <Heart className="h-7 w-7 text-primary" />
            </div>
            <p className="text-foreground font-display font-semibold">No tracked people yet</p>
            <p className="text-muted-foreground text-sm mt-1 px-4">
              Add parents, children, or anyone you help care for. Your own entries stay under My Health above.
            </p>
            <Button className="mt-5 health-gradient border-0 rounded-xl shadow-glow gap-2" onClick={() => setShowAddMember(true)}>
              <Plus className="h-4 w-4" /> Add First Member
            </Button>
          </motion.div>
        )}
      </div>

      <AddMemberDialog open={showAddMember} onClose={() => setShowAddMember(false)} />
    </div>
  );
}
