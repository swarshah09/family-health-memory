import { useEffect, useState } from "react";
import type { HealthLog } from "@/context/AppContext";
import { useApp } from "@/context/AppContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Send } from "lucide-react";
import { toast } from "sonner";
import { toastFromCaughtError } from "@/lib/toast-errors";

interface EditLogDialogProps {
  open: boolean;
  onClose: () => void;
  log: HealthLog | null;
}

const tagOptions = ["sleep", "medication", "pain", "chest", "mood", "appetite", "energy"];

export default function EditLogDialog({ open, onClose, log }: EditLogDialogProps) {
  const { updateLog, members } = useApp();
  const [text, setText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const member = log ? members.find((m) => m.id === log.memberId) : undefined;

  useEffect(() => {
    if (!open || !log) return;
    setText(log.text);
    setSelectedTags(log.tags || []);
  }, [open, log]);

  const handleSubmit = () => {
    if (!log || !text.trim()) return;
    updateLog(log.id, { text: text.trim(), tags: selectedTags })
      .then(() => {
        toast.success("Log updated", { description: `Saved changes for ${member?.name || "member"}` });
        onClose();
      })
      .catch((err: unknown) =>
        toastFromCaughtError(
          err,
          "Changes not saved",
          "We could not update this observation. Check your connection and try again."
        )
      );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dialog-sheet">
        <DialogHeader>
          <DialogDescription className="sr-only">Edit this health observation.</DialogDescription>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl health-gradient-soft flex items-center justify-center border border-primary/10">
              <span className="text-primary font-display font-bold text-sm">{member?.name?.[0] || "?"}</span>
            </div>
            <div>
              <DialogTitle className="font-display">Edit log</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {log?.type === "voice" ? "Voice note transcript" : "Text observation"} · {member?.name || "Member"}
              </p>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {log?.type === "voice" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2 border border-border/30">
              <Mic className="h-3.5 w-3.5 text-accent shrink-0" />
              <span>Editing updates the transcript shown in your timeline.</span>
            </div>
          )}
          <Textarea
            placeholder="Observation details..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="resize-none rounded-xl border-border/50 bg-background/60 focus:border-primary/40 focus:ring-primary/20"
          />
          <div className="flex flex-wrap gap-2">
            {tagOptions.map((tag) => {
              const selected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setSelectedTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    )
                  }
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    selected
                      ? tag === "sleep" || tag === "energy"
                        ? "bg-success/15 border-success/30 text-success"
                        : tag === "pain"
                          ? "bg-accent/15 border-accent/30 text-accent"
                          : tag === "mood"
                            ? "bg-warning/15 border-warning/30 text-warning"
                            : "bg-insight/15 border-insight/30 text-insight"
                      : "bg-muted/40 border-border/50 text-muted-foreground"
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2.5">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim()}
              className="flex-1 gap-2 bg-accent hover:bg-accent/90 border-0 rounded-xl shadow-glow"
            >
              <Send className="h-4 w-4" /> Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
