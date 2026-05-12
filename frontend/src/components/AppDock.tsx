import { Activity, Bot, ShieldCheck, Sparkles, Crown, MessageCircle, Home, UserCircle, Heart, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { isHeadUser } from "@/lib/collaboration-roles";

export default function AppDock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { getAllInsights, user, pendingJoinInboxCount } = useApp();
  const alertCount = getAllInsights().filter((i) => i.severity === "alert").length;

  const items = [
    { label: "Dashboard", icon: Activity, path: "/" },
    { label: "My Health", icon: Heart, path: "/my-health" },
    { label: "Tracked", icon: Users, path: "/people-you-track" },
    {
      label: "Family",
      icon: Home,
      path: "/workspace",
      badge: pendingJoinInboxCount > 0 ? pendingJoinInboxCount : undefined
    },
    { label: "Ask memory", icon: MessageCircle, path: "/memory" },
    { label: "Insights", icon: Sparkles, path: "/insights", badge: alertCount },
    { label: "Care Team", icon: ShieldCheck, path: "/team" },
    { label: "Profile", icon: UserCircle, path: "/profile" },
    { label: "Automation", icon: Bot, path: "/automation" },
  ];
  if (isHeadUser(user)) {
    items.push({ label: "Admin", icon: Crown, path: "/admin" });
  }

  return (
    <nav className="dock-shell">
      {items.map(({ label, icon: Icon, path, badge }) => {
        const active = location.pathname === path;
        return (
          <button
            key={label}
            onClick={() => navigate(path)}
            className={`dock-item ${active ? "dock-item-active" : "dock-item-idle"}`}
          >
            <div className={`dock-icon ${active ? "dock-icon-active" : ""}`}>
              <Icon className="h-4 w-4" />
              {!!badge && (
                <motion.div
                  className="dock-badge"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 350 }}
                >
                  <span>{badge}</span>
                </motion.div>
              )}
            </div>
            <span className="dock-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
