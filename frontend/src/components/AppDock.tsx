import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import { matchesPrimaryNav, PRIMARY_NAV_ITEMS } from "@/lib/nav-config";

export default function AppDock() {
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
    <div
      data-app-dock
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-0 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <nav
        className={cn(
          "pointer-events-auto flex w-full max-w-full items-stretch justify-around gap-0.5",
          "border-t border-border/60 bg-card/92 px-2 pt-2 shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.12)] backdrop-blur-xl",
          "sm:max-w-[420px] sm:rounded-t-2xl sm:border-x sm:border-border/50 sm:shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.1)]",
          "md:max-w-[min(42rem,calc(100%-1.25rem))] md:gap-1 md:px-4 md:pt-2.5 md:pb-2.5"
        )}
        aria-label="Primary"
      >
        {PRIMARY_NAV_ITEMS.map(({ key, shortLabel, path, icon: Icon }) => {
          const active = matchesPrimaryNav(pathname, key);
          const badge = badgeFor(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(path)}
              className={cn(
                "dock-item flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 transition-[color,transform] duration-200 md:gap-1 md:py-2",
                active ? "dock-item-active text-primary" : "dock-item-idle text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-xl transition-colors md:h-9 md:w-9 md:rounded-[0.85rem]",
                  active ? "bg-primary/12 text-primary" : "text-current"
                )}
              >
                <Icon className="h-[15px] w-[15px] md:h-[17px] md:w-[17px]" aria-hidden />
                {badge != null && (
                  <motion.div
                    className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-bold leading-none text-destructive-foreground md:h-[18px] md:min-w-[18px] md:text-[9px]"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 350 }}
                  >
                    {badge > 9 ? "9+" : badge}
                  </motion.div>
                )}
              </div>
              <span
                className={cn(
                  "max-w-[4.5rem] truncate text-[9px] font-medium md:max-w-none md:text-[11px]",
                  active && "font-semibold"
                )}
              >
                {shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
