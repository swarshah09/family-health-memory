import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ArrowLeft, Shield, Users, Crown, HeartHandshake, Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function TeamPage() {
  const navigate = useNavigate();
  const { user, familyUsers, loadFamilyUsers, updateFamilyUserRole, inviteFamilyUser } = useApp();
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"caregiver" | "viewer">("viewer");

  useEffect(() => {
    loadFamilyUsers().catch(() => {});
  }, []);

  const canManageRoles = user?.role === "owner";
  const canInvite = user?.role === "owner";

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
            <p className="text-[11px] text-muted-foreground">Role-based access and caregivers</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-3">
        {canInvite && (
          <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-3">
            <p className="text-sm font-semibold text-foreground">Invite family member</p>
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
                    .catch(() => toast.error("Failed to invite user"));
                }}
              >
                Invite Caregiver
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
                        .catch((err: Error) => toast.error(err.message || "Could not update role"));
                      return;
                    }
                    if (
                      !window.confirm(
                        `Confirm owner-level role change for ${member.name}. You will need your current password.`
                      )
                    ) {
                      return;
                    }
                    const currentPassword = window.prompt("Enter your current account password to confirm:");
                    if (!currentPassword) return;
                    updateFamilyUserRole(member.id, nextRole, currentPassword)
                      .then(() => toast.success(`Role updated for ${member.name}`))
                      .catch((err: Error) => toast.error(err.message || "Could not update role"));
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
          Owner manages all actions and roles. Caregiver can add logs and manage members. Viewer can
          read updates and insights.
        </div>
      </div>
    </div>
  );
}
