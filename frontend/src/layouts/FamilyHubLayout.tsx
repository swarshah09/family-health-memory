import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { AppHubOutletContext } from "@/lib/hub-outlet";

const pill =
  "flex-1 rounded-full px-3 py-2 text-center text-xs font-medium transition-colors min-w-0 sm:text-[13px]";

export default function FamilyHubLayout() {
  const ctx: AppHubOutletContext = { hub: "family" };
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <div className="sticky top-0 z-30 border-b border-border/50 bg-background/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md md:px-6 lg:px-8 lg:pt-[calc(0.85rem+env(safe-area-inset-top))]">
        <div className="flex rounded-full bg-muted/70 p-1">
          <NavLink
            to="/family/workspace"
            className={({ isActive }) =>
              cn(pill, isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
            }
          >
            Family
          </NavLink>
          <NavLink
            to="/family/team"
            className={({ isActive }) =>
              cn(pill, isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
            }
          >
            Care team
          </NavLink>
        </div>
      </div>
      <Outlet context={ctx} />
    </div>
  );
}
