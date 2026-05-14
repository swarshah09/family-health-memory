import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { analyzePPGBuffer } from "@/lib/pulseScan/ppg";
import { disableTorch, enableTorchRobust, getVideoStreamPreferTorch } from "@/lib/pulseScan/torch";
import { useApp } from "@/context/AppContext";
import { Camera, Heart, Loader2 } from "lucide-react";

const SCAN_TARGET_SEC = 36;
const MIN_SAMPLE_INTERVAL_MS = 1000 / 26;

type Phase = "idle" | "scanning" | "processing" | "done" | "error";

type PulseScanCardProps = {
  memberId: string | undefined;
  memberLabel: string;
};

export default function PulseScanCard({ memberId, memberLabel }: PulseScanCardProps) {
  const { user, saveWellnessPulseSession, fetchWellnessPulseSessions, refreshFamilyData } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const samplesRef = useRef<number[]>([]);
  const t0Ref = useRef<number>(0);
  const lastSampleRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [lastSummary, setLastSummary] = useState<{
    heartRate: number;
    signalConfidence: number;
    capturedAt: string;
  } | null>(null);
  const [lastWaveform, setLastWaveform] = useState<number[] | null>(null);
  const [torchNote, setTorchNote] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      const t = s.getVideoTracks()[0];
      void disableTorch(t);
      s.getTracks().forEach((tr) => tr.stop());
    }
    streamRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  useEffect(() => {
    if (!memberId || !user?.familyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchWellnessPulseSessions(memberId, 1);
        if (cancelled || !list[0]) return;
        const s = list[0];
        setLastSummary({
          heartRate: s.heartRate,
          signalConfidence: s.signalConfidence,
          capturedAt: s.capturedAt
        });
        setLastWaveform(Array.isArray(s.waveformSamples) && s.waveformSamples.length ? s.waveformSamples : null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId, user?.familyId, fetchWellnessPulseSessions]);

  const runScan = async () => {
    if (!memberId || !user?.familyId) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not available in this browser.");
      setPhase("error");
      return;
    }
    if (!window.isSecureContext) {
      setError("Use HTTPS (or localhost) so your browser can access the camera safely.");
      setPhase("error");
      return;
    }

    setError(null);
    setTorchNote(null);
    setPhase("scanning");
    setProgress(0);
    samplesRef.current = [];
    t0Ref.current = performance.now();
    lastSampleRef.current = 0;

    let stream: MediaStream;
    try {
      stream = await getVideoStreamPreferTorch();
    } catch {
      setError("We could not open the camera. Check permissions and try again.");
      setPhase("error");
      return;
    }

    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    const v = videoRef.current;
    if (!v || !track) {
      stopStream();
      setError("Could not attach the camera preview.");
      setPhase("error");
      return;
    }

    v.srcObject = stream;
    const torchOk = await enableTorchRobust(track, v);
    if (!torchOk) {
      setTorchNote(
        "We could not turn on the flash from the browser. The scan can still work — try a dimmer room, steady pressure, and Chrome on Android. iPhone Safari usually cannot control the flash for websites."
      );
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) {
      stopStream();
      setError("Could not prepare the capture canvas.");
      setPhase("error");
      return;
    }

    const sampleFrame = () => {
      const vid = videoRef.current;
      if (!vid || vid.readyState < 2) {
        rafRef.current = requestAnimationFrame(sampleFrame);
        return;
      }

      const now = performance.now();
      const elapsed = (now - t0Ref.current) / 1000;
      setProgress(Math.min(100, (elapsed / SCAN_TARGET_SEC) * 100));

      if (elapsed >= SCAN_TARGET_SEC) {
        stopStream();
        const durationSec = (now - t0Ref.current) / 1000;
        const raw = samplesRef.current;
        setPhase("processing");

        const result = analyzePPGBuffer(raw, durationSec);
        const capturedAt = new Date().toISOString();

        void (async () => {
          try {
            if (result.heartRate > 0) {
              await saveWellnessPulseSession({
                memberId,
                heartRate: result.heartRate,
                signalConfidence: result.signalConfidence,
                sessionDurationSec: Math.round(durationSec),
                capturedAt,
                waveformSamples: result.waveformSamples
              });
              await refreshFamilyData();
              setLastSummary({
                heartRate: result.heartRate,
                signalConfidence: result.signalConfidence,
                capturedAt
              });
              setLastWaveform(result.waveformSamples.length ? result.waveformSamples : null);
            }
            setPhase("done");
          } catch {
            setError("Could not save this session. Check your connection and try again.");
            setPhase("error");
          }
        })();
        return;
      }

      if (now - lastSampleRef.current >= MIN_SAMPLE_INTERVAL_MS) {
        lastSampleRef.current = now;
        const w = vid.videoWidth;
        const h = vid.videoHeight;
        if (w > 0 && h > 0) {
          const side = 48;
          canvas.width = side;
          canvas.height = side;
          ctx.drawImage(vid, (w - side) / 2, (h - side) / 2, side, side, 0, 0, side, side);
          const img = ctx.getImageData(0, 0, side, side).data;
          let sum = 0;
          const step = 4 * 2;
          for (let p = 0; p < img.length; p += step) {
            const r = img[p]!;
            const g = img[p + 1]!;
            const b = img[p + 2]!;
            sum += 0.59 * g + 0.3 * r + 0.11 * b;
          }
          const px = img.length / (4 * 2);
          samplesRef.current.push(sum / Math.max(1, px));
        }
      }

      rafRef.current = requestAnimationFrame(sampleFrame);
    };

    rafRef.current = requestAnimationFrame(sampleFrame);
  };

  const reset = () => {
    setPhase("idle");
    setError(null);
    setProgress(0);
  };

  const secure = typeof window !== "undefined" && window.isSecureContext;

  return (
    <div className="chronicle-card flex flex-col rounded-[1.75rem] p-5 sm:p-6 lg:col-span-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pulse scan</p>
      <p className="mt-1 text-xs text-muted-foreground">Heart rhythm snapshot · {memberLabel}</p>

      <div className="relative mt-3 min-h-[7.5rem] overflow-hidden rounded-2xl border border-border/50 bg-muted/15">
        <video
          ref={videoRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
          playsInline
          muted
          aria-hidden
        />
        <canvas ref={canvasRef} className="hidden" />
        <div className="relative z-[1] flex flex-col gap-2 p-4">
          {phase === "idle" && (
            <>
              <p className="text-sm leading-relaxed text-foreground/90">
                Rest your fingertip gently over the rear camera and light. Hold still for about {SCAN_TARGET_SEC}{" "}
                seconds — a calm wellness check, not a medical test.
              </p>
              {lastSummary && lastSummary.heartRate > 0 && (
                <p className="text-xs text-muted-foreground">
                  Last snapshot: ~{lastSummary.heartRate} bpm ·{" "}
                  {new Date(lastSummary.capturedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                  })}
                </p>
              )}
            </>
          )}
          {phase === "scanning" && (
            <div className="space-y-3">
              <p className="text-sm text-foreground/90">Stay still — capturing a soft rhythm snapshot…</p>
              <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-primary/50 transition-[width] duration-150 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Cover both the lens and the flash if your phone has one.</p>
              {torchNote ? <p className="text-[11px] leading-snug text-muted-foreground/95">{torchNote}</p> : null}
            </div>
          )}
          {phase === "processing" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Finishing your wellness check…
            </div>
          )}
          {phase === "done" && lastSummary && lastSummary.heartRate > 0 && (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <Heart className="h-5 w-5 text-primary/80" aria-hidden />
                <span className="font-serif-display text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">
                  ~{lastSummary.heartRate}
                </span>
                <span className="text-sm text-muted-foreground">bpm estimate</span>
              </div>
              {lastWaveform && lastWaveform.length > 6 ? (
                <svg
                  viewBox="0 0 100 22"
                  className="mt-1 h-10 w-full text-primary/55"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    points={lastWaveform
                      .map((y, i) => {
                        const x = (i / Math.max(lastWaveform.length - 1, 1)) * 100;
                        const yy = 11 - y * 9;
                        return `${x},${yy}`;
                      })
                      .join(" ")}
                  />
                </svg>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                Signal quality about {Math.round(lastSummary.signalConfidence * 100)}% — for general wellness only.
              </p>
            </div>
          )}
          {phase === "done" && (!lastSummary || lastSummary.heartRate <= 0) && (
            <p className="text-sm text-muted-foreground">
              We could not read a clear pulse rhythm this time. Try a little more pressure, dimmer room light, or a
              slightly longer steady hold.
            </p>
          )}
          {phase === "error" && error ? <p className="text-sm text-rose-600/90 dark:text-rose-400/90">{error}</p> : null}
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        This feature provides general wellness insights and is not medical advice. It does not measure blood pressure
        and is not for diagnosis.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {phase === "idle" || phase === "done" || phase === "error" ? (
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={!memberId || !secure}
            onClick={() => {
              if (phase === "done" || phase === "error") reset();
              void runScan();
            }}
          >
            <Camera className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {phase === "done" ? "Scan again" : "Start pulse scan"}
          </Button>
        ) : null}
        {phase === "scanning" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => {
              stopStream();
              setPhase("idle");
              setProgress(0);
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>

      {!secure ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Camera wellness scan needs a secure (HTTPS) connection.</p>
      ) : null}
      {!memberId ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Choose a profile on the home bar to attach a scan.</p>
      ) : null}
    </div>
  );
}
