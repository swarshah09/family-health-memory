import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Bell, PlayCircle, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

type NotificationItem = {
  id: string;
  memberId: string;
  message: string;
  severity: "info" | "warning" | "alert";
  isRead: boolean;
  createdAt: string;
};

export default function AutomationPage() {
  const navigate = useNavigate();
  const { user } = useApp();
  const canManageAutomation = user?.role === "owner" || user?.role === "caregiver";
  const canEditAutomationSettings = user?.role === "owner";
  const [status, setStatus] = useState<{
    lastRunAt: string | null;
    lastRunStatus: "success" | "failed" | null;
    insightsGenerated: number;
    notificationsCreated: number;
  } | null>(null);
  const [settings, setSettings] = useState<{
    minMentions: number;
    minConfidence: number;
    notificationsEnabled: boolean;
  } | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const token = localStorage.getItem("fhm_access_token");

  const fetchAll = async () => {
    if (!user || !token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [statusRes, notifRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/families/${user.familyId}/automation/status`, { headers }),
      fetch(`${API_BASE_URL}/api/families/${user.familyId}/notifications`, { headers })
    ]);
    if (statusRes.ok) {
      const statusJson = await statusRes.json();
      setStatus(statusJson.status || null);
      setSettings(statusJson.settings || null);
    } else {
      setStatus(null);
      setSettings(null);
    }
    if (notifRes.ok) {
      const notifJson = await notifRes.json();
      setNotifications(notifJson.notifications || []);
    } else {
      setNotifications([]);
    }
  };

  useEffect(() => {
    fetchAll().catch(() => {});
  }, [user?.familyId]);

  const runNow = async () => {
    if (!user || !token) return;
    if (!canManageAutomation) {
      toast.error("Only owners and caregivers can run automation");
      return;
    }
    const response = await fetch(`${API_BASE_URL}/api/families/${user.familyId}/automation/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      toast.error("Could not run automation");
      return;
    }
    toast.success("Automation run completed");
    await fetchAll();
  };

  const saveSettings = async () => {
    if (!user || !token || !settings) return;
    if (!canManageAutomation) {
      toast.error("Only owners and caregivers can update settings");
      return;
    }
    const response = await fetch(`${API_BASE_URL}/api/families/${user.familyId}/automation/settings`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      toast.error("Could not update settings");
      return;
    }
    toast.success("Automation settings saved");
    await fetchAll();
  };

  const markRead = async (notificationId: string) => {
    if (!user || !token) return;
    await fetch(`${API_BASE_URL}/api/families/${user.familyId}/notifications/${notificationId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });
    setNotifications((prev) =>
      prev.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item))
    );
  };

  return (
    <div className="app-shell app-safe-bottom bg-[#171513] text-white">
      <div className="bg-[#1d1a18] border-b border-white/10 px-5 pt-12 pb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-white/60 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="h-8 w-8 rounded-xl bg-success/20 flex items-center justify-center">
            <Bot className="h-4 w-4 text-success" />
          </div>
          <div>
            <h1 className="font-display font-bold text-white text-lg">Automation Center</h1>
            <p className="text-[11px] text-white/55">AI runs, thresholds and nudges</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
        <div className="rounded-2xl p-4 space-y-2 border border-white/10 bg-[#201d1b]">
          <p className="text-sm font-semibold text-white">Run status</p>
          <p className="text-xs text-white/55">
            Last run: {status?.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : "Never"}
          </p>
          <p className="text-xs text-white/55">
            Result: {status?.lastRunStatus || "N/A"} | Insights: {status?.insightsGenerated || 0} |
            Notifications: {status?.notificationsCreated || 0}
          </p>
          <Button
            className="h-9 rounded-xl gap-2 bg-success hover:bg-success/90 text-success-foreground"
            onClick={runNow}
            disabled={!canManageAutomation}
          >
            <PlayCircle className="h-4 w-4" /> Run analysis now
          </Button>
          <Button
            variant="outline"
            className="h-9 rounded-xl gap-2"
            onClick={() => navigate("/chat-ingest")}
          >
            <MessageSquareText className="h-4 w-4" /> Shared messages inbox
          </Button>
        </div>

        {settings && (
          <div className="rounded-2xl p-4 space-y-3 border border-white/10 bg-[#201d1b]">
            <p className="text-sm font-semibold text-white">Threshold config</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-white/55 mb-1">Min mentions</p>
                <Input
                  type="number"
                  disabled={!canEditAutomationSettings}
                  value={settings.minMentions}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, minMentions: Number(e.target.value || "3") } : prev
                    )
                  }
                />
              </div>
              <div>
                <p className="text-xs text-white/55 mb-1">Min confidence</p>
                <Input
                  type="number"
                  step="0.05"
                  disabled={!canEditAutomationSettings}
                  value={settings.minConfidence}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, minConfidence: Number(e.target.value || "0.7") } : prev
                    )
                  }
                />
              </div>
            </div>
            <label className="flex items-center justify-between gap-2 text-sm text-white">
              Pain alerts
              <button
                type="button"
                aria-label="Toggle pain alerts"
                disabled={!canEditAutomationSettings}
                onClick={() =>
                  setSettings((prev) =>
                    prev ? { ...prev, notificationsEnabled: !prev.notificationsEnabled } : prev
                  )
                }
                className={`h-7 w-12 rounded-full p-1 transition-soft disabled:opacity-40 ${
                  settings.notificationsEnabled ? "bg-success" : "bg-white/20"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-soft ${
                    settings.notificationsEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
            <Button
              className="h-9 rounded-xl"
              onClick={saveSettings}
              disabled={!canEditAutomationSettings}
            >
              Save thresholds
            </Button>
            {!canEditAutomationSettings && (
              <p className="text-[11px] text-white/45">Only the family owner can change thresholds.</p>
            )}
          </div>
        )}

        <div className="rounded-2xl p-4 border border-white/10 bg-[#201d1b]">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold text-white">Notification inbox</p>
          </div>
          <div className="space-y-2.5">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => markRead(notification.id)}
                className={`w-full text-left rounded-xl p-3 border ${
                  notification.isRead ? "border-white/10 bg-black/10" : "border-success/30 bg-success/10"
                }`}
              >
                <p className="text-xs text-white/50">
                  {new Date(notification.createdAt).toLocaleString()} - {notification.severity}
                </p>
                <p className="text-sm text-white mt-1">{notification.message}</p>
              </button>
            ))}
            {notifications.length === 0 && (
              <p className="text-xs text-white/50">No AI nudges yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
