import { useNavigate } from "react-router-dom";
import { Bell, Crown, LogOut, Settings, User } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { isHeadUser } from "@/lib/collaboration-roles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

/** Aligns with mobile dock / tablet card width; on laptop sits in main column. */
export default function AppTopBar() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useApp();
  const head = isHeadUser(user);
  const photoSrc = user?.profilePictureUrl
    ? user.profilePictureUrl.startsWith("http")
      ? user.profilePictureUrl
      : `${API_BASE_URL}${user.profilePictureUrl}`
    : null;
  const initial = (user?.name?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div
      className={cn(
        "pointer-events-none absolute left-0 right-0 top-0 z-[60] flex justify-end",
        "pt-[max(0.5rem,env(safe-area-inset-top))]"
      )}
    >
      <div
        className={cn(
          "pointer-events-none flex w-full max-w-full justify-end px-3 sm:max-w-[420px] sm:px-4",
          "md:max-w-[min(42rem,calc(100%-1.25rem))] md:px-5",
          "lg:max-w-none lg:px-6 lg:pt-1 xl:px-8"
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "pointer-events-auto flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-card/95 text-sm font-semibold text-foreground shadow-sm backdrop-blur-md transition hover:bg-muted/90 focus-visible:ring-2 focus-visible:ring-primary/40",
                "md:h-11 md:w-11 md:rounded-[1.05rem] md:shadow-md",
                "lg:border-border/60 lg:bg-background/90"
              )}
              aria-label="Account menu"
            >
              {photoSrc ? (
                <img src={photoSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-primary">{initial}</span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-52 rounded-xl">
            <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => navigate("/you/profile")}>
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => navigate("/you/settings")}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light" className="rounded-lg">
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" className="rounded-lg">
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system" className="rounded-lg">
                Match system
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => navigate("/you/automation")}>
              <Bell className="h-4 w-4" />
              Reminders
            </DropdownMenuItem>
            {head && (
              <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => navigate("/you/admin")}>
                <Crown className="h-4 w-4" />
                Admin tools
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 rounded-lg text-destructive focus:text-destructive"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
