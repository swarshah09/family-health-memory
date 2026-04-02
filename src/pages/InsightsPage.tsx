import { useApp } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Activity, Sparkles, AlertTriangle, Info } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="bg-card border-b border-border px-4 pt-12 pb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Sparkles className="h-5 w-5 text-insight" />
          <h1 className="font-bold text-foreground text-lg">AI Insights</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-2 ml-8">
          Pattern analysis from the past 7 days
        </p>
      </div>

      <div className="px-4 py-5 space-y-6">
        {Object.entries(grouped).map(([name, memberInsights]) => (
          <div key={name} className="fade-in">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary text-xs font-bold">{name[0]}</span>
              </div>
              {name}
            </h2>
            <div className="space-y-2">
              {memberInsights.map((ins) => (
                <div
                  key={ins.id}
                  className={`rounded-xl p-4 border ${
                    ins.severity === "alert"
                      ? "bg-destructive/5 border-destructive/20"
                      : ins.severity === "warning"
                      ? "bg-warning/5 border-warning/20"
                      : "bg-primary/5 border-primary/20"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {ins.severity === "alert" ? (
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    ) : ins.severity === "warning" ? (
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                    ) : (
                      <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{ins.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{ins.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {insights.length === 0 && (
          <div className="text-center py-16">
            <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No patterns detected yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add more health logs to start seeing insights
            </p>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground px-6 mt-4 opacity-60">
        ⚕️ These insights are generated from logged observations and are not medical advice.
        Always consult a healthcare professional.
      </p>
    </div>
  );
}
