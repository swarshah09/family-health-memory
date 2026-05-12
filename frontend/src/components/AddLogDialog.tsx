import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Send, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { toastError, toastFromCaughtError } from "@/lib/toast-errors";

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

const tagOptions = ["sleep", "medication", "pain", "chest", "mood", "appetite", "energy"];

export default function AddLogDialog({ open, onClose, memberId }: AddLogDialogProps) {
  const { addLog, addVoiceLog, members } = useApp();
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [captureSource, setCaptureSource] = useState<"recording" | "upload" | null>(null);
  const [recordingDurationSec, setRecordingDurationSec] = useState<number | null>(null);
  const [recordingStartMs, setRecordingStartMs] = useState<number | null>(null);
  const [recordingTick, setRecordingTick] = useState(0);
  const member = members.find((m) => m.id === memberId);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const dialogOpenRef = useRef(open);
  dialogOpenRef.current = open;

  const stopMicStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const discardRecordingUi = useCallback(() => {
    stopMicStream();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
  }, [stopMicStream]);

  useEffect(() => {
    if (!open) return;
    setText("");
    setShowSuggestions(true);
    setSelectedTags([]);
    setVoiceFile(null);
    setVoiceUploading(false);
    setCaptureSource(null);
    setRecordingDurationSec(null);
    setRecordingStartMs(null);
    discardRecordingUi();
    return () => {
      discardRecordingUi();
    };
  }, [open, discardRecordingUi]);

  useEffect(() => {
    if (!isRecording || !recordingStartedAtRef.current) return;
    const id = window.setInterval(() => setRecordingTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const handleSubmit = () => {
    if (!text.trim()) return;
    addLog({ memberId, text: text.trim(), type: "text", tags: selectedTags })
      .then(() => {
        setText("");
        setSelectedTags([]);
        setShowSuggestions(true);
        toast.success("Log saved!", { description: `Added observation for ${member?.name}` });
        onClose();
      })
      .catch((err: unknown) =>
        toastFromCaughtError(
          err,
          "Observation not saved",
          "We could not save this note. Check your connection and try again."
        )
      );
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toastError(
        "Recording not available",
        "Your browser does not support audio recording from the microphone. Try another browser or add a text note instead."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const mr = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stopMicStream();
        const started = recordingStartedAtRef.current;
        recordingStartedAtRef.current = null;
        setRecordingStartMs(null);
        if (started) {
          setRecordingDurationSec(Math.max(0.5, (Date.now() - started) / 1000));
        }
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType && mr.mimeType !== "" ? mr.mimeType : "audio/webm"
        });
        chunksRef.current = [];
        const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("mp4") ? "m4a" : "webm";
        if (dialogOpenRef.current) {
          setVoiceFile(new File([blob], `voice.${ext}`, { type: blob.type }));
          setCaptureSource("recording");
        }
        setIsRecording(false);
        mediaRecorderRef.current = null;
      };
      const t0 = Date.now();
      recordingStartedAtRef.current = t0;
      setRecordingStartMs(t0);
      setRecordingDurationSec(null);
      mr.start(1000);
      setIsRecording(true);
    } catch {
      toastError(
        "Microphone access blocked",
        "Allow microphone access in your browser settings, or use a text observation instead."
      );
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else void startRecording();
  };

  const handleVoiceUpload = () => {
    if (!voiceFile) return;
    setVoiceUploading(true);
    const client =
      captureSource === "recording" && recordingDurationSec != null
        ? { durationSec: recordingDurationSec, source: "recording" as const }
        : captureSource === "upload"
          ? { source: "upload" as const }
          : captureSource === "recording"
            ? { source: "recording" as const }
            : undefined;
    addVoiceLog(memberId, voiceFile, text.trim() || undefined, client)
      .then(() => {
        setText("");
        setVoiceFile(null);
        setSelectedTags([]);
        setIsRecording(false);
        setCaptureSource(null);
        setRecordingDurationSec(null);
        toast.success("Voice log uploaded", {
          description: `Added voice note for ${member?.name}. Transcription runs in the background — your timeline will refresh automatically.`
        });
        onClose();
      })
      .catch((err: unknown) =>
        toastFromCaughtError(
          err,
          "Voice note not uploaded",
          "We could not upload the recording. Check your connection and file size, then try again."
        )
      )
      .finally(() => setVoiceUploading(false));
  };

  const handleSuggestionClick = (suggestion: string) => {
    setText((prev) => (prev ? `${prev}. ${suggestion}` : suggestion));
    setShowSuggestions(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dialog-sheet">
        <DialogHeader>
          <DialogDescription className="sr-only">
            Add a text or voice health observation for this family member.
          </DialogDescription>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl health-gradient-soft flex items-center justify-center border border-primary/10">
              <span className="text-primary font-display font-bold text-sm">{member?.name?.[0] || "?"}</span>
            </div>
            <div>
              <DialogTitle className="font-display">Log for {member?.name || "Member"}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Record a health observation</p>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <Textarea
            placeholder="What did you observe? (e.g., 'Dad complained about chest tightness after dinner')"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) setShowSuggestions(false);
            }}
            rows={4}
            className="resize-none rounded-xl border-border/50 bg-background/60 focus:border-primary/40 focus:ring-primary/20"
          />
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.webm,.m4a,.ogg,.aac,.flac"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setVoiceFile(f);
              if (f) {
                setCaptureSource("upload");
                setRecordingDurationSec(null);
              }
            }}
            className="text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-primary"
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

          {/* Quick suggestions */}
          <AnimatePresence>
            {showSuggestions && !text && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Zap className="h-3 w-3 text-warning" />
                  <span className="text-xs text-muted-foreground font-medium">Quick suggestions</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s, i) => (
                    <motion.button
                      key={s}
                      type="button"
                      onClick={() => handleSuggestionClick(s)}
                      className="text-xs px-3 py-1.5 rounded-xl bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all border border-border/40 hover:border-primary/20"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-2.5">
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                type="button"
                variant={isRecording ? "destructive" : "outline"}
                onClick={toggleRecording}
                className="gap-2 rounded-xl"
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-4 w-4" /> Stop recording
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" /> Record voice
                  </>
                )}
              </Button>
            </motion.div>
            <motion.div className="flex-1" whileTap={{ scale: 0.98 }}>
              <Button
                onClick={voiceFile ? handleVoiceUpload : handleSubmit}
                disabled={(!text.trim() && !voiceFile) || voiceUploading}
                className="w-full gap-2 bg-accent hover:bg-accent/90 border-0 rounded-xl shadow-glow"
              >
                <Send className="h-4 w-4" />{" "}
                {voiceUploading ? "Uploading…" : voiceFile ? "Save voice log" : "Save Log"}
              </Button>
            </motion.div>
          </div>

          <AnimatePresence>
            {isRecording && (
              <motion.div
                className="flex items-center gap-2.5 text-destructive text-sm bg-destructive/5 rounded-xl p-3 border border-destructive/10"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <motion.div
                  className="h-2.5 w-2.5 rounded-full bg-destructive"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-xs">
                  Recording… tap Stop recording, then Save voice log. Long pauses and background noise are fine — we transcribe with Whisper when configured, then extract tags with the same AI pipeline as typed notes.
                </span>
                {recordingStartMs != null ? (
                  <span className="text-[10px] text-muted-foreground tabular-nums" data-tick={recordingTick}>
                    {Math.max(1, Math.round((Date.now() - recordingStartMs) / 1000))}s
                  </span>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          {voiceUploading && (
            <p className="text-xs text-muted-foreground bg-primary/5 border border-primary/15 rounded-xl px-3 py-2">
              Uploading audio and starting transcription… You can close this dialog after it finishes.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-xl px-3 py-2.5 leading-relaxed">
            💡 <span className="font-medium">Tip:</span> Be specific — mention symptoms, time, activities, and how they felt for better AI analysis.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
