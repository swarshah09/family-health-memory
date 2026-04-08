import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Eye, Activity, ArrowRight, Shield, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AuthPage() {
  const { login, signup } = useApp();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    if (mode === "login") login(email, password);
    else signup(email, name, password);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative overflow-hidden mesh-bg">
      {/* Animated floating shapes */}
      {[
        { size: 300, x: "-5%", y: "-10%", color: "primary", delay: 0 },
        { size: 200, x: "80%", y: "5%", color: "accent", delay: 1.5 },
        { size: 150, x: "90%", y: "65%", color: "insight", delay: 0.8 },
        { size: 250, x: "-10%", y: "70%", color: "accent", delay: 2 },
      ].map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            background: `radial-gradient(circle, hsl(var(--${orb.color}) / 0.08), transparent 70%)`,
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
        className="w-full max-w-sm relative z-10"
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
              className="h-20 w-20 rounded-3xl health-gradient flex items-center justify-center shadow-glow-lg"
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
          <h1 className="text-3xl font-display font-bold health-gradient-text">HealthLens</h1>
          <p className="text-muted-foreground text-sm mt-1.5 font-medium">Your family's health companion</p>
        </motion.div>

        {/* Form card */}
        <motion.div
          className="glass-card rounded-2xl p-6 shadow-soft-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
        >
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="name"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <Input
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-12 bg-background/60 border-border/60 rounded-xl mb-3.5 focus:border-primary/40 focus:ring-primary/20"
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
              className="h-12 bg-background/60 border-border/60 rounded-xl focus:border-primary/40 focus:ring-primary/20"
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 bg-background/60 border-border/60 rounded-xl focus:border-primary/40 focus:ring-primary/20"
            />
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 text-base font-semibold health-gradient border-0 rounded-xl gap-2 shadow-glow"
              >
                {isLoading ? (
                  <motion.div
                    className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  />
                ) : (
                  <>
                    {mode === "login" ? "Sign In" : "Create Account"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </motion.div>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-5">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="text-primary font-semibold hover:underline"
            >
              {mode === "login" ? "Sign Up" : "Sign In"}
            </button>
          </p>
        </motion.div>

        {/* Feature highlights */}
        <div className="mt-8 space-y-3">
          {[
            { icon: Eye, text: "Track daily health observations", color: "primary" },
            { icon: Activity, text: "AI-powered pattern detection", color: "accent" },
            { icon: Shield, text: "Private & secure family data", color: "insight" },
          ].map(({ icon: Icon, text, color }, i) => (
            <motion.div
              key={text}
              className="flex items-center gap-3.5 text-sm"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.12, duration: 0.4 }}
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `hsl(var(--${color}) / 0.1)` }}
              >
                <Icon className={`h-4.5 w-4.5 text-${color}`} style={{ color: `hsl(var(--${color}))` }} />
              </div>
              <span className="text-muted-foreground font-medium">{text}</span>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-8 opacity-50">
          ⚕️ This is not a medical tool. Always consult healthcare professionals.
        </p>
      </motion.div>
    </div>
  );
}
