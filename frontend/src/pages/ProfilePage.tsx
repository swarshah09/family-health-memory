import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ArrowLeft, Camera, LogOut, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import { toastFromCaughtError } from "@/lib/toast-errors";
import { displayRoleLabel } from "@/lib/collaboration-roles";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateProfile, uploadProfilePhoto, leaveFamily } = useApp();
  const [name, setName] = useState(user?.name || "");
  const [description, setDescription] = useState(user?.description || "");
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setDescription(user?.description || "");
  }, [user?.name, user?.description]);

  const photoSrc = user?.profilePictureUrl
    ? user.profilePictureUrl.startsWith("http")
      ? user.profilePictureUrl
      : `${API_BASE_URL}${user.profilePictureUrl}`
    : null;

  const onSave = async () => {
    if (!name.trim()) {
      toast.error("Name required", { description: "Please enter your display name." });
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        description: description.trim() ? description.trim() : null
      });
      toast.success("Profile saved");
    } catch (e: unknown) {
      toastFromCaughtError(e, "Save failed", "We could not update your profile.");
    } finally {
      setSaving(false);
    }
  };

  const onPickPhoto = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void uploadProfilePhoto(file)
        .then(() => toast.success("Profile photo updated"))
        .catch((e: unknown) => toastFromCaughtError(e, "Upload failed", "Try a smaller JPG or PNG file."));
    };
    input.click();
  };

  const onLeave = async () => {
    setLeaving(true);
    try {
      await leaveFamily();
      toast.success("You left this family workspace", {
        description: "You can create or join another family from the sign-in screen when you are ready."
      });
      setLeaveOpen(false);
      navigate("/");
    } catch (e: unknown) {
      toastFromCaughtError(
        e,
        "Cannot leave yet",
        e instanceof Error ? e.message : "Promote another Head first, or try again."
      );
    } finally {
      setLeaving(false);
    }
  };

  const workspaceLabel =
    user?.familyRole === "HEAD" || user?.familyRole === "MEMBER"
      ? displayRoleLabel(user.familyRole)
      : user?.role === "owner" || user?.workspaceRole === "head"
        ? displayRoleLabel("HEAD")
        : displayRoleLabel("MEMBER");

  return (
    <div className="app-shell app-safe-bottom">
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
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-foreground text-lg">Your profile</h1>
            <p className="text-[11px] text-muted-foreground">Private to your account; shared basics with your family team</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-4 max-w-lg mx-auto">
        <div className="glass-card rounded-2xl p-4 border border-border/40 flex flex-col items-center gap-3">
          <div className="relative h-24 w-24 rounded-full bg-muted overflow-hidden border border-border/50">
            {photoSrc ? (
              <img src={photoSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <User className="h-10 w-10 opacity-40" />
              </div>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-xl gap-2" onClick={onPickPhoto}>
            <Camera className="h-3.5 w-3.5" />
            Change photo
          </Button>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-3">
          <p className="section-title">Account</p>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Email</label>
            <Input value={user?.email || ""} disabled className="h-10 rounded-xl opacity-80" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Display name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Short bio (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="e.g. primary caregiver for Mom; note allergies or communication preferences for your team."
              className="rounded-xl resize-none text-sm"
            />
          </div>
          <Button type="button" className="w-full h-10 rounded-xl" onClick={() => void onSave()} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-2">
          <p className="section-title flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            Family workspace
          </p>
          {user?.familyId ? (
            <>
              <p className="text-xs text-foreground">
                <span className="text-muted-foreground">Workspace role:</span> {workspaceLabel}
              </p>
              {user.familyName ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Family name: <span className="text-foreground/90">{user.familyName}</span>
                </p>
              ) : null}
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                Workspace ID (click to copy):{" "}
                <button
                  type="button"
                  title="Click to copy family ID"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(user.familyId!)
                      .then(() => toast.success("Family ID copied"))
                      .catch(() => toast.error("Could not copy"));
                  }}
                  className="font-mono text-xs text-foreground/90 rounded-lg px-1.5 py-0.5 -mx-0.5 hover:bg-muted border border-transparent hover:border-border transition-colors cursor-pointer text-left break-all align-baseline"
                >
                  {user.familyId}
                </button>
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full h-10 rounded-xl gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setLeaveOpen(true)}
              >
                <LogOut className="h-3.5 w-3.5" />
                Leave family workspace
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              You are not in a family workspace. Use sign-in to create a family or submit a join request with a family
              ID.
            </p>
          )}
        </div>
      </div>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this family?</AlertDialogTitle>
            <AlertDialogDescription>
              {`You will lose access to this family's logs and insights until you join again. If you are the only Head, promote someone else first.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={leaving}
              onClick={(ev) => {
                ev.preventDefault();
                void onLeave();
              }}
            >
              {leaving ? "Leaving…" : "Leave family"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
