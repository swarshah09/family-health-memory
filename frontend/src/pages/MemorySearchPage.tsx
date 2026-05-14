import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import type { MemorySearchCitation, MemorySearchResult } from "@/types/memory-search";
import { ArrowLeft, MessageCircle, Send, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastFromCaughtError } from "@/lib/toast-errors";
import { useAppHub } from "@/lib/hub-outlet";
import { CopyHint } from "@/components/CopyHint";
import { MEMORY_SEARCH_DISCLAIMER } from "@/lib/disclaimer-copy";

type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; result?: MemorySearchResult };

const SUGGESTED = [
  "When did fatigue start?",
  "Has sleep worsened recently?",
  "What changed after medicine?"
];

export default function MemorySearchPage() {
  const navigate = useNavigate();
  const { user, members, memorySearch } = useApp();
  const inInsightsHub = useAppHub()?.hub === "insights";
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const buildHistory = (upToIndex: number): Array<{ role: "user" | "assistant"; content: string }> => {
    const slice = messages.slice(0, upToIndex);
    const out: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const m of slice) {
      if (m.role === "user") out.push({ role: "user", content: m.content });
      else out.push({ role: "assistant", content: m.content });
    }
    return out.slice(-10);
  };

  const sendQuery = async (raw: string) => {
    const text = raw.trim();
    if (!text || loading) return;
    const userIndex = messages.length;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const history = buildHistory(userIndex);
      const result = await memorySearch({
        query: text,
        memberId: memberFilter === "all" ? undefined : memberFilter,
        history
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.answer,
          result
        }
      ]);
    } catch (err: unknown) {
      setMessages((prev) => prev.slice(0, -1));
      toastFromCaughtError(
        err,
        "Search did not complete",
        "Check that GEMINI_API_KEY is set on the API and try a shorter question."
      );
    } finally {
      setLoading(false);
    }
  };

  const openCitation = (c: MemorySearchCitation) => {
    navigate(`/member/${c.memberId}?logId=${encodeURIComponent(c.logId)}`);
  };

  return (
    <div className="app-shell app-safe-bottom flex flex-col min-h-[100dvh]">
      <div className={`bg-card border-b border-border/40 px-5 pb-5 shrink-0 ${inInsightsHub ? "pt-4" : "pt-12"}`}>
        <div className="flex items-center gap-3">
          {!inInsightsHub && (
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex flex-1 min-w-0 items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-insight/15 flex items-center justify-center shrink-0">
              <MessageCircle className="h-4 w-4 text-insight" />
            </div>
            <h1 className="font-display font-bold text-foreground text-lg">Ask your memory</h1>
            <CopyHint label="About this search">{MEMORY_SEARCH_DISCLAIMER}</CopyHint>
          </div>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Scope</span>
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger className="h-10 rounded-xl sm:max-w-xs">
              <SelectValue placeholder="Member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All family members</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="glass-card rounded-2xl p-5 border border-border/40 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-insight" />
              Try asking
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Questions are answered from your saved logs (symptoms, sleep, medications, voice notes). Citations link
              back to the exact timeline entry.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void sendQuery(q)}
                  className="text-left text-[11px] rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-foreground hover:bg-muted/50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={`u-${i}`} className="flex gap-2 justify-end">
              <div className="max-w-[90%] rounded-2xl bg-primary/15 border border-primary/25 px-4 py-2.5">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{m.content}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ) : (
            <div key={`a-${i}`} className="flex gap-2 justify-start">
              <div className="h-8 w-8 rounded-full bg-insight/15 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-insight" />
              </div>
              <div className="max-w-[92%] space-y-2">
                <div className="rounded-2xl bg-muted/40 border border-border/40 px-4 py-2.5">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  {m.result?.modelDisabled ? (
                    <p className="text-[11px] text-warning mt-2 border-t border-border/30 pt-2">
                      AI search is not fully enabled until the server has GEMINI_API_KEY configured.
                    </p>
                  ) : null}
                  {m.result ? (
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Confidence: {m.result.confidence} · Grounded in {m.result.logsConsidered} log
                      {m.result.logsConsidered === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
                {m.result?.citations?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {m.result.citations.map((c) => (
                      <button
                        key={c.logId}
                        type="button"
                        onClick={() => openCitation(c)}
                        className="text-[10px] rounded-lg border border-border/60 bg-background/80 px-2 py-1 text-left hover:bg-muted transition-colors max-w-full"
                      >
                        <span className="font-medium text-foreground">{c.memberName}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-muted-foreground">
                          {new Date(c.occurredAt).toLocaleDateString()}
                        </span>
                        <span className="block text-muted-foreground truncate mt-0.5">{c.excerpt}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {m.result?.followUpSuggestions?.length ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {m.result.followUpSuggestions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void sendQuery(q)}
                        className="text-[10px] rounded-full bg-accent/15 text-accent border border-accent/25 px-2.5 py-1 hover:bg-accent/25"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="flex gap-2 justify-start pl-10">
            <p className="text-xs text-muted-foreground animate-pulse">Reading your logs…</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 border-t border-border/40 bg-background/95 backdrop-blur px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0">
        <form
          className="flex gap-2 max-w-3xl mx-auto"
          onSubmit={(e) => {
            e.preventDefault();
            void sendQuery(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about patterns in your logs…"
            className="h-11 rounded-xl flex-1"
            disabled={loading}
          />
          <Button type="submit" className="h-11 rounded-xl px-4 gap-2 shrink-0" disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
            Ask
          </Button>
        </form>
        {user?.role === "viewer" ? (
          <p className="text-[10px] text-center text-muted-foreground mt-2 max-w-xl mx-auto">
            View-only access: you can search and read answers; contributors add new notes.
          </p>
        ) : null}
      </div>
    </div>
  );
}
