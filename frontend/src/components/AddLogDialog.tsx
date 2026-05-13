import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mic, MicOff, MoreHorizontal, Send, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { toastError, toastFromCaughtError } from "@/lib/toast-errors";

const ADD_LOG_ONBOARDING_KEY = "fhm_add_log_onboarding_v1";

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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if (fileInputRef.current) fileInputRef.current.value = "";
    const seen = typeof localStorage !== "undefined" && localStorage.getItem(ADD_LOG_ONBOARDING_KEY) === "1";
    setShowOnboarding(!seen);
    return () => {
      discardRecordingUi();
    };
  }, [open, discardRecordingUi]);

  useEffect(() => {
    if (!isRecording || !recordingStartedAtRef.current) return;
    const id = window.setInterval(() => setRecordingTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const markOnboardingSeen = () => {
    try {
      localStorage.setItem(ADD_LOG_ONBOARDING_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowOnboarding(false);
  };

  const clearVoiceAttachment = () => {
    setVoiceFile(null);
    setCaptureSource(null);
    setRecordingDurationSec(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = () => {
    if (!text.trim()) return;
    addLog({ memberId, text: text.trim(), type: "text", tags: selectedTags })
      .then(() => {
        markOnboardingSeen();
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
          type: mr.mimeType && mr.mimeType !== "" ? mr.mimeType : "audio/webm",
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
        markOnboardingSeen();
        setText("");
        setVoiceFile(null);
        setSelectedTags([]);
        setIsRecording(false);
        setCaptureSource(null);
        setRecordingDurationSec(null);
        toast.success("Voice log uploaded", {
          description: `Added voice note for ${member?.name}. Transcription runs in the background — your timeline will refresh automatically.`,
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

  const canSave = Boolean(text.trim() || voiceFile);
  const saveDisabled = !canSave || voiceUploading;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dialog-sheet gap-0 sm:max-w-md">
        <DialogHeader className="space-y-0 pb-3">
          <DialogDescription className="sr-only">
            Add a text or voice health observation for this family member.
          </DialogDescription>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl health-gradient-soft flex items-center justify-center border border-primary/10 shrink-0">
              <span className="text-primary font-display font-bold text-sm">{member?.name?.[0] || "?"}</span>
            </div>
            <DialogTitle className="font-display text-left text-lg leading-tight">Log for {member?.name || "Member"}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {showOnboarding ? (
            <div className="rounded-2xl border border-border/50 bg-muted/25 px-3 py-3 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                A short sentence is perfect. Use the mic if that’s easier—tags are optional and only help you find things later.
              </p>
              <Button type="button" variant="secondary" size="sm" className="h-9 w-full rounded-xl text-xs" onClick={markOnboardingSeen}>
                Got it
              </Button>
            </div>
          ) : null}

          <Textarea
            placeholder="What stood out?"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) setShowSuggestions(false);
            }}
            rows={3}
            autoFocus
            className="resize-none min-h-[100px] text-base rounded-2xl border-border/50 bg-background/80 focus:border-primary/35 focus:ring-primary/15 md:text-sm"
          />

          <div className="space-y-2">
            <Button
              type="button"
              variant={isRecording ? "destructive" : "outline"}
              onClick={toggleRecording}
              className="w-full h-12 rounded-2xl gap-2 text-sm font-medium border-border/60"
            >
              {isRecording ? (
                <>
                  <MicOff className="h-5 w-5 shrink-0" /> Stop recording
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5 shrink-0" /> Record voice
                </>
              )}
            </Button>
            <AnimatePresence>
              {isRecording ? (
                <motion.div
                  className="flex items-center gap-2.5 text-destructive text-sm bg-destructive/5 rounded-xl px-3 py-2.5 border border-destructive/10"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <motion.span
                    className="h-2 w-2 rounded-full bg-destructive shrink-0"
                    animate={{ opacity: [1, 0.35, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-xs flex-1">Listening… tap stop when you’re done.</span>
                  {recordingStartMs != null ? (
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0" data-tick={recordingTick}>
                      {Math.max(1, Math.round((Date.now() - recordingStartMs) / 1000))}s
                    </span>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {showSuggestions && !text ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden space-y-2"
              >
                <p className="text-[11px] text-muted-foreground px-0.5">Quick ideas — tap to add</p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSuggestionClick(s)}
                      className="min-h-[48px] w-full rounded-2xl border border-border/45 bg-muted/25 px-4 py-3 text-left text-sm text-foreground leading-snug active:bg-muted/45 transition-colors touch-manipulation"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground px-0.5">Optional tags</p>
            <div className="flex flex-wrap gap-2">
              {tagOptions.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
                    }
                    className={`min-h-9 px-3 py-2 rounded-xl text-xs border transition-colors touch-manipulation ${
                      selected
                        ? tag === "sleep" || tag === "energy"
                          ? "bg-success/15 border-success/30 text-success"
                          : tag === "pain"
                            ? "bg-accent/15 border-accent/30 text-accent"
                            : tag === "mood"
                              ? "bg-warning/15 border-warning/30 text-warning"
                              : "bg-insight/15 border-insight/30 text-insight"
                        : "bg-muted/30 border-border/50 text-muted-foreground"
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </div>

          {voiceFile && !isRecording ? (
            <p className="text-xs text-muted-foreground rounded-xl bg-muted/20 border border-border/40 px-3 py-2">
              Audio ready — save to add this note.
            </p>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.webm,.m4a,.ogg,.aac,.flac"
            className="sr-only"
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              if (f) {
                setVoiceFile(f);
                setCaptureSource("upload");
                setRecordingDurationSec(null);
              }
              e.target.value = "";
            }}
          />

          <div className="flex gap-2 items-center pt-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 shrink-0 rounded-2xl border-border/60"
                  aria-label="More options"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onSelect={() => {
                    window.requestAnimationFrame(() => fileInputRef.current?.click());
                  }}
                >
                  <Upload className="h-4 w-4 opacity-70" />
                  Upload audio file
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-muted-foreground focus:text-foreground"
                  disabled={!voiceFile}
                  onSelect={() => {
                    if (voiceFile) clearVoiceAttachment();
                  }}
                >
                  Remove audio
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              onClick={voiceFile ? handleVoiceUpload : handleSubmit}
              disabled={saveDisabled}
              className="flex-1 h-12 gap-2 rounded-2xl bg-accent hover:bg-accent/90 border-0 shadow-sm text-base font-medium"
            >
              <Send className="h-4 w-4 shrink-0" />
              {voiceUploading ? "Saving…" : voiceFile ? "Save voice note" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
