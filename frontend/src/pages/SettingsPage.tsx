import { useNavigate } from "react-router-dom";
import { Bell, ChevronRight, Palette, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeAppearanceControl } from "@/components/ThemeAppearanceControl";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";

const rows: { title: string; to: string; icon: typeof User }[] = [
  { title: "Profile", to: "/you/profile", icon: User },
  { title: "Reminders", to: "/you/automation", icon: Bell },
  { title: "Family workspace", to: "/family/workspace", icon: Shield }
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useApp();

  return (
    <div className="app-shell app-safe-bottom">
      <div className="border-b border-border/40 bg-card px-5 pb-5 pt-8">
        <h1 className="font-display text-lg font-bold text-foreground">Settings</h1>
      </div>
      <div className="space-y-4 px-5 py-5">
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Palette className="h-4 w-4 text-primary" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Appearance</p>
            </div>
          </div>
          <ThemeAppearanceControl />
        </div>
        {user?.familyId ? (
          <details className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">Advanced</summary>
            <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
              Family invite code for trusted join requests. Tap to copy—share only with people you mean to invite.
            </p>
            <button
              type="button"
              title="Copy family invite code"
              onClick={() => {
                void navigator.clipboard
                  .writeText(user.familyId!)
                  .then(() => toast.success("Code copied"))
                  .catch(() => toast.error("Could not copy"));
              }}
              className="mt-3 w-full rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-left font-sans text-xs tabular-nums tracking-tight text-foreground hover:bg-muted/60 transition-colors"
            >
              {user.familyId}
            </button>
          </details>
        ) : null}
        {rows.map(({ title, to, icon: Icon }) => (
          <Button
            key={to}
            type="button"
            variant="outline"
            className="h-auto w-full justify-between gap-3 rounded-2xl border-border/60 py-3.5 text-left font-normal"
            onClick={() => navigate(to)}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <span className="text-sm font-semibold text-foreground">{title}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          </Button>
        ))}
      </div>
    </div>
  );
}
