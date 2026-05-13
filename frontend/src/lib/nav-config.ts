import type { LucideIcon } from "lucide-react";
import { Heart, Home, Sparkles, UserCircle, Users } from "lucide-react";

export type PrimaryNavKey = "home" | "health" | "family" | "insights" | "you";

export type PrimaryNavItem = {
  key: PrimaryNavKey;
  label: string;
  shortLabel: string;
  path: string;
  icon: LucideIcon;
};

export const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  { key: "home", label: "Home", shortLabel: "Home", path: "/", icon: Home },
  { key: "health", label: "Health", shortLabel: "Health", path: "/health/my", icon: Heart },
  { key: "family", label: "Family", shortLabel: "Family", path: "/family/workspace", icon: Users },
  { key: "insights", label: "Insights", shortLabel: "Insights", path: "/insights/patterns", icon: Sparkles },
  { key: "you", label: "You", shortLabel: "You", path: "/you/profile", icon: UserCircle }
];

export function matchesPrimaryNav(pathname: string, key: PrimaryNavKey): boolean {
  if (key === "home") return pathname === "/";
  if (key === "health") {
    return (
      pathname.startsWith("/health") ||
      pathname.startsWith("/my-health") ||
      pathname.startsWith("/member")
    );
  }
  if (key === "family") return pathname.startsWith("/family") || pathname === "/workspace" || pathname === "/team";
  if (key === "insights") return pathname.startsWith("/insights") || pathname === "/memory";
  if (key === "you") {
    return (
      pathname.startsWith("/you") ||
      pathname === "/profile" ||
      pathname === "/automation" ||
      pathname === "/admin" ||
      pathname === "/chat-ingest"
    );
  }
  return false;
}
