import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import AccountMenuButton from "@/components/AccountMenuButton";
import BrandMark from "@/components/BrandMark";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

type ChronicleFamilyBarProps = {
  onAdd: () => void;
  className?: string;
};

export default function ChronicleFamilyBar({ onAdd, className }: ChronicleFamilyBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { members, user, dashboardPeopleFilterId, setDashboardPeopleFilterId } = useApp();

  const trackedMembers = useMemo(
    () => members.filter((m) => !m.linkedUserId || m.linkedUserId !== user?.id),
    [members, user?.id]
  );

  const memberMatch = /^\/member\/([^/]+)/.exec(location.pathname);
  const activeMemberId = memberMatch?.[1];
  const onDashboard = location.pathname === "/";

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
        "flex flex-col gap-2.5 px-3 py-3",
        "sm:grid sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,auto)] sm:items-center sm:gap-x-2 sm:gap-y-0 sm:px-4 sm:py-3.5",
        "lg:px-6",
        className
      )}
    >
      {/* Brand */}
      <div className="flex min-w-0 shrink-0 items-center sm:max-w-[11rem] md:max-w-[13rem] lg:max-w-[15rem]">
        <button
          type="button"
          onClick={() => {
            setDashboardPeopleFilterId(null);
            navigate("/");
          }}
          className="flex min-w-0 items-center rounded-2xl text-left transition hover:bg-muted/40"
          aria-label="FamPulse home"
        >
          <BrandMark compact className="gap-3" />
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

      {/* Search + add + profile */}
      <div className="relative z-10 flex w-full min-w-0 items-center gap-1.5 sm:min-w-[12rem] sm:justify-end sm:gap-2 sm:bg-[hsl(var(--background)/0.98)] sm:pl-1 md:min-w-[14rem]">
        <button
          type="button"
          onClick={() => navigate("/insights/memory")}
          className={cn(
            "input-chronicle flex min-h-9 min-w-0 flex-1 basis-0 items-center gap-2 py-2 pl-3 pr-2.5 text-left text-muted-foreground",
            "!w-auto max-sm:max-w-none sm:flex-none sm:basis-auto sm:w-[10.5rem] md:w-[12.5rem] lg:w-[14rem]"
          )}
          aria-label="Ask the memory"
        >
          <Search className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span className="truncate text-xs sm:text-sm">
            <span className="max-[380px]:hidden">Ask the memory</span>
            <span className="hidden max-[380px]:inline">Ask memory</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="btn-chronicle-primary shrink-0 gap-1 px-2.5 py-2 text-xs sm:gap-1.5 sm:px-4 sm:text-sm"
          aria-label="Add observation"
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span className="hidden min-[400px]:inline">Add</span>
        </button>
        <AccountMenuButton className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" />
      </div>
    </header>
  );
}
