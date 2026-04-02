import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Send } from "lucide-react";

interface AddLogDialogProps {
  open: boolean;
  onClose: () => void;
  memberId: string;
}

export default function AddLogDialog({ open, onClose, memberId }: AddLogDialogProps) {
  const { addLog, members } = useApp();
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const member = members.find((m) => m.id === memberId);

  const handleSubmit = () => {
    if (!text.trim()) return;
    addLog({ memberId, text: text.trim(), type: "text" });
    setText("");
    onClose();
  };

  const handleVoiceMock = () => {
    if (isRecording) {
      // Mock voice-to-text
      setText((prev) =>
        prev
          ? prev + " Also feeling some chest tightness today."
          : "Dad mentioned feeling tired and had trouble sleeping last night."
      );
      setIsRecording(false);
    } else {
      setIsRecording(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>Log for {member?.name || "Member"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            placeholder="What did you observe? (e.g., 'Dad complained about chest tightness after dinner')"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="resize-none"
          />

          <div className="flex gap-2">
            <Button
              type="button"
              variant={isRecording ? "destructive" : "outline"}
              onClick={handleVoiceMock}
              className="gap-2"
            >
              {isRecording ? (
                <>
                  <MicOff className="h-4 w-4" /> Stop
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" /> Voice
                </>
              )}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!text.trim()}
              className="flex-1 gap-2 health-gradient border-0"
            >
              <Send className="h-4 w-4" /> Save Log
            </Button>
          </div>

          {isRecording && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              Recording... (mock — tap Stop to add sample text)
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            💡 Be specific: mention symptoms, time, activities, and how they felt.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
