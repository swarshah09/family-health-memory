import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  disconnectWhatsApp,
  fetchWhatsAppConnectionStatus,
  initiateWhatsAppConnect,
  verifyWhatsAppConnect,
  type WhatsAppConnectionStatus
} from "@/lib/whatsapp-connection-api";
import { AppRequestError, toastError, toastFromCaughtError } from "@/lib/toast-errors";
import { toast } from "sonner";

type Step = "loading" | "idle" | "verify" | "connected";

export default function WhatsAppConnectCard() {
  const [step, setStep] = useState<Step>("loading");
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const next = await fetchWhatsAppConnectionStatus();
      setStatus(next);
      if (next.connected) setStep("connected");
      else if (next.pendingVerification) setStep("verify");
      else setStep("idle");
    } catch (err) {
      toastFromCaughtError(err, "Could not load WhatsApp status", "Try refreshing the page.");
      setStep("idle");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onSendCode = async () => {
    const trimmed = phone.trim();
    if (trimmed.length < 8) {
      toastError("Phone number needed", "Include your country code, e.g. +1 555 123 4567.");
      return;
    }
    setBusy(true);
    try {
      const res = await initiateWhatsAppConnect(trimmed);
      setStatus(res.status);
      setHint(res.message);
      setDevCode(res.devCode ?? null);
      setStep("verify");
      if (res.devCode) {
        toast.message("Use this code to connect", {
          description: `${res.devCode} — WhatsApp may not deliver in development mode.`
        });
      } else {
        toast.success("Check WhatsApp", { description: res.message });
      }
    } catch (err) {
      if (err instanceof AppRequestError) toastError(err.toastTitle, err.toastDescription);
      else toastFromCaughtError(err, "Could not start linking", "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    const trimmed = code.replace(/\D/g, "");
    if (trimmed.length !== 6) {
      toastError("Enter your code", "Use the 6-digit code we sent to WhatsApp.");
      return;
    }
    setBusy(true);
    try {
      const res = await verifyWhatsAppConnect(trimmed);
      setStatus(res.status);
      setCode("");
      setStep("connected");
      toast.success("WhatsApp connected", {
        description: "Your number is linked. Health updates from WhatsApp will appear here when that feature is ready."
      });
    } catch (err) {
      if (err instanceof AppRequestError) toastError(err.toastTitle, err.toastDescription);
      else toastFromCaughtError(err, "Verification failed", "Check the code and try again.");
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectWhatsApp();
      setStatus({ connected: false, pendingVerification: false });
      setPhone("");
      setCode("");
      setHint("");
      setStep("idle");
      toast.success("WhatsApp disconnected");
    } catch (err) {
      if (err instanceof AppRequestError) toastError(err.toastTitle, err.toastDescription);
      else toastFromCaughtError(err, "Could not disconnect", "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Connect WhatsApp</p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            Link the number you use on WhatsApp so your family can send health notes there later — the same calm
            memory you keep in FamPulse.
          </p>
        </div>
      </div>

      {step === "loading" ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : null}

      {step === "connected" && status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
            <span>
              Connected{" "}
              {status.whatsappPhoneNumber ? (
                <span className="font-medium tabular-nums">{status.whatsappPhoneNumber}</span>
              ) : null}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl border-border/60"
            disabled={busy}
            onClick={() => void onDisconnect()}
          >
            <Unlink className="mr-2 h-4 w-4" aria-hidden />
            Disconnect
          </Button>
        </div>
      ) : null}

      {step === "idle" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="wa-phone" className="text-xs font-medium text-muted-foreground">
              Mobile number (with country code)
            </label>
            <Input
              id="wa-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1 555 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 rounded-xl"
              disabled={busy}
            />
          </div>
          <Button
            type="button"
            className="h-10 w-full rounded-xl bg-primary hover:bg-primary/90"
            disabled={busy}
            onClick={() => void onSendCode()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send verification code
          </Button>
        </div>
      ) : null}

      {step === "verify" ? (
        <div className="space-y-3">
          {status?.phonePending ? (
            <p className="text-xs text-muted-foreground">
              Code sent to <span className="font-medium text-foreground tabular-nums">{status.phonePending}</span>
            </p>
          ) : null}
          {hint ? <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p> : null}
          {devCode ? (
            <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-amber-900/80 dark:text-amber-100/80">
                Your verification code
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em] text-foreground tabular-nums">
                {devCode}
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                WhatsApp often does not deliver this in development. Enter it above to finish linking.
              </p>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label htmlFor="wa-code" className="text-xs font-medium text-muted-foreground">
              6-digit code
            </label>
            <Input
              id="wa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-11 rounded-xl tracking-[0.35em] text-center font-semibold tabular-nums"
              disabled={busy}
            />
          </div>
          <Button
            type="button"
            className="h-10 w-full rounded-xl bg-primary hover:bg-primary/90"
            disabled={busy}
            onClick={() => void onVerify()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm connection
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full rounded-xl text-muted-foreground"
            disabled={busy}
            onClick={() => {
              setStep("idle");
              setCode("");
              setDevCode(null);
            }}
          >
            Use a different number
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full rounded-xl border-border/60"
            disabled={busy}
            onClick={() => void onSendCode()}
          >
            Resend code
          </Button>
        </div>
      ) : null}
    </div>
  );
}
