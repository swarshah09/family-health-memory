import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppHubOutletContext } from "@/lib/hub-outlet";
import { isHeadUser } from "@/lib/collaboration-roles";
import { useApp } from "@/context/AppContext";

const pill =
  "shrink-0 rounded-full px-3 py-2 text-center text-[11px] font-medium transition-colors sm:px-3.5 sm:text-xs";

export default function YouHubLayout() {
  const ctx: AppHubOutletContext = { hub: "you" };
  const { user } = useApp();
  const head = isHeadUser(user);
  const location = useLocation();
  const navigate = useNavigate();
  const onChatIngest = location.pathname.includes("/you/chat-ingest");

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      {onChatIngest && (
        <div className="sticky top-0 z-30 border-b border-border/50 bg-card/90 px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-md md:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate("/you/automation")}
            className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to reminders
          </button>
        </div>
      )}
      {!onChatIngest && (
        <div className="sticky top-0 z-30 border-b border-border/50 bg-background/95 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md md:px-5 lg:px-8 lg:pt-[calc(0.85rem+env(safe-area-inset-top))]">
          <div className="flex gap-1 overflow-x-auto rounded-full bg-muted/70 p-1">
            <NavLink
              to="/you/profile"
              className={({ isActive }) =>
                cn(pill, isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
              }
            >
              Profile
            </NavLink>
            <NavLink
              to="/you/settings"
              className={({ isActive }) =>
                cn(pill, isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
              }
            >
              Settings
            </NavLink>
            <NavLink
              to="/you/automation"
              className={({ isActive }) =>
                cn(pill, isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
              }
            >
              Reminders
            </NavLink>
            {head && (
              <NavLink
                to="/you/admin"
                className={({ isActive }) =>
                  cn(
                    pill,
                    isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
              >
                Admin
              </NavLink>
            )}
          </div>
        </div>
      )}
      <Outlet context={ctx} />
    </div>
  );
}
