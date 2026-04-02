import { useApp } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Activity, ChevronRight, LogOut, Sparkles } from "lucide-react";
import { useState } from "react";
import AddMemberDialog from "@/components/AddMemberDialog";
import InsightBadge from "@/components/InsightBadge";

export default function Dashboard() {
  const { user, members, logout, getAllInsights, getLogsForMember } = useApp();
  const navigate = useNavigate();
  const [showAddMember, setShowAddMember] = useState(false);
  const insights = getAllInsights();
  const alertCount = insights.filter((i) => i.severity === "alert").length;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="health-gradient px-5 pt-12 pb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-primary-foreground/70 text-sm">Welcome back,</p>
            <h1 className="text-xl font-bold text-primary-foreground">{user?.name || "User"}</h1>
          </div>
          <button onClick={logout} className="text-primary-foreground/60 hover:text-primary-foreground">
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {/* Insights summary */}
        {alertCount > 0 && (
          <button
            onClick={() => navigate("/insights")}
            className="w-full bg-primary-foreground/15 backdrop-blur-sm rounded-xl p-4 flex items-center gap-3 border border-primary-foreground/20"
          >
            <Sparkles className="h-5 w-5 text-primary-foreground" />
            <div className="flex-1 text-left">
              <p className="text-primary-foreground text-sm font-semibold">
                {alertCount} pattern{alertCount > 1 ? "s" : ""} detected
              </p>
              <p className="text-primary-foreground/70 text-xs">Tap to view AI insights</p>
            </div>
            <ChevronRight className="h-4 w-4 text-primary-foreground/50" />
          </button>
        )}
      </div>

      {/* Family Members */}
      <div className="px-5 -mt-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Family Members</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddMember(true)}
            className="gap-1 text-xs"
          >
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>

        <div className="space-y-3">
          {members.map((member) => {
            const memberLogs = getLogsForMember(member.id);
            const memberInsights = insights.filter((i) => i.memberId === member.id);
            const lastLog = memberLogs[0];

            return (
              <button
                key={member.id}
                onClick={() => navigate(`/member/${member.id}`)}
                className="w-full glass-card rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-shadow fade-in text-left"
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary font-bold text-lg">
                    {member.name[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{member.name}</h3>
                    <span className="text-xs text-muted-foreground">
                      {member.age}y · {member.relationship}
                    </span>
                  </div>
                  {lastLog && (
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {lastLog.text}
                    </p>
                  )}
                  {memberInsights.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {memberInsights.slice(0, 2).map((ins) => (
                        <InsightBadge key={ins.id} severity={ins.severity} text={ins.keyword} />
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            );
          })}
        </div>

        {members.length === 0 && (
          <div className="text-center py-16">
            <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No family members yet</p>
            <Button className="mt-4" onClick={() => setShowAddMember(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add First Member
            </Button>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-6 py-3 flex justify-around max-w-lg mx-auto">
        <button className="flex flex-col items-center gap-1 text-primary">
          <Activity className="h-5 w-5" />
          <span className="text-xs font-medium">Home</span>
        </button>
        <button
          onClick={() => navigate("/insights")}
          className="flex flex-col items-center gap-1 text-muted-foreground"
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-xs">Insights</span>
        </button>
      </nav>

      <AddMemberDialog open={showAddMember} onClose={() => setShowAddMember(false)} />
    </div>
  );
}
