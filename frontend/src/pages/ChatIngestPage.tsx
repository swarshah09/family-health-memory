import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ArrowLeft, ClipboardList, MessageSquareText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { toastError, toastFromCaughtError, toastFromFailedResponse } from "@/lib/toast-errors";
import { useAppHub } from "@/lib/hub-outlet";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

type PendingItem = {
  id: string;
  senderName: string;
  text: string;
  structuredHint: {
    memberName?: string | null;
    tags?: string[];
    normalizedText?: string;
  } | null;
  createdAt: string;
};

function hintMemberId(
  hint: PendingItem["structuredHint"],
  members: { id: string; name: string }[]
): string {
  const name = hint?.memberName?.trim();
  if (!name) return "";
  const found = members.find((m) => m.name.toLowerCase() === name.toLowerCase());
  return found?.id || "";
}

export default function ChatIngestPage() {
  const navigate = useNavigate();
  const inYouHub = useAppHub()?.hub === "you";
  const { user, members, refreshFamilyData } = useApp();
  const [senderName, setSenderName] = useState("Family Member");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Array<{ text: string; status: string }>>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [memberChoice, setMemberChoice] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const token = localStorage.getItem("fhm_access_token");
  const canResolve = user?.role === "owner" || user?.role === "caregiver";

  const loadPending = useCallback(async () => {
    if (!user || !token) return;
    const response = await fetch(
      `${API_BASE_URL}/api/families/${user.familyId}/chat/pending-review`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) return;
    const json = await response.json();
    setPending(json.pending || []);
  }, [user, token]);

  useEffect(() => {
    loadPending().catch(() => {});
  }, [loadPending]);

  useEffect(() => {
    setMemberChoice((prev) => {
      const next = { ...prev };
      for (const item of pending) {
        if (next[item.id] === undefined) {
          const fromHint = hintMemberId(item.structuredHint, members);
          next[item.id] = fromHint || "";
        }
      }
      return next;
    });
  }, [pending, members]);

  const ingest = async () => {
    if (!user || !message.trim()) return;
    if (!token) return;

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/api/families/${user.familyId}/chat/ingest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          senderName: senderName.trim() || "Family Member",
          text: message.trim()
        })
      });
    } catch (err: unknown) {
      toastFromCaughtError(
        err,
        "Message not sent",
        "We could not reach the server to record your message."
      );
      return;
    }

    if (!response.ok) {
      await toastFromFailedResponse(
        response,
        "Message not recorded",
        "We could not process this chat message. Try again or shorten the text."
      );
      return;
    }

    const json = await response.json();
    const created = json.result?.logCreated ? "Log created" : "No member match — added to review";
    setHistory((prev) => [{ text: message.trim(), status: created }, ...prev].slice(0, 8));
    setMessage("");
    toast.success(created);
    await loadPending();
  };

  const resolveOne = async (messageId: string) => {
    if (!user || !token || !canResolve) return;
    const memberId = memberChoice[messageId];
    if (!memberId) {
      toastError(
        "Select a family member",
        "Choose which person this message should be linked to before creating the health log."
      );
      return;
    }
    setResolvingId(messageId);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/families/${user.familyId}/chat/${messageId}/resolve`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ memberId })
        }
      );
      if (!response.ok) {
        await toastFromFailedResponse(
          response,
          "Health log not created",
          "We could not attach this message to the selected member. Try again or pick a different member."
        );
        return;
      }
      toast.success("Health log created");
      await loadPending();
      await refreshFamilyData();
    } catch (err: unknown) {
      toastFromCaughtError(
        err,
        "Health log not created",
        "We could not reach the server to create this log from the message."
      );
    } finally {
      setResolvingId(null);
    }
  };

  const dismissOne = async (messageId: string) => {
    if (!user || !token || !canResolve) return;
    setResolvingId(messageId);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/families/${user.familyId}/chat/${messageId}/dismiss`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!response.ok) {
        await toastFromFailedResponse(
          response,
          "Item not dismissed",
          "We could not remove this message from the review queue."
        );
        return;
      }
      toast.success("Removed from review");
      await loadPending();
    } catch (err: unknown) {
      toastFromCaughtError(
        err,
        "Item not dismissed",
        "We could not reach the server to dismiss this review item."
      );
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="app-shell app-safe-bottom">
      {!inYouHub && (
        <div className="bg-card border-b border-border/40 px-5 pt-12 pb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/you/automation")}
              className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquareText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-foreground text-lg">Shared messages</h1>
              <p className="text-[11px] text-muted-foreground">
                Add notes from relatives; unmatched messages go to the review queue.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={inYouHub ? "space-y-4 px-5 py-4" : "space-y-4 px-5 py-5"}>
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <Input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Sender name"
            className="h-10 rounded-xl"
          />
          <Textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Mom didn’t sleep well after starting new medication."
            className="rounded-xl"
          />
          <Button onClick={ingest} className="h-10 rounded-xl" disabled={!canResolve}>
            Submit message
          </Button>
          {!canResolve && (
            <p className="text-xs text-muted-foreground">
              View-only members cannot submit or assign messages.
            </p>
          )}
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <ClipboardList className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Review queue</p>
              <p className="text-[11px] text-muted-foreground">
                Messages that did not match a member automatically. Assign once to create a log.
              </p>
            </div>
          </div>

          {pending.length === 0 && (
            <p className="text-xs text-muted-foreground">No messages waiting for review.</p>
          )}

          {pending.map((item) => {
            const hint = item.structuredHint;
            const tags = hint?.tags?.length ? hint.tags.join(", ") : null;
            const busy = resolvingId === item.id;

            return (
              <div
                key={item.id}
                className="rounded-xl border border-border/40 p-3 space-y-2 bg-background/40"
              >
                <p className="text-sm text-foreground">{item.text}</p>
                <p className="text-[11px] text-muted-foreground">
                  From {item.senderName}
                  {hint?.memberName ? ` · AI hint: ${hint.memberName}` : ""}
                  {tags ? ` · Tags: ${tags}` : ""}
                </p>

                {canResolve ? (
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <Select
                      value={memberChoice[item.id] || ""}
                      onValueChange={(v) =>
                        setMemberChoice((prev) => ({ ...prev, [item.id]: v }))
                      }
                    >
                      <SelectTrigger className="h-10 rounded-xl flex-1">
                        <SelectValue placeholder="Assign to member" />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-10 rounded-xl flex-1 sm:flex-none"
                        disabled={busy}
                        onClick={() => resolveOne(item.id)}
                      >
                        Create log
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-10 rounded-xl flex-1 sm:flex-none"
                        disabled={busy}
                        onClick={() => dismissOne(item.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground pt-1">
                    Only organizers and contributors can assign these messages.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">Recent submissions</p>
          {history.map((item, idx) => (
            <div key={`${item.text}-${idx}`} className="rounded-xl border border-border/40 p-3">
              <p className="text-sm text-foreground">{item.text}</p>
              <p className="text-xs text-muted-foreground mt-1">{item.status}</p>
            </div>
          ))}
          {history.length === 0 && <p className="text-xs text-muted-foreground">No submissions yet.</p>}
        </div>
      </div>
    </div>
  );
}
