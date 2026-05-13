import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, type FamilyActivityEvent } from "@/context/AppContext";
import {
  ArrowLeft,
  Shield,
  Users,
  Crown,
  UserCircle,
  ClipboardList,
  Link2
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { toastError, toastFromCaughtError } from "@/lib/toast-errors";
import { displayRoleLabel, formatActivityAction, isHeadUser } from "@/lib/collaboration-roles";
import { useAppHub } from "@/lib/hub-outlet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function TeamPage() {
  const navigate = useNavigate();
  const inFamilyHub = useAppHub()?.hub === "family";
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

  const applyFamilyRole = (memberId: string, memberName: string, next: "HEAD" | "MEMBER") => {
    setFamilyUserRole(memberId, next)
      .then(() => toast.success(`Family role updated for ${memberName}`))
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
      <div className={`bg-card border-b border-border/40 px-5 pb-6 ${inFamilyHub ? "pt-4" : "pt-12"}`}>
        <div className="flex items-center gap-3">
          {!inFamilyHub && (
            <button
              onClick={() => navigate("/")}
              className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-foreground text-lg">Care team</h1>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-3">
        <details className="glass-card rounded-2xl p-4 border border-border/40 group">
          <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">How roles work</p>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground group-open:hidden">Show</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden group-open:inline">Hide</span>
          </summary>
          <div className="mt-3 space-y-2 border-t border-border/30 pt-3 text-[11px] text-muted-foreground leading-relaxed">
            <p>
              <span className="font-medium text-foreground">Head</span> — invites, approvals, workspace settings.
            </p>
            <p>
              <span className="font-medium text-foreground">Member</span> — family timelines; edits own logs unless given more access.
            </p>
          </div>
        </details>

        {canInvite && (
          <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-3">
            <p className="section-title">Invite by email</p>
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
                  <SelectItem value="viewer">View only</SelectItem>
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
                      Family role: {displayRoleLabel(workspaceRole)}
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
