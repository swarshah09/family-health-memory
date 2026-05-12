import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, type FamilyActivityEvent } from "@/context/AppContext";
import {
  ArrowLeft,
  Shield,
  Users,
  Crown,
  UserCircle,
  CheckCircle2,
  Circle,
  ClipboardList,
  Link2
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { toastError, toastFromCaughtError } from "@/lib/toast-errors";
import { displayRoleLabel, formatActivityAction, isHeadUser } from "@/lib/collaboration-roles";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function TeamPage() {
  const navigate = useNavigate();
  const {
    user,
    familyUsers,
    loadFamilyUsers,
    setFamilyUserRole,
    inviteFamilyUser,
    fetchActivityFeed
  } = useApp();
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"caregiver" | "viewer">("viewer");
  const [activity, setActivity] = useState<FamilyActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    loadFamilyUsers().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.familyId) return;
    setActivityLoading(true);
    fetchActivityFeed(50)
      .then(setActivity)
      .catch(() => setActivity([]))
      .finally(() => setActivityLoading(false));
  }, [user?.familyId, fetchActivityFeed]);

  const canManageWorkspace = isHeadUser(user);
  const canInvite = canManageWorkspace;
  const hasAnyTeamMembers = familyUsers.length > 0;
  const headCount = familyUsers.filter((u) => u.familyRole === "HEAD" || u.role === "owner").length;
  const memberCount = familyUsers.filter((u) => u.familyRole === "MEMBER" || (!u.familyRole && u.role !== "owner")).length;

  const applyFamilyRole = (memberId: string, memberName: string, next: "HEAD" | "MEMBER") => {
    setFamilyUserRole(memberId, next)
      .then(() => toast.success(`Workspace role updated for ${memberName}`))
      .catch((err: unknown) =>
        toastFromCaughtError(
          err,
          "Role not updated",
          err instanceof Error && err.message.includes("HEAD")
            ? err.message
            : "Only Heads can change roles. If you removed the last Head, promote someone first."
        )
      );
  };

  return (
    <div className="app-shell app-safe-bottom">
      <div className="bg-card border-b border-border/40 px-5 pt-12 pb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-foreground text-lg">Family Team</h1>
            <p className="text-[11px] text-muted-foreground">Workspace roles, invitations, and activity</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-3">
        <details className="glass-card rounded-2xl p-4 border border-border/40 group">
          <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Quick start</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {[hasAnyTeamMembers, headCount >= 1, memberCount >= 1 || headCount >= 2].filter(Boolean).length}/3
                complete — tap to expand
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground group-open:hidden">Expand</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden group-open:inline">Collapse</span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/30 pt-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your health data stays inside this private family workspace. Heads approve join requests and manage
              workspace roles; every member can view family timelines but only edit their own logs unless they are a
              Head.
            </p>
            <div className="space-y-2">
              {[
                {
                  done: hasAnyTeamMembers,
                  title: "Confirm who is in your workspace",
                  desc: "Everyone listed here shares this family space under strict isolation."
                },
                {
                  done: headCount >= 1,
                  title: "Keep at least one Head",
                  desc: "Heads can promote others, approve joins, and edit any log when needed."
                },
                {
                  done: memberCount >= 1 || headCount >= 2,
                  title: "Grow the team safely",
                  desc: "Invite contributors by email, or share your family ID for a join request flow."
                }
              ].map((step) => (
                <div key={step.title} className="rounded-xl border border-border/40 bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    {step.done ? (
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className={`text-xs font-medium ${step.done ? "text-success" : "text-foreground"}`}>{step.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className="glass-card rounded-2xl p-4 border border-border/40 group">
          <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Head vs member</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Show guide</p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground group-open:hidden">Expand</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden group-open:inline">Collapse</span>
          </summary>
          <div className="mt-3 space-y-2.5 border-t border-border/30 pt-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This is a private care workspace, not a social feed. Use the lowest privilege that fits, then promote
              only when someone needs to govern the space.
            </p>
            <div className="space-y-1.5 text-[11px] text-foreground/85">
              <p>
                <span className="font-semibold text-foreground">Head:</span> approves join requests, changes workspace
                roles (with at least one Head always remaining), manages family settings, and may edit any health log.
              </p>
              <p>
                <span className="font-semibold text-foreground">Member:</span>{" "}
                {`can read all family members' logs and create or edit only their own logs.`}
              </p>
            </div>
          </div>
        </details>

        {canInvite && (
          <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-3">
            <p className="section-title">Invite by email</p>
            <p className="text-[11px] text-muted-foreground">
              Invited people join as workspace members. Their legacy access label (contributor vs read-only) is used
              for compatibility with older tools.
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Name"
                className="h-10 rounded-xl"
              />
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email"
                type="email"
                className="h-10 rounded-xl"
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "caregiver" | "viewer")}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="caregiver">Contributor (legacy)</SelectItem>
                  <SelectItem value="viewer">Viewer (legacy)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="h-10 rounded-xl bg-accent hover:bg-accent/90"
                onClick={() => {
                  if (!inviteName.trim() || !inviteEmail.trim()) {
                    toastError(
                      "Missing invite details",
                      "Enter both the person's full name and email address before sending an invitation."
                    );
                    return;
                  }
                  inviteFamilyUser(inviteEmail.trim(), inviteName.trim(), inviteRole)
                    .then((result) => {
                      setInviteName("");
                      setInviteEmail("");
                      if (result.kind === "pending") {
                        const url = result.invitation.acceptUrl;
                        toast.success("Invitation ready", {
                          description: "Copy the join link and send it privately to your family member.",
                          action: {
                            label: "Copy link",
                            onClick: () => {
                              void navigator.clipboard.writeText(url).then(() => {
                                toast.success("Link copied");
                              });
                            }
                          }
                        });
                        return;
                      }
                      toast.success("Team member updated", {
                        description: `${result.user.name} is already in your workspace; their invitation state was refreshed.`
                      });
                    })
                    .catch((err: unknown) =>
                      toastFromCaughtError(
                        err,
                        "Invitation not sent",
                        "We could not send this invite. Check the email address and your connection, then try again."
                      )
                    );
                }}
              >
                Send Invite
              </Button>
            </div>
          </div>
        )}
        <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="section-title">Recent activity</p>
          </div>
          {activityLoading ? (
            <p className="text-[11px] text-muted-foreground">Loading activity…</p>
          ) : activity.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No recorded activity yet.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {activity.map((row) => (
                <li key={row.id} className="text-[11px] border-b border-border/20 pb-2 last:border-0 last:pb-0">
                  <p className="text-foreground font-medium">{formatActivityAction(row.action)}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {row.contributorName} · {new Date(row.timestamp).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {familyUsers.map((member) => {
          const workspaceRole: "HEAD" | "MEMBER" =
            member.familyRole === "HEAD" || member.familyRole === "MEMBER"
              ? member.familyRole
              : member.role === "owner" || member.workspaceRole === "head"
                ? "HEAD"
                : "MEMBER";
          const isHeadCard = workspaceRole === "HEAD";
          return (
            <div
              key={member.id}
              className={`glass-card rounded-2xl p-4 border border-border/40 border-l-4 ${
                isHeadCard ? "border-l-accent" : "border-l-muted-foreground/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground flex items-center gap-1.5">
                    {isHeadCard ? (
                      <Crown className="h-3.5 w-3.5 text-accent" />
                    ) : (
                      <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {member.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span className="inline-flex items-center gap-0.5">
                      <Shield className="inline h-3 w-3 opacity-70" />
                      Workspace: {displayRoleLabel(workspaceRole)}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <Link2 className="inline h-3 w-3 opacity-70" />
                      Legacy: {displayRoleLabel(member.role)}
                    </span>
                  </p>
                </div>
                {canManageWorkspace ? (
                  <Select
                    value={workspaceRole}
                    onValueChange={(value) => {
                      const next = value as "HEAD" | "MEMBER";
                      applyFamilyRole(member.id, member.name, next);
                    }}
                  >
                    <SelectTrigger className="w-[120px] h-9 rounded-xl text-xs">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HEAD">Head</SelectItem>
                      <SelectItem value="MEMBER">Member</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                    {displayRoleLabel(workspaceRole)}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <div className="glass-card rounded-2xl p-4 text-xs text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-1.5 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Permission model
          </p>
          Permissions are enforced on the server: members cannot PATCH another person's logs. Multiple Heads are
          allowed; demoting the last Head returns an error until another Head exists. Family data is isolated by{" "}
          <span className="text-foreground/90">familyId</span> on every request.
        </div>
      </div>
    </div>
  );
}
