import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, ArrowRight, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

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
    try {
      await new Promise((r) => setTimeout(r, 400));
      if (mode === "login") await login(email, password);
      else await signup(email, name, password);
    } catch {
      toast.error("Unable to connect to backend. Please start the API server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6 bg-[#0d3a34] relative overflow-hidden">
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
              className="h-20 w-20 rounded-3xl bg-[#37c4aa] flex items-center justify-center shadow-glow-lg"
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
          <h1 className="text-3xl font-display font-bold text-white">Family Health Memory</h1>
          <p className="text-white/65 text-sm mt-1.5 font-medium tracking-[0.22em] uppercase">Catch quiet patterns</p>
        </motion.div>

        {/* Form card */}
        <motion.div
          className="bg-card rounded-[1.75rem] p-6 shadow-2xl"
          initial={{ opacity: 0, y: 36 }}
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
              className="rounded-xl bg-white/90 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[#146459]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 + i * 0.12, duration: 0.35 }}
            >
              {item}
            </motion.div>
          ))}
        </div>

        <p className="text-center text-[11px] text-white/55 mt-8">
          This is not a medical tool
        </p>
      </motion.div>
    </div>
  );
}
