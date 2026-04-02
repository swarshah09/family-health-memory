import { useApp } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Activity, ChevronRight, LogOut, Sparkles, TrendingUp, Clock } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AddMemberDialog from "@/components/AddMemberDialog";
import InsightBadge from "@/components/InsightBadge";
import { formatDistanceToNow } from "date-fns";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export default function Dashboard() {
  const { user, members, logout, getAllInsights, getLogsForMember } = useApp();
  const navigate = useNavigate();
  const [showAddMember, setShowAddMember] = useState(false);
  const insights = getAllInsights();
  const alertCount = insights.filter((i) => i.severity === "alert").length;
  const warningCount = insights.filter((i) => i.severity === "warning").length;
  const totalLogs = members.reduce((sum, m) => sum + getLogsForMember(m.id).length, 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <motion.div
        className="health-gradient px-5 pt-12 pb-8 relative overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.2) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.15) 0%, transparent 50%)",
        }} />
        
        <div className="flex items-center justify-between mb-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <p className="text-primary-foreground/70 text-sm">Welcome back,</p>
            <h1 className="text-xl font-bold text-primary-foreground">{user?.name || "User"}</h1>
          </motion.div>
          <motion.button
            onClick={logout}
            className="text-primary-foreground/60 hover:text-primary-foreground p-2 rounded-full hover:bg-primary-foreground/10 transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <LogOut className="h-5 w-5" />
          </motion.button>
        </div>

        {/* Quick Stats */}
        <motion.div
          className="grid grid-cols-3 gap-3 mb-4 relative z-10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {[
            { label: "Members", value: members.length, icon: Activity },
            { label: "Logs", value: totalLogs, icon: Clock },
            { label: "Patterns", value: alertCount + warningCount, icon: TrendingUp },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl px-3 py-2.5 text-center border border-primary-foreground/10">
              <Icon className="h-4 w-4 text-primary-foreground/70 mx-auto mb-1" />
              <p className="text-lg font-bold text-primary-foreground">{value}</p>
              <p className="text-[10px] text-primary-foreground/60 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Insights banner */}
        <AnimatePresence>
          {alertCount > 0 && (
            <motion.button
              onClick={() => navigate("/insights")}
              className="w-full bg-primary-foreground/15 backdrop-blur-sm rounded-xl p-4 flex items-center gap-3 border border-primary-foreground/20 relative z-10"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </motion.div>
              <div className="flex-1 text-left">
                <p className="text-primary-foreground text-sm font-semibold">
                  {alertCount} pattern{alertCount > 1 ? "s" : ""} detected
                </p>
                <p className="text-primary-foreground/70 text-xs">Tap to view AI insights</p>
              </div>
              <ChevronRight className="h-4 w-4 text-primary-foreground/50" />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Family Members */}
      <div className="px-5 -mt-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Family Members</h2>
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddMember(true)}
              className="gap-1 text-xs"
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          </motion.div>
        </div>

        <motion.div className="space-y-3" variants={stagger} initial="hidden" animate="show">
          {members.map((member) => {
            const memberLogs = getLogsForMember(member.id);
            const memberInsights = insights.filter((i) => i.memberId === member.id);
            const lastLog = memberLogs[0];

            return (
              <motion.button
                key={member.id}
                onClick={() => navigate(`/member/${member.id}`)}
                className="w-full glass-card rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-shadow text-left"
                variants={fadeUp}
                whileHover={{ scale: 1.01, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 relative">
                  <span className="text-primary font-bold text-lg">{member.name[0]}</span>
                  {memberInsights.some((i) => i.severity === "alert") && (
                    <motion.div
                      className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive border-2 border-card"
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{member.name}</h3>
                    <span className="text-xs text-muted-foreground">
                      {member.age}y · {member.relationship}
                    </span>
                  </div>
                  {lastLog && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDistanceToNow(new Date(lastLog.timestamp), { addSuffix: true })} — {lastLog.text.slice(0, 50)}…
                      </p>
                    </div>
                  )}
                  {memberInsights.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {memberInsights.slice(0, 3).map((ins) => (
                        <InsightBadge key={ins.id} severity={ins.severity} text={ins.keyword} />
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </motion.button>
            );
          })}
        </motion.div>

        {members.length === 0 && (
          <motion.div
            className="text-center py-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No family members yet</p>
            <Button className="mt-4" onClick={() => setShowAddMember(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add First Member
            </Button>
          </motion.div>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border px-6 py-3 flex justify-around max-w-lg mx-auto z-50">
        <button className="flex flex-col items-center gap-1 text-primary relative">
          <Activity className="h-5 w-5" />
          <span className="text-xs font-medium">Home</span>
          <motion.div
            className="absolute -bottom-3 h-0.5 w-8 rounded-full bg-primary"
            layoutId="nav-indicator"
          />
        </button>
        <button
          onClick={() => navigate("/insights")}
          className="flex flex-col items-center gap-1 text-muted-foreground relative"
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-xs">Insights</span>
          {alertCount > 0 && (
            <motion.div
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <span className="text-[9px] font-bold text-destructive-foreground">{alertCount}</span>
            </motion.div>
          )}
        </button>
      </nav>

      <AddMemberDialog open={showAddMember} onClose={() => setShowAddMember(false)} />
    </div>
  );
}
