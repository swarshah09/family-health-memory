import { Activity, Bot, ShieldCheck, Sparkles, Crown } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";

export default function AppDock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { getAllInsights, user } = useApp();
  const alertCount = getAllInsights().filter((i) => i.severity === "alert").length;

  const items = [
    { label: "Dashboard", icon: Activity, path: "/" },
    { label: "Insights", icon: Sparkles, path: "/insights", badge: alertCount },
    { label: "Care Team", icon: ShieldCheck, path: "/team" },
    { label: "Automation", icon: Bot, path: "/automation" },
  ];
  if (user?.role === "owner") {
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
