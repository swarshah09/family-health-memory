import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ArrowLeft, Plus, Mic, Sparkles, Trash2, FileText, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AddLogDialog from "@/components/AddLogDialog";
import InsightBadge from "@/components/InsightBadge";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";

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
  const { members, getLogsForMember, getInsightsForMember, removeMember } = useApp();
  const [showAddLog, setShowAddLog] = useState(false);

  const member = members.find((m) => m.id === id);
  if (!member)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Member not found</p>
      </div>
    );

  const logs = getLogsForMember(member.id);
  const insights = getInsightsForMember(member.id);

  const grouped: Record<string, typeof logs> = {};
  logs.forEach((log) => {
    const key = formatDateGroup(new Date(log.timestamp));
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(log);
  });

  const handleRemove = () => {
    removeMember(member.id);
    toast.success(`${member.name} removed`);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background pb-24 mesh-bg">
      {/* Header */}
      <motion.div
        className="bg-card/80 backdrop-blur-xl border-b border-border/40 px-5 pt-12 pb-6"
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

      {/* Timeline */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-display font-semibold text-foreground">Health Timeline</h2>
          <span className="text-xs text-muted-foreground">({logs.length} entries)</span>
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
                <motion.div key={log.id} className="flex gap-3" variants={fadeUp}>
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
                    className="glass-card rounded-2xl p-4 flex-1 mb-1"
                    whileHover={{ scale: 1.01 }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {log.type === "voice" && (
                        <div className="h-5 w-5 rounded-md bg-accent/10 flex items-center justify-center">
                          <Mic className="h-3 w-3 text-accent" />
                        </div>
                      )}
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {format(new Date(log.timestamp), "h:mm a")}
                      </span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{log.text}</p>
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
            <div className="h-14 w-14 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
              <FileText className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-foreground font-display font-semibold">No logs yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tap + to add the first observation</p>
          </motion.div>
        )}
      </div>

      {/* FAB */}
      <motion.button
        onClick={() => setShowAddLog(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-2xl health-gradient shadow-glow-lg flex items-center justify-center z-50"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, delay: 0.4 }}
      >
        <Plus className="h-6 w-6 text-primary-foreground" />
      </motion.button>

      <AddLogDialog open={showAddLog} onClose={() => setShowAddLog(false)} memberId={member.id} />
    </div>
  );
}
