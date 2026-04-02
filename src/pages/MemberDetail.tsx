import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ArrowLeft, Plus, Mic, Sparkles, Trash2 } from "lucide-react";
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
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { members, getLogsForMember, getInsightsForMember, removeMember } = useApp();
  const [showAddLog, setShowAddLog] = useState(false);

  const member = members.find((m) => m.id === id);
  if (!member) return <div className="p-6">Member not found</div>;

  const logs = getLogsForMember(member.id);
  const insights = getInsightsForMember(member.id);

  // Group logs by date
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
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <motion.div
        className="bg-card border-b border-border px-4 pt-12 pb-5"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <motion.button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft className="h-5 w-5" />
          </motion.button>
          <motion.div
            className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <span className="text-primary font-bold">{member.name[0]}</span>
          </motion.div>
          <div className="flex-1">
            <h1 className="font-bold text-foreground">{member.name}</h1>
            <p className="text-xs text-muted-foreground">{member.age}y · {member.relationship}</p>
          </div>
          <motion.button
            onClick={handleRemove}
            className="text-muted-foreground hover:text-destructive p-2 rounded-lg hover:bg-destructive/10 transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <Trash2 className="h-4 w-4" />
          </motion.button>
        </div>
        {member.notes && (
          <motion.p
            className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            📋 {member.notes}
          </motion.p>
        )}
      </motion.div>

      {/* Insights strip */}
      <AnimatePresence>
        {insights.length > 0 && (
          <motion.div
            className="px-4 py-3 bg-insight/5 border-b border-border"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
              >
                <Sparkles className="h-4 w-4 text-insight" />
              </motion.div>
              <span className="text-xs font-semibold text-insight">AI Insights</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {insights.map((ins, i) => (
                <motion.div
                  key={ins.id}
                  className="flex-shrink-0 bg-card rounded-lg border border-border px-3 py-2 max-w-[200px]"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <p className="text-xs font-medium text-foreground">{ins.title}</p>
                  <InsightBadge severity={ins.severity} text={`${ins.count}x`} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      <div className="px-4 py-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-4">Health Timeline</h2>

        {Object.entries(grouped).map(([dateLabel, dateLogs]) => (
          <div key={dateLabel} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground px-2">{dateLabel}</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <motion.div className="space-y-3" variants={stagger} initial="hidden" animate="show">
              {dateLogs.map((log) => (
                <motion.div key={log.id} className="flex gap-3" variants={fadeUp}>
                  <div className="flex flex-col items-center">
                    <motion.div
                      className={`h-3 w-3 rounded-full mt-1.5 ${
                        log.type === "voice" ? "bg-accent" : "bg-primary"
                      }`}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    />
                    <div className="w-px flex-1 bg-border mt-1" />
                  </div>
                  <motion.div
                    className="glass-card rounded-xl p-3 flex-1 mb-1"
                    whileHover={{ scale: 1.01 }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {log.type === "voice" && <Mic className="h-3 w-3 text-accent" />}
                      <span className="text-xs text-muted-foreground">
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
            className="text-center py-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-muted-foreground text-sm">No logs yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tap + to add the first observation</p>
          </motion.div>
        )}
      </div>

      {/* FAB */}
      <motion.button
        onClick={() => setShowAddLog(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full health-gradient shadow-lg flex items-center justify-center z-50"
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
