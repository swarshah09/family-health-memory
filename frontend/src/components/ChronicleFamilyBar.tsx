import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import AccountMenuButton from "@/components/AccountMenuButton";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

type ChronicleFamilyBarProps = {
  onAdd: () => void;
  className?: string;
};

export default function ChronicleFamilyBar({ onAdd, className }: ChronicleFamilyBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
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

  const memberScrollRef = useRef<HTMLDivElement>(null);
  const [memberScrollLeft, setMemberScrollLeft] = useState(0);
  const [memberOverflows, setMemberOverflows] = useState(false);

  const syncMemberScroll = useCallback(() => {
    const el = memberScrollRef.current;
    if (!el) return;
    setMemberScrollLeft(el.scrollLeft);
    setMemberOverflows(el.scrollWidth > el.clientWidth + 2);
  }, []);

  const memberScrolled = memberScrollLeft > 6;
  const showRightFade = memberOverflows;

  useEffect(() => {
    if (location.pathname !== "/") setDashboardPeopleFilterId(null);
  }, [location.pathname, setDashboardPeopleFilterId]);

  useEffect(() => {
    const el = memberScrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    setMemberScrollLeft(0);
    syncMemberScroll();
    const ro = new ResizeObserver(() => syncMemberScroll());
    ro.observe(el);
    return () => ro.disconnect();
  }, [trackedMembers.length, syncMemberScroll]);

  return (
    <header
      className={cn(
        "chronicle-header-blur print:hidden",
        "sticky top-0 z-[55] overflow-hidden",
        "flex flex-col gap-3 px-3 py-3",
        "sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-x-2 sm:gap-y-0 sm:px-4 sm:py-3.5",
        "lg:px-6",
        className
      )}
    >
      {/* Brand */}
      <div className="flex min-w-0 shrink-0 items-center sm:max-w-[11rem] md:max-w-[13rem] lg:max-w-[14rem]">
        <button
          type="button"
          onClick={() => {
            setDashboardPeopleFilterId(null);
            navigate("/");
          }}
          className="flex min-w-0 items-center gap-3 rounded-2xl text-left transition hover:bg-muted/40"
          aria-label="Go to home"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
            f
          </span>
          <span className="min-w-0">
            <span className="font-serif-display truncate text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
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

      {/* Member filters — clipped lane; pills scroll under edge fades */}
      <div className="relative isolate min-h-9 min-w-0 w-full overflow-hidden sm:min-h-10">
        <div
          ref={memberScrollRef}
          onScroll={syncMemberScroll}
          className={cn(
            "chronicle-member-scroll flex h-full min-w-0 max-w-full items-center gap-2 pr-1",
            "scroll-smooth snap-x snap-mandatory",
            memberScrolled && "chronicle-member-scroll--scrolled"
          )}
        >
          <button
            type="button"
            onClick={() => {
              if (onDashboard) setDashboardPeopleFilterId(null);
              navigate("/");
            }}
            className={cn(
              "flex shrink-0 snap-start items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              onDashboard && !dashboardPeopleFilterId
                ? "border-primary/35 bg-primary/10 text-primary"
                : "border-border/70 bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground"
            )}
          >
            <span className="whitespace-nowrap">All</span>
            <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Everyone
            </span>
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
                  "flex shrink-0 snap-start items-center gap-2 rounded-full border px-2 py-1 pr-3 text-xs font-semibold transition",
                  active
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : "border-border/70 bg-card text-foreground hover:border-primary/25"
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                  {initial}
                </span>
                <span className="max-w-[5.5rem] truncate whitespace-nowrap sm:max-w-[7rem]">{m.name}</span>
              </button>
            );
          })}
        </div>
        <span
          className={cn("chronicle-member-fade-left", memberScrolled && "chronicle-member-fade-left--visible")}
          aria-hidden
        />
        <span
          className={cn("chronicle-member-fade-right", !showRightFade && "chronicle-member-fade-right--hidden")}
          aria-hidden
        />
      </div>

      {/* Search + account + add — own column; sits after the clipped lane */}
      <div className="relative z-10 flex shrink-0 items-center justify-end gap-2 bg-[hsl(var(--background)/0.98)] sm:gap-2.5 sm:pl-1">
        <button
          type="button"
          onClick={() => navigate("/insights/memory")}
          className="input-chronicle flex w-full shrink-0 items-center gap-2 py-2 pl-3 pr-3 text-left text-muted-foreground sm:w-[12.5rem] md:w-[14rem]"
          aria-label="Ask the memory"
        >
          <Search className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span className="truncate text-xs sm:text-sm">Ask the memory</span>
        </button>
        <AccountMenuButton />
        <button type="button" onClick={onAdd} className="btn-chronicle-primary shrink-0 gap-1.5 px-4 py-2 text-xs sm:text-sm">
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </button>
      </div>
    </header>
  );
}
