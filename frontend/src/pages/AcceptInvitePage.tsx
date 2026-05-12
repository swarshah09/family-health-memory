import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, ArrowRight } from "lucide-react";
import { AppRequestError, toastError, toastFromCaughtError } from "@/lib/toast-errors";
import { displayRoleLabel } from "@/lib/collaboration-roles";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { acceptInvitation, isAuthenticated } = useApp();
  const token = searchParams.get("token") || "";
  const [preview, setPreview] = useState<{
    email: string;
    inviteeName: string;
    role: "caregiver" | "viewer";
    invitedByName?: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token.trim()) {
      setPreviewError("This link is missing an invitation token.");
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/invitations/preview?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = (await res.json()) as { invitation?: typeof preview; message?: string };
        if (!res.ok) throw new Error(json.message || "Invalid invitation");
        if (!json.invitation) throw new Error("Invalid invitation");
        if (!cancelled) {
          setPreview(json.invitation);
          setName(json.invitation.inviteeName || "");
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setPreviewError(e.message || "Could not load invitation");
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || !password.trim()) {
      toastError("Missing fields", "Enter a password to finish joining the workspace.");
      return;
    }
    setSubmitting(true);
    try {
      await acceptInvitation(token.trim(), password.trim(), name.trim() || undefined);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof AppRequestError) {
        toastError(err.toastTitle, err.toastDescription);
      } else {
        toastFromCaughtError(
          err,
          "Could not join workspace",
          "Check your password meets the minimum length and try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6 bg-[#0d3a34]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card/95 p-6 shadow-xl backdrop-blur">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Heart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg text-foreground">Join family workspace</h1>
            <p className="text-[11px] text-muted-foreground">Set a password to accept your invitation</p>
          </div>
        </div>

        {loadingPreview && <p className="text-sm text-muted-foreground">Loading invitation…</p>}
        {!loadingPreview && previewError && (
          <p className="text-sm text-destructive">{previewError}</p>
        )}
        {!loadingPreview && preview && !previewError && (
          <div className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 mb-4 text-xs space-y-1">
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              <span className="font-medium text-foreground">{preview.email}</span>
            </p>
            {preview.invitedByName ? (
              <p>
                <span className="text-muted-foreground">Invited by:</span>{" "}
                <span className="font-medium text-foreground">{preview.invitedByName}</span>
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">Role:</span>{" "}
              <span className="font-medium text-foreground">{displayRoleLabel(preview.role)}</span>
            </p>
          </div>
        )}

        {preview && !previewError ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl"
            />
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Choose password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl pr-10"
                minLength={6}
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <Button type="submit" className="w-full h-11 rounded-xl gap-2" disabled={submitting}>
              {submitting ? "Joining…" : "Join workspace"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
