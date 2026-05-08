import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ArrowLeft, Shield, Users, Crown, HeartHandshake, Eye, CheckCircle2, Circle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

export default function TeamPage() {
  const navigate = useNavigate();
  const { user, familyUsers, loadFamilyUsers, updateFamilyUserRole, inviteFamilyUser } = useApp();
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"caregiver" | "viewer">("viewer");
  const [roleChangePending, setRoleChangePending] = useState<{
    userId: string;
    name: string;
    nextRole: "owner" | "caregiver" | "viewer";
  } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [submittingRoleChange, setSubmittingRoleChange] = useState(false);

  useEffect(() => {
    loadFamilyUsers().catch(() => {});
  }, []);

  const canManageRoles = user?.role === "owner";
  const canInvite = user?.role === "owner";
  const hasAnyTeamMembers = familyUsers.length > 0;
  const hasCaregiver = familyUsers.some((u) => u.role === "caregiver");
  const hasViewer = familyUsers.some((u) => u.role === "viewer");

  const confirmOwnerRoleChange = () => {
    if (!roleChangePending || submittingRoleChange) return;
    if (!currentPassword.trim()) {
      toast.error("Current password is required");
      return;
    }
    setSubmittingRoleChange(true);
    updateFamilyUserRole(roleChangePending.userId, roleChangePending.nextRole, currentPassword.trim())
      .then(() => {
        toast.success(`Role updated for ${roleChangePending.name}`);
        setRoleChangePending(null);
        setCurrentPassword("");
      })
      .catch((err: Error) => toast.error(err.message || "Role update failed"))
      .finally(() => setSubmittingRoleChange(false));
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
            <p className="text-[11px] text-muted-foreground">Manage contributors and access permissions</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-3">
        <details className="glass-card rounded-2xl p-4 border border-border/40 group">
          <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Quick start (3 steps)</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {[hasAnyTeamMembers, hasCaregiver, hasViewer].filter(Boolean).length}/3 done - Show steps
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground group-open:hidden">Expand</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden group-open:inline">Collapse</span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/30 pt-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              This page helps you assign the right access to the right person so collaboration stays safe and organized.
            </p>
            <div className="space-y-2">
              {[
                {
                  done: hasAnyTeamMembers,
                  title: "Confirm who is in your care team",
                  desc: "Review the current list to make sure all contributors are added."
                },
                {
                  done: hasCaregiver,
                  title: "Assign at least one caregiver",
                  desc: "Caregivers can add logs and keep timelines updated."
                },
                {
                  done: hasViewer,
                  title: "Use viewer role for read-only access",
                  desc: "Give family members visibility without edit permissions."
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
              <p className="text-sm font-semibold text-foreground">Need help choosing roles?</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Show guide</p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground group-open:hidden">Expand</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden group-open:inline">Collapse</span>
          </summary>
          <div className="mt-3 space-y-2.5 border-t border-border/30 pt-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Assign the lowest access level needed, then increase only when necessary.
            </p>
            <div className="space-y-1.5 text-[11px] text-foreground/85">
              <p><span className="font-semibold text-foreground">Owner:</span> full control, billing, and role management.</p>
              <p><span className="font-semibold text-foreground">Caregiver:</span> adds and updates logs, helps with daily tracking.</p>
              <p><span className="font-semibold text-foreground">Viewer:</span> read-only access for family members who should not edit data.</p>
            </div>
          </div>
        </details>

        {canInvite && (
          <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-3">
            <p className="section-title">Invite contributor</p>
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
                  <SelectItem value="caregiver">Caregiver</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="h-10 rounded-xl bg-accent hover:bg-accent/90"
                onClick={() => {
                  if (!inviteName.trim() || !inviteEmail.trim()) {
                    toast.error("Name and email are required");
                    return;
                  }
                  inviteFamilyUser(inviteEmail.trim(), inviteName.trim(), inviteRole)
                    .then((result) => {
                      setInviteName("");
                      setInviteEmail("");
                      toast.success("User invited", {
                        description: result.temporaryPassword
                          ? `Temporary password: ${result.temporaryPassword}`
                          : "Existing family member updated."
                      });
                    })
                    .catch(() => toast.error("Invite failed"));
                }}
              >
                Send Invite
              </Button>
            </div>
          </div>
        )}
        {familyUsers.map((member) => (
          <div
            key={member.id}
            className={`glass-card rounded-2xl p-4 border border-border/40 border-l-4 ${
              member.role === "owner"
                ? "border-l-accent"
                : member.role === "caregiver"
                ? "border-l-success"
                : "border-l-warning"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  {member.role === "owner" ? (
                    <Crown className="h-3.5 w-3.5 text-accent" />
                  ) : member.role === "caregiver" ? (
                    <HeartHandshake className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-warning" />
                  )}
                  {member.name}
                </p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
              </div>
              {canManageRoles ? (
                <Select
                  value={member.role}
                  onValueChange={(value) => {
                    const nextRole = value as "owner" | "caregiver" | "viewer";
                    const ownerSensitive = member.role === "owner" || nextRole === "owner";
                    if (!ownerSensitive) {
                      updateFamilyUserRole(member.id, nextRole)
                        .then(() => toast.success(`Role updated for ${member.name}`))
                        .catch((err: Error) => toast.error(err.message || "Role update failed"));
                      return;
                    }
                    setRoleChangePending({ userId: member.id, name: member.name, nextRole });
                  }}
                >
                  <SelectTrigger className="w-[130px] h-9 rounded-xl text-xs">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="caregiver">Caregiver</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                  {member.role}
                </span>
              )}
            </div>
          </div>
        ))}

        <div className="glass-card rounded-2xl p-4 text-xs text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-1.5 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Permission model
          </p>
          Owner manages all actions and roles. Caregiver can add and manage logs across members. Viewer can
          read updates and insights only.
        </div>
      </div>
      <AlertDialog
        open={!!roleChangePending}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRoleChangePending(null);
            setCurrentPassword("");
          }
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm role change</AlertDialogTitle>
            <AlertDialogDescription>
              You are updating owner-level permissions for {roleChangePending?.name || "this user"}.
              Enter your current account password to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="password"
            placeholder="Current account password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="h-10 rounded-xl"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingRoleChange}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmOwnerRoleChange();
              }}
              disabled={submittingRoleChange}
            >
              {submittingRoleChange ? "Updating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
