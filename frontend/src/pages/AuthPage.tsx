import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Building2, Eye, EyeOff, Hash, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AppRequestError, toastError, toastFromCaughtError } from "@/lib/toast-errors";
import { toast } from "sonner";
import { ThemeAppearanceControl } from "@/components/ThemeAppearanceControl";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

const AUTH_HERO_IMAGE =
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=85";

function AuthField({
  label,
  icon: Icon,
  children
}: {
  label: string;
  icon: typeof Mail;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3.5 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-muted-foreground/80"
          aria-hidden
        />
        {children}
      </div>
    </div>
  );
}

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const signupFromUrl = searchParams.get("signup") === "1";
  const { login, signup, requestFamilyMembership } = useApp();
  const [mode, setMode] = useState<"login" | "signup">(signupFromUrl ? "signup" : "login");
  const [signupFlow, setSignupFlow] = useState<"create" | "join">("create");
  const [familyName, setFamilyName] = useState("");
  const [joinFamilyId, setJoinFamilyId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (signupFromUrl) setMode("signup");
  }, [signupFromUrl]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      if (mode === "login") await login(email, password);
      else if (signupFlow === "join") {
        if (!joinFamilyId.trim()) {
          toastError("Family code needed", "Ask your organizer for the invite code they use when someone joins.");
          return;
        }
        const { message } = await requestFamilyMembership({
          email,
          name,
          password,
          targetFamilyId: joinFamilyId.trim()
        });
        toast.success("Request sent", {
          description: `${message}\n\nThe organizer will see a badge on Family and a banner on their dashboard.`
        });
        setMode("login");
      } else await signup(email, name, password, { familyName: familyName.trim() || undefined });
    } catch (err) {
      if (err instanceof AppRequestError) {
        toastError(err.toastTitle, err.toastDescription);
      } else {
        toastFromCaughtError(
          err,
          "We could not complete your request",
          "Check your network connection. If you are running the app locally, confirm the API server is started."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    "h-12 rounded-xl border-border/70 bg-card pl-10 pr-3 text-[15px] shadow-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/55 focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/15";

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:flex-row">
      {/* Left — brand panel */}
      <aside className="relative flex min-h-[42vh] w-full flex-col overflow-hidden lg:min-h-dvh lg:w-1/2 lg:shrink-0">
        <img
          src={AUTH_HERO_IMAGE}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_35%]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-[hsl(120_25%_8%/0.92)] via-[hsl(120_18%_12%/0.55)] to-[hsl(120_15%_18%/0.35)]"
          aria-hidden
        />
        <div className="relative z-10 flex h-full min-h-[42vh] flex-col justify-between p-6 sm:p-8 lg:min-h-dvh lg:p-10">
          <Link to="/" className="flex w-fit items-center gap-2.5 text-white/95 transition hover:text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-sm font-semibold backdrop-blur-sm">
              f
            </span>
            <span className="font-serif-display text-lg font-semibold tracking-tight lowercase sm:text-xl">
              family memory
            </span>
          </Link>
          <div className="max-w-md space-y-4 pb-2 lg:pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/70">A quiet promise</p>
            <p className="font-serif-display text-2xl font-medium leading-snug text-white sm:text-[1.65rem] sm:leading-tight lg:text-[1.85rem]">
              The smallest things we notice about each other become the truest story of our care.
            </p>
            <p className="flex items-center gap-2 text-xs text-white/75">
              <ShieldCheck className="h-4 w-4 shrink-0 text-white/90" aria-hidden />
              <span>End-to-end private · invite-only workspace</span>
            </p>
          </div>
        </div>
      </aside>

      {/* Right — form */}
      <main className="relative flex w-full flex-1 flex-col justify-center px-5 py-10 sm:px-8 sm:py-12 lg:min-h-dvh lg:w-1/2 lg:min-w-0 lg:px-12 xl:px-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background to-transparent lg:hidden" aria-hidden />
        <div className="absolute right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-10 sm:right-6 lg:right-8 lg:top-8">
          <ThemeAppearanceControl />
        </div>
        <Link
          to="/"
          className="mb-6 text-sm font-medium text-muted-foreground transition hover:text-foreground lg:absolute lg:left-8 lg:top-8 lg:mb-0 xl:left-10"
        >
          ← Home
        </Link>

        <motion.div
          className="mx-auto w-full max-w-md"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {mode === "login" ? (
            <>
              <div className="border-t border-border/80 pt-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Welcome back</p>
                <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                  Step quietly back in.
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Your family&apos;s memory is exactly where you left it.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="border-t border-border/80 pt-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Start a family workspace
                </p>
                <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                  Let&apos;s open the room.
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Set up takes 90 seconds. You can invite family right after.
                </p>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="signup-extra"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-5 overflow-hidden"
                >
                  <div className="rounded-2xl border border-border/70 bg-muted/25 p-4 sm:p-5">
                    <p className="text-sm font-medium text-foreground">How do you want to get started?</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setSignupFlow("create")}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors",
                          signupFlow === "create"
                            ? "border-primary bg-primary/10 text-primary shadow-sm"
                            : "border-border/70 bg-card text-muted-foreground hover:border-border hover:bg-muted/40"
                        )}
                      >
                        Create new family
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignupFlow("join")}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors",
                          signupFlow === "join"
                            ? "border-primary bg-primary/10 text-primary shadow-sm"
                            : "border-border/70 bg-card text-muted-foreground hover:border-border hover:bg-muted/40"
                        )}
                      >
                        Join existing family
                      </button>
                    </div>
                  </div>
                  {signupFlow === "create" ? (
                    <AuthField label="Family workspace name" icon={Building2}>
                      <Input
                        placeholder="Family workspace name (e.g. The Shah family)"
                        value={familyName}
                        onChange={(e) => setFamilyName(e.target.value)}
                        autoComplete="organization"
                        className={inputClass}
                      />
                    </AuthField>
                  ) : (
                    <AuthField label="Family invite code" icon={Hash}>
                      <Input
                        placeholder="From your organizer"
                        value={joinFamilyId}
                        onChange={(e) => setJoinFamilyId(e.target.value)}
                        required={signupFlow === "join"}
                        autoComplete="off"
                        className={inputClass}
                      />
                    </AuthField>
                  )}
                  <AuthField label="Your name" icon={User}>
                    <Input
                      placeholder="e.g. Meera Sharma"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      className={inputClass}
                    />
                  </AuthField>
                </motion.div>
              )}
            </AnimatePresence>

            {mode === "login" && (
              <AuthField label="Email" icon={Mail}>
                <Input
                  type="email"
                  placeholder="meera@sharma.family"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className={inputClass}
                />
              </AuthField>
            )}

            {mode === "signup" && (
              <AuthField label="Email" icon={Mail}>
                <Input
                  type="email"
                  placeholder="meera@sharma.family"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </AuthField>
            )}

            <div className="space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-muted-foreground/80"
                  aria-hidden
                />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className={cn(inputClass, "pr-11")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <motion.div whileTap={{ scale: 0.99 }} className="pt-1">
              <Button
                type="submit"
                disabled={isLoading}
                className="btn-chronicle-primary h-12 w-full gap-2 rounded-full text-base font-semibold"
              >
                {isLoading ? (
                  <motion.span
                    className="inline-block h-5 w-5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  />
                ) : (
                  <>
                    {mode === "login"
                      ? "Continue"
                      : signupFlow === "join"
                        ? "Send join request"
                        : "Create our workspace"}
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                  </>
                )}
              </Button>
            </motion.div>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                New to Family Health Memory?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="font-semibold text-foreground underline decoration-primary/40 underline-offset-4 transition hover:decoration-primary"
                >
                  Open a workspace
                </button>
              </>
            ) : (
              <>
                Already have a workspace?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="font-semibold text-foreground underline decoration-primary/40 underline-offset-4 transition hover:decoration-primary"
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          <div className="mt-10 border-t border-border/60 pt-6">
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              By continuing you agree to our gentle terms. Observation support only — not a medical service.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
