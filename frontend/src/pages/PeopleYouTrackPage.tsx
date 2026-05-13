import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useAppHub } from "@/lib/hub-outlet";
import { ArrowLeft, ChevronRight, Clock, Plus, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import AddMemberDialog from "@/components/AddMemberDialog";
import InsightBadge from "@/components/InsightBadge";
import { useState } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }
};

/** Dependents and other family profiles — never the signed-in user's own row. */
export default function PeopleYouTrackPage() {
  const navigate = useNavigate();
  const { user, members, getLogsForMember, getAllInsights } = useApp();
  const inHealthHub = useAppHub()?.hub === "health";
  const [showAddMember, setShowAddMember] = useState(false);
  const insights = getAllInsights();

  const tracked = useMemo(
    () => members.filter((m) => !m.linkedUserId || m.linkedUserId !== user?.id),
    [members, user?.id]
  );

  return (
    <div className="app-shell app-safe-bottom">
      {!inHealthHub && (
        <div className="bg-card border-b border-border/40 px-5 pt-12 pb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-foreground text-lg">People you track</h1>
            </div>
          </div>
        </div>
      )}

      <div className={inHealthHub ? "px-5 py-4" : "px-5 py-5"}>
        <div className="flex items-center justify-end mb-4">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs rounded-xl shrink-0"
            onClick={() => setShowAddMember(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>

        <div className="space-y-3">
          {tracked.map((member) => {
            const memberLogs = getLogsForMember(member.id);
            const memberInsights = insights.filter((i) => i.memberId === member.id);
            const lastLog = memberLogs[0];
            const hasAlert = memberInsights.some((i) => i.severity === "alert");
            return (
              <motion.button
                key={member.id}
                type="button"
                onClick={() => navigate(`/member/${member.id}`)}
                className="w-full glass-card-hover rounded-2xl p-4 flex items-center gap-4 text-left"
                variants={fadeUp}
                initial="hidden"
                animate="show"
                whileTap={{ scale: 0.98 }}
              >
                <div className="relative">
                  <div className="h-14 w-14 rounded-2xl health-gradient-soft flex items-center justify-center border border-primary/10">
                    <span className="text-primary font-display font-bold text-lg">{member.name[0]}</span>
                  </div>
                  {hasAlert && (
                    <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive border-2 border-card" />
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
                      <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDistanceToNow(new Date(lastLog.timestamp), { addSuffix: true })} —{" "}
                        {lastLog.text.slice(0, 48)}
                        {lastLog.text.length > 48 ? "…" : ""}
                      </p>
                    </div>
                  )}
                  {memberInsights.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {memberInsights.slice(0, 3).map((ins) => (
                        <InsightBadge key={ins.id} severity={ins.severity} text={ins.keyword} />
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </motion.button>
            );
          })}
        </div>

        {tracked.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-[11px] text-muted-foreground text-center px-4">No one here yet.</p>
            <Button className="rounded-xl" size="sm" onClick={() => setShowAddMember(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add someone
            </Button>
          </div>
        )}
      </div>

      <AddMemberDialog open={showAddMember} onClose={() => setShowAddMember(false)} />
    </div>
  );
}
