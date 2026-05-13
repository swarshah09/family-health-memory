import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Bell, PlayCircle, MessageSquareText, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { toastError, toastFromCaughtError, toastFromFailedResponse } from "@/lib/toast-errors";
import { useAppHub } from "@/lib/hub-outlet";
import { gentleReminderImportance } from "@/lib/reminder-copy";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

type NotificationItem = {
  id: string;
  memberId: string;
  insightId?: string;
  message: string;
  severity: "info" | "warning" | "alert";
  isRead: boolean;
  createdAt: string;
};

export default function AutomationPage() {
  const navigate = useNavigate();
  const inYouHub = useAppHub()?.hub === "you";
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
      toastError(
        "Action not allowed",
        "Only family owners and caregivers can run reminder checks. Ask an owner to update your role if needed."
      );
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/families/${user.familyId}/automation/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        await toastFromFailedResponse(
          response,
          "Reminder check didn’t start",
          "We couldn’t start a reminder check. Try again in a moment."
        );
        return;
      }
    } catch (err: unknown) {
      toastFromCaughtError(
        err,
        "Reminder check didn’t start",
        "We couldn’t reach the server to run a reminder check."
      );
      return;
    }
    toast.success("Reminder check finished");
    await fetchAll();
  };

  const saveSettings = async () => {
    if (!user || !token || !settings) return;
    if (!canManageAutomation) {
      toastError(
        "Settings locked",
        "Only owners and caregivers can change reminder options. Contact a family owner if you need access."
      );
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/families/${user.familyId}/automation/settings`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (!response.ok) {
        await toastFromFailedResponse(
          response,
          "Settings not saved",
          "We couldn’t save these reminder options. Check the numbers and try again."
        );
        return;
      }
    } catch (err: unknown) {
      toastFromCaughtError(
        err,
        "Settings not saved",
        "We couldn’t reach the server to update reminder options."
      );
      return;
    }
    toast.success("Reminder settings saved");
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

  const nextStepHint = (() => {
    if (!status?.lastRunAt) return "Start here: run one reminder check to refresh gentle follow-ups from recent notes.";
    if ((status.notificationsCreated || 0) > 0)
      return "Nice work: skim the reminders below and mark them read once you’ve checked in.";
    return "Nothing new from the last check—keep adding short notes and we’ll keep watching.";
  })();
  const hasRunAtLeastOnce = Boolean(status?.lastRunAt);
  const hasGeneratedAnyInsights = (status?.insightsGenerated || 0) > 0;
  const hasUnreadPrompts = notifications.some((n) => !n.isRead);

  return (
    <div className="app-shell app-safe-bottom bg-background text-foreground">
      <div className={`border-b border-border/50 bg-card/50 px-5 pb-6 backdrop-blur-sm ${inYouHub ? "pt-4" : "pt-12"}`}>
        <div className="flex items-center gap-3">
          {!inYouHub && (
            <button
              onClick={() => navigate("/")}
              className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="h-8 w-8 rounded-xl bg-success/20 flex items-center justify-center">
            <Bot className="h-4 w-4 text-success" />
          </div>
          <div>
            <h1 className="font-display font-bold text-foreground text-lg">Reminders</h1>
            <p className="text-[11px] text-muted-foreground">Gentle nudges when notes suggest something may need attention.</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Quick start (3 steps)</p>
            <span className="text-[11px] text-muted-foreground">
              {[hasRunAtLeastOnce, hasGeneratedAnyInsights, !hasUnreadPrompts].filter(Boolean).length}/3 done
            </span>
          </div>
          <div className="space-y-2">
            {[
              {
                done: hasRunAtLeastOnce,
                title: "Run a reminder check once",
                desc: "Tap Run reminder check to look at recent notes and refresh prompts."
              },
              {
                done: hasGeneratedAnyInsights,
                title: "Review new follow-ups",
                desc: "When the last check finds something worth a look, it appears below. You can fine-tune sensitivity under Advanced tuning."
              },
              {
                done: !hasUnreadPrompts,
                title: "Follow up on prompts",
                desc: "Open each reminder, check in with your family, then mark it read."
              }
            ].map((step) => (
              <div key={step.title} className="rounded-xl border border-border/50 bg-muted/25 p-3">
                <div className="flex items-start gap-2">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className={`text-xs font-medium ${step.done ? "text-success" : "text-foreground"}`}>{step.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{step.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">How reminders help</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We read recent notes with your family in mind and leave short follow-ups when something may need attention—plain
            language, no jargon.
          </p>
          <p className="text-xs text-success leading-relaxed">{nextStepHint}</p>
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground tracking-tight">Reminder check</p>
          <p className="text-xs text-muted-foreground">
            {status?.lastRunAt
              ? `We last reviewed family notes on ${new Date(status.lastRunAt).toLocaleString()}.`
              : "Run a check anytime to refresh gentle follow-ups from recent notes."}
            {status?.lastRunStatus === "failed"
              ? " The last check didn’t finish—try again in a moment."
              : ""}
          </p>
            <Button
            className="h-9 rounded-xl gap-2 bg-success hover:bg-success/90 text-success-foreground"
            onClick={runNow}
            disabled={!canManageAutomation}
          >
              <PlayCircle className="h-4 w-4" /> Run reminder check
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Use this after new notes if you want fresh reminders right away.
          </p>
          <Button
            variant="outline"
            className="h-9 rounded-xl gap-2"
            onClick={() => navigate("/you/chat-ingest")}
          >
            <MessageSquareText className="h-4 w-4" /> Shared messages inbox
          </Button>
        </div>

        {settings && (
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground tracking-tight">Reminder options</p>
            <label className="flex items-center justify-between gap-2 text-sm text-foreground">
              Urgent symptom alerts
              <button
                type="button"
                aria-label="Toggle urgent symptom alerts"
                disabled={!canEditAutomationSettings}
                onClick={() =>
                  setSettings((prev) =>
                    prev ? { ...prev, notificationsEnabled: !prev.notificationsEnabled } : prev
                  )
                }
                className={`h-7 w-12 rounded-full p-1 transition-soft disabled:opacity-40 ${
                  settings.notificationsEnabled ? "bg-success" : "bg-muted"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-card shadow-sm transition-soft ${
                    settings.notificationsEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
            <details className="rounded-xl border border-border/50 bg-muted/15 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-foreground">Advanced tuning</summary>
              <p className="text-[11px] text-muted-foreground mt-2 mb-3 leading-relaxed">
                Only change these if reminders feel too chatty or too quiet. Your family owner can always reset them.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Repeat mentions (minimum)</p>
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
                  <p className="text-xs text-muted-foreground mb-1">Match strength (0–1)</p>
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
              <Button
                className="h-9 rounded-xl mt-3"
                onClick={saveSettings}
                disabled={!canEditAutomationSettings}
              >
                Save reminder settings
              </Button>
            </details>
            {!canEditAutomationSettings && (
              <p className="text-[11px] text-muted-foreground">Only the family owner can change advanced tuning.</p>
            )}
          </div>
        )}

        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold text-foreground tracking-tight">Follow-up prompts</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Read each reminder, peek at their health notes, then add a short follow-up when you have a moment.
          </p>
          <div className="space-y-2.5">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => markRead(notification.id)}
                className={`w-full text-left rounded-xl p-3 border ${
                  notification.isRead ? "border-border/50 bg-muted/35" : "border-success/30 bg-success/10"
                }`}
              >
                <p className="text-xs text-muted-foreground">
                  {new Date(notification.createdAt).toLocaleString()} · {gentleReminderImportance(notification.severity)}
                </p>
                <p className="text-sm text-foreground mt-1">{notification.message}</p>
              </button>
            ))}
            {notifications.length === 0 && (
              <p className="text-xs text-muted-foreground">No prompts yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
