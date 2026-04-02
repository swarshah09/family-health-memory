import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, Eye, Heart, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const floatingOrbs = [
  { size: 180, x: "10%", y: "15%", delay: 0, color: "primary" },
  { size: 120, x: "75%", y: "10%", delay: 1.5, color: "accent" },
  { size: 90, x: "85%", y: "70%", delay: 0.8, color: "insight" },
  { size: 140, x: "5%", y: "75%", delay: 2.2, color: "primary" },
];

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
    // Simulate brief loading for feel
    await new Promise((r) => setTimeout(r, 600));
    if (mode === "login") {
      login(email, password);
    } else {
      signup(email, name, password);
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative overflow-hidden">
      {/* Animated background orbs */}
      {floatingOrbs.map((orb, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full opacity-[0.07] bg-${orb.color}`}
          style={{ width: orb.size, height: orb.size, left: orb.x, top: orb.y }}
          animate={{
            y: [0, -20, 0, 20, 0],
            x: [0, 10, 0, -10, 0],
            scale: [1, 1.1, 1, 0.95, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            delay: orb.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      <motion.div
        className="w-full max-w-sm relative z-10"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Logo */}
        <motion.div
          className="flex flex-col items-center mb-10"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, type: "spring", stiffness: 200 }}
        >
          <div className="h-16 w-16 rounded-2xl health-gradient flex items-center justify-center mb-4 shadow-lg">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Activity className="h-8 w-8 text-primary-foreground" />
            </motion.div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">HealthLens</h1>
          <p className="text-muted-foreground text-sm mt-1">Family health patterns, simplified</p>
        </motion.div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
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
                  className="h-12 bg-card border-border mb-3"
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
            className="h-12 bg-card border-border"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-12 bg-card border-border"
          />
          <motion.div whileTap={{ scale: 0.98 }}>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 text-base font-semibold health-gradient border-0 gap-2"
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

        <p className="text-center text-sm text-muted-foreground mt-6">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-primary font-semibold hover:underline"
          >
            {mode === "login" ? "Sign Up" : "Sign In"}
          </button>
        </p>

        {/* Features */}
        <div className="mt-10 space-y-3">
          {[
            { icon: Eye, text: "Track health observations", delay: 0.4 },
            { icon: Heart, text: "Detect symptom patterns", delay: 0.5 },
            { icon: Activity, text: "AI-powered weekly insights", delay: 0.6 },
          ].map(({ icon: Icon, text, delay }) => (
            <motion.div
              key={text}
              className="flex items-center gap-3 text-muted-foreground text-sm"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay, duration: 0.4 }}
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <span>{text}</span>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8 opacity-60">
          ⚕️ This is not a medical tool. Always consult healthcare professionals.
        </p>
      </motion.div>
    </div>
  );
}
