import { Heart } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import { matchesPrimaryNav, PRIMARY_NAV_ITEMS } from "@/lib/nav-config";

export default function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const { getAllInsights, pendingJoinInboxCount } = useApp();
  const alertCount = getAllInsights().filter((i) => i.severity === "alert").length;

  const badgeFor = (key: (typeof PRIMARY_NAV_ITEMS)[number]["key"]) => {
    if (key === "family" && pendingJoinInboxCount > 0) return pendingJoinInboxCount;
    if (key === "insights" && alertCount > 0) return alertCount;
    return undefined;
  };

  return (
    <div className="flex h-full min-h-dvh flex-col border-r border-border/50 bg-gradient-to-b from-card via-card to-muted/30 px-3 py-6 xl:px-4">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
          <Heart className="h-5 w-5" fill="currentColor" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-bold tracking-tight text-foreground">Family Memory</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Private workspace</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        {PRIMARY_NAV_ITEMS.map(({ key, label, path, icon: Icon }) => {
          const active = matchesPrimaryNav(pathname, key);
          const badge = badgeFor(key);
          return (
            <motion.button
              key={key}
              type="button"
              onClick={() => navigate(path)}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                active
                  ? "bg-primary/12 text-primary shadow-sm ring-1 ring-primary/15"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  active ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground group-hover:bg-muted"
                )}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-semibold", active ? "text-foreground" : "")}>{label}</span>
              </span>
              {badge != null && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      <p className="mt-auto px-2 pt-6 text-[10px] leading-relaxed text-muted-foreground/80">
        Calm navigation — your notes stay in one household space.
      </p>
    </div>
  );
}
