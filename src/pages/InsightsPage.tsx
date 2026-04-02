import { useApp } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Activity, Sparkles, AlertTriangle, Info, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function InsightsPage() {
  const { members, getAllInsights } = useApp();
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

  return (
    <div className="min-h-screen bg-background pb-8">
      <motion.div
        className="bg-card border-b border-border px-4 pt-12 pb-5"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <motion.button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft className="h-5 w-5" />
          </motion.button>
          <Sparkles className="h-5 w-5 text-insight" />
          <h1 className="font-bold text-foreground text-lg">AI Insights</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-2 ml-8">
          Pattern analysis from the past 7 days
        </p>
      </motion.div>

      {/* Summary strip */}
      {insights.length > 0 && (
        <motion.div
          className="px-4 py-3 flex gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {[
            { label: "Alerts", value: totalAlerts, color: "bg-destructive/10 text-destructive" },
            { label: "Warnings", value: totalWarnings, color: "bg-warning/10 text-warning" },
            { label: "Total", value: insights.length, color: "bg-primary/10 text-primary" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`flex-1 rounded-xl px-3 py-2.5 text-center ${color}`}>
              <p className="text-lg font-bold">{value}</p>
              <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
            </div>
          ))}
        </motion.div>
      )}

      <motion.div
        className="px-4 py-3 space-y-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {Object.entries(grouped).map(([name, memberInsights]) => (
          <motion.div key={name} variants={fadeUp}>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary text-xs font-bold">{name[0]}</span>
              </div>
              {name}
              <span className="text-xs text-muted-foreground font-normal">
                ({memberInsights.length} insight{memberInsights.length !== 1 ? "s" : ""})
              </span>
            </h2>
            <div className="space-y-2">
              {memberInsights.map((ins, i) => (
                <motion.div
                  key={ins.id}
                  className={`rounded-xl p-4 border transition-shadow hover:shadow-md ${
                    ins.severity === "alert"
                      ? "bg-destructive/5 border-destructive/20"
                      : ins.severity === "warning"
                      ? "bg-warning/5 border-warning/20"
                      : "bg-primary/5 border-primary/20"
                  }`}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="flex items-start gap-3">
                    {ins.severity === "alert" ? (
                      <motion.div
                        animate={{ rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
                      >
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      </motion.div>
                    ) : ins.severity === "warning" ? (
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                    ) : (
                      <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{ins.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{ins.description}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      <span>{ins.count}x</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}

        {insights.length === 0 && (
          <motion.div
            className="text-center py-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No patterns detected yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add more health logs to start seeing insights
            </p>
          </motion.div>
        )}
      </motion.div>

      <p className="text-center text-xs text-muted-foreground px-6 mt-4 opacity-60">
        ⚕️ These insights are generated from logged observations and are not medical advice.
        Always consult a healthcare professional.
      </p>
    </div>
  );
}
