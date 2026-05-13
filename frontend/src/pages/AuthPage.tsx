import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, ArrowRight, Sparkles, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AppRequestError, toastError, toastFromCaughtError } from "@/lib/toast-errors";
import { toast } from "sonner";
import { ThemeAppearanceControl } from "@/components/ThemeAppearanceControl";

export default function AuthPage() {
  const { login, signup, requestFamilyMembership } = useApp();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [signupFlow, setSignupFlow] = useState<"create" | "join">("create");
  const [familyName, setFamilyName] = useState("");
  const [joinFamilyId, setJoinFamilyId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8 sm:px-6 md:px-8 lg:min-h-screen lg:py-12 bg-background mesh-bg relative overflow-hidden">
      <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 hidden sm:block">
        <ThemeAppearanceControl />
      </div>
      {/* Decorative organic circles */}
      {[
        { size: 300, x: "-10%", y: "-8%", delay: 0 },
        { size: 180, x: "80%", y: "7%", delay: 1.2 },
        { size: 130, x: "85%", y: "65%", delay: 0.8 },
        { size: 220, x: "-12%", y: "72%", delay: 1.8 },
      ].map((orb, i) => (
        <motion.div
          key={i}
          className="organic-orb"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
          }}
          animate={{
            y: [0, -30, 0, 30, 0],
            x: [0, 15, 0, -15, 0],
            scale: [1, 1.15, 1, 0.9, 1],
          }}
          transition={{ duration: 12, repeat: Infinity, delay: orb.delay, ease: "easeInOut" }}
        />
      ))}

      <motion.div
        className="w-full max-w-sm md:max-w-md lg:max-w-lg relative z-10 xl:max-w-xl"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo & branding */}
        <motion.div
          className="flex flex-col items-center mb-10"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15, type: "spring", stiffness: 180 }}
        >
          <div className="relative mb-5">
            <motion.div
              className="h-20 w-20 rounded-3xl bg-primary flex items-center justify-center shadow-soft-lg"
              animate={{ rotate: [0, 2, -2, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Heart className="h-9 w-9 text-primary-foreground" fill="currentColor" />
            </motion.div>
            <motion.div
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-xl bg-accent flex items-center justify-center shadow-md"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 300 }}
            >
              <Sparkles className="h-3.5 w-3.5 text-accent-foreground" />
            </motion.div>
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">Family Health Memory</h1>
          <p className="text-muted-foreground text-sm mt-1.5 font-medium tracking-[0.16em] uppercase">
            Private family workspace — invite only, not a social network
          </p>
        </motion.div>

        {/* Form card */}
        <motion.div
          className="bg-card rounded-[1.75rem] p-6 shadow-soft-lg ring-1 ring-border/40 md:p-8 lg:rounded-[2rem] lg:p-10"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
        >
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="signup-extra"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-3 mb-1"
                >
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-2">
                    <p className="text-[11px] font-medium text-foreground">How do you want to get started?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSignupFlow("create")}
                        className={`flex-1 text-[11px] rounded-lg py-2 px-2 border transition-colors ${
                          signupFlow === "create"
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border/60 text-muted-foreground"
                        }`}
                      >
                        Create new family
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignupFlow("join")}
                        className={`flex-1 text-[11px] rounded-lg py-2 px-2 border transition-colors ${
                          signupFlow === "join"
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border/60 text-muted-foreground"
                        }`}
                      >
                        Join existing family
                      </button>
                    </div>
                  </div>
                  {signupFlow === "create" ? (
                    <Input
                      placeholder="Family workspace name (e.g. The Shah family)"
                      value={familyName}
                      onChange={(e) => setFamilyName(e.target.value)}
                      autoComplete="organization"
                      className="h-12 bg-background/60 border-border/60 rounded-xl focus:border-primary/40 focus:ring-primary/20"
                    />
                  ) : (
                    <Input
                      placeholder="Family invite code (from your organizer)"
                      value={joinFamilyId}
                      onChange={(e) => setJoinFamilyId(e.target.value)}
                      required={signupFlow === "join"}
                      autoComplete="off"
                      className="h-12 bg-background/60 border-border/60 rounded-xl focus:border-primary/40 focus:ring-primary/20"
                    />
                  )}
                  <Input
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    className="h-12 bg-background/60 border-border/60 rounded-xl focus:border-primary/40 focus:ring-primary/20"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete={mode === "login" ? "username" : "email"}
              className="h-12 bg-background/60 border-border/60 rounded-xl focus:border-primary/40 focus:ring-primary/20"
            />
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 pr-11 bg-background/60 border-border/60 rounded-xl focus:border-primary/40 focus:ring-primary/20"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 text-base font-semibold bg-accent hover:bg-accent/90 border-0 rounded-xl gap-2 shadow-glow"
              >
                {isLoading ? (
                  <motion.div
                    className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  />
                ) : (
                  <>
                    {mode === "login"
                      ? "Sign in securely"
                      : signupFlow === "join"
                        ? "Send join request"
                        : "Create private workspace"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </motion.div>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-5">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="text-primary font-semibold hover:underline"
            >
              {mode === "login" ? "Sign Up" : "Sign In"}
            </button>
          </p>
        </motion.div>

        {/* Feature pills */}
        <div className="mt-8 grid grid-cols-3 gap-2.5">
          {["Track", "Detect", "Secure"].map((item, i) => (
            <motion.div
              key={item}
              className="rounded-xl border border-border/60 bg-card/80 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-primary"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 + i * 0.12, duration: 0.35 }}
            >
              {item}
            </motion.div>
          ))}
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-8">
          Observation support only - not medical diagnosis
        </p>
      </motion.div>
    </div>
  );
}
