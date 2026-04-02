import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Send, Lightbulb } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface AddLogDialogProps {
  open: boolean;
  onClose: () => void;
  memberId: string;
}

const suggestions = [
  "Complained about chest tightness",
  "Had trouble sleeping last night",
  "Appetite was low today",
  "Felt dizzy after lunch",
  "Back pain in the morning",
  "Seemed more tired than usual",
];

export default function AddLogDialog({ open, onClose, memberId }: AddLogDialogProps) {
  const { addLog, members } = useApp();
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const member = members.find((m) => m.id === memberId);

  const handleSubmit = () => {
    if (!text.trim()) return;
    addLog({ memberId, text: text.trim(), type: "text" });
    setText("");
    setShowSuggestions(true);
    toast.success("Log saved!", { description: `Added observation for ${member?.name}` });
    onClose();
  };

  const handleVoiceMock = () => {
    if (isRecording) {
      setText((prev) =>
        prev
          ? prev + " Also feeling some chest tightness today."
          : "Dad mentioned feeling tired and had trouble sleeping last night."
      );
      setIsRecording(false);
      setShowSuggestions(false);
      toast.info("Voice converted to text");
    } else {
      setIsRecording(true);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setText((prev) => (prev ? `${prev}. ${suggestion}` : suggestion));
    setShowSuggestions(false);
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
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) setShowSuggestions(false);
            }}
            rows={4}
            className="resize-none"
          />

          {/* Quick suggestions */}
          <AnimatePresence>
            {showSuggestions && !text && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="h-3 w-3 text-warning" />
                  <span className="text-xs text-muted-foreground">Quick suggestions</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <motion.button
                      key={s}
                      type="button"
                      onClick={() => handleSuggestionClick(s)}
                      className="text-xs px-2.5 py-1.5 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors border border-border"
                      whileTap={{ scale: 0.95 }}
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-2">
            <motion.div whileTap={{ scale: 0.95 }}>
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
            </motion.div>
            <motion.div className="flex-1" whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleSubmit}
                disabled={!text.trim()}
                className="w-full gap-2 health-gradient border-0"
              >
                <Send className="h-4 w-4" /> Save Log
              </Button>
            </motion.div>
          </div>

          <AnimatePresence>
            {isRecording && (
              <motion.div
                className="flex items-center gap-2 text-destructive text-sm"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <motion.div
                  className="h-2 w-2 rounded-full bg-destructive"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                Recording... (mock — tap Stop to add sample text)
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-xs text-muted-foreground">
            💡 Be specific: mention symptoms, time, activities, and how they felt.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
