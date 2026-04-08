import { useApp } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Activity, Sparkles, AlertTriangle, Info, TrendingUp, Shield } from "lucide-react";
import { motion } from "framer-motion";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
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
    <div className="min-h-screen bg-background pb-8 mesh-bg">
      {/* Header */}
      <motion.div
        className="bg-card/80 backdrop-blur-xl border-b border-border/40 px-5 pt-12 pb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <motion.button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft className="h-5 w-5" />
          </motion.button>
          <div className="h-8 w-8 rounded-xl bg-insight/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-insight" />
          </div>
          <div>
            <h1 className="font-display font-bold text-foreground text-lg">AI Insights</h1>
            <p className="text-[11px] text-muted-foreground">Pattern analysis • Past 7 days</p>
          </div>
        </div>
      </motion.div>

      {/* Summary cards */}
      {insights.length > 0 && (
        <motion.div
          className="px-5 py-4 grid grid-cols-3 gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {[
            { label: "Alerts", value: totalAlerts, color: "destructive", icon: AlertTriangle },
            { label: "Warnings", value: totalWarnings, color: "warning", icon: Shield },
            { label: "Total", value: insights.length, color: "primary", icon: TrendingUp },
          ].map(({ label, value, color, icon: Icon }) => (
            <motion.div
              key={label}
              className="glass-card rounded-2xl px-3 py-3.5 text-center"
              whileHover={{ scale: 1.03 }}
            >
              <div
                className="h-8 w-8 rounded-xl mx-auto mb-2 flex items-center justify-center"
                style={{ background: `hsl(var(--${color}) / 0.1)` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: `hsl(var(--${color}))` }} />
              </div>
              <p className="text-xl font-display font-bold text-foreground">{value}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Grouped insights */}
      <motion.div
        className="px-5 py-3 space-y-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {Object.entries(grouped).map(([name, memberInsights]) => (
          <motion.div key={name} variants={fadeUp}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-8 w-8 rounded-xl health-gradient-soft flex items-center justify-center border border-primary/10">
                <span className="text-primary font-display font-bold text-sm">{name[0]}</span>
              </div>
              <h2 className="text-sm font-display font-semibold text-foreground">{name}</h2>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {memberInsights.length} insight{memberInsights.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2.5 ml-1">
              {memberInsights.map((ins, i) => (
                <motion.div
                  key={ins.id}
                  className={`glass-card rounded-2xl p-4 border-l-3 ${
                    ins.severity === "alert"
                      ? "border-l-destructive"
                      : ins.severity === "warning"
                      ? "border-l-warning"
                      : "border-l-primary"
                  }`}
                  style={{ borderLeftWidth: "3px" }}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ scale: 1.01, x: 4 }}
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
                    >
                      {ins.severity === "alert" ? (
                        <motion.div
                          animate={{ rotate: [0, 5, -5, 0] }}
                          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
                        >
                          <AlertTriangle
                            className="h-4 w-4"
                            style={{ color: "hsl(var(--destructive))" }}
                          />
                        </motion.div>
                      ) : ins.severity === "warning" ? (
                        <AlertTriangle className="h-4 w-4" style={{ color: "hsl(var(--warning))" }} />
                      ) : (
                        <Info className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-snug">{ins.title}</p>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{ins.description}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-lg flex-shrink-0">
                      <TrendingUp className="h-3 w-3" />
                      <span className="font-medium">{ins.count}×</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}

        {insights.length === 0 && (
          <motion.div
            className="text-center py-20 glass-card rounded-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="h-16 w-16 rounded-3xl bg-muted mx-auto mb-4 flex items-center justify-center">
              <Activity className="h-7 w-7 text-muted-foreground/30" />
            </div>
            <p className="text-foreground font-display font-semibold">No patterns detected yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add more health logs to start seeing insights
            </p>
          </motion.div>
        )}
      </motion.div>

      <p className="text-center text-[11px] text-muted-foreground px-8 mt-6 opacity-50">
        ⚕️ These insights are generated from logged observations and are not medical advice.
        Always consult a healthcare professional.
      </p>
    </div>
  );
}
