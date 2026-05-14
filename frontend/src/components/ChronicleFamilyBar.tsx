import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { Moon, Plus, Search } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

type ChronicleFamilyBarProps = {
  onAdd: () => void;
  className?: string;
};

export default function ChronicleFamilyBar({ onAdd, className }: ChronicleFamilyBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const { workspaceName, workspaceTagline, members, user, dashboardPeopleFilterId, setDashboardPeopleFilterId } =
    useApp();

  const trackedMembers = useMemo(
    () => members.filter((m) => !m.linkedUserId || m.linkedUserId !== user?.id),
    [members, user?.id]
  );

  const memberMatch = /^\/member\/([^/]+)/.exec(location.pathname);
  const activeMemberId = memberMatch?.[1];
  const onDashboard = location.pathname === "/";

  const title = workspaceName?.trim() || user?.familyName?.trim() || "Family workspace";
  const tagline = workspaceTagline?.trim();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    if (location.pathname !== "/") setDashboardPeopleFilterId(null);
  }, [location.pathname, setDashboardPeopleFilterId]);

  return (
    <header
      className={cn(
        "chronicle-header-blur print:hidden",
        "sticky top-0 z-[55] flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-2 sm:px-4 sm:py-3.5 lg:px-6",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setDashboardPeopleFilterId(null);
            navigate("/");
          }}
          className="flex min-w-0 shrink-0 items-center gap-3 rounded-2xl text-left transition hover:bg-muted/40"
          aria-label="Go to home"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
            f
          </span>
          <span className="min-w-0">
            <span className="font-serif-display text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
              {title}
            </span>
            {tagline ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{tagline}</span>
            ) : (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">A circle of care since 1972</span>
            )}
          </span>
        </button>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 sm:justify-center sm:pb-0">
        <button
          type="button"
          onClick={() => {
            if (onDashboard) setDashboardPeopleFilterId(null);
            navigate("/");
          }}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
            onDashboard && !dashboardPeopleFilterId
              ? "border-primary/35 bg-primary/10 text-primary"
              : "border-border/70 bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground"
          )}
        >
          <span className="max-w-[5.5rem] truncate sm:max-w-none">All</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Everyone</span>
        </button>
        {trackedMembers.map((m) => {
          const active = onDashboard ? dashboardPeopleFilterId === m.id : activeMemberId === m.id;
          const initial = (m.name?.trim()?.[0] ?? "?").toUpperCase();
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                if (onDashboard) {
                  if (dashboardPeopleFilterId === m.id) navigate(`/member/${m.id}`);
                  else setDashboardPeopleFilterId(m.id);
                } else navigate(`/member/${m.id}`);
              }}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-2 py-1 pr-3 text-xs font-semibold transition",
                active
                  ? "border-primary/35 bg-primary/10 text-primary"
                  : "border-border/70 bg-card text-foreground hover:border-primary/25"
              )}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                {initial}
              </span>
              <span className="max-w-[6rem] truncate">{m.name}</span>
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={() => navigate("/insights/memory")}
          className="input-chronicle flex max-w-[min(100%,14rem)] flex-1 items-center gap-2 py-2 pl-3 pr-3 text-left text-muted-foreground sm:max-w-[16rem] sm:flex-none md:max-w-xs"
          aria-label="Ask the memory"
        >
          <Search className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span className="truncate text-xs sm:text-sm">Ask the memory</span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-foreground transition hover:bg-muted/50"
          aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <Moon className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <button type="button" onClick={onAdd} className="btn-chronicle-primary shrink-0 gap-1.5 px-4 py-2 text-xs sm:text-sm">
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </button>
      </div>
    </header>
  );
}
