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

type AccountMenuButtonProps = {
  className?: string;
};

export default function AccountMenuButton({ className }: AccountMenuButtonProps) {
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-card text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/40",
            className
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
  );
}
