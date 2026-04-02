import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, Eye, Heart } from "lucide-react";

export default function AuthPage() {
  const { login, signup } = useApp();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      login(email, password);
    } else {
      signup(email, name, password);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="h-16 w-16 rounded-2xl health-gradient flex items-center justify-center mb-4 shadow-lg">
            <Activity className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">HealthLens</h1>
          <p className="text-muted-foreground text-sm mt-1">Family health patterns, simplified</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <Input
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-12 bg-card border-border"
            />
          )}
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
          <Button type="submit" className="w-full h-12 text-base font-semibold health-gradient border-0">
            {mode === "login" ? "Sign In" : "Create Account"}
          </Button>
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
            { icon: Eye, text: "Track health observations" },
            { icon: Heart, text: "Detect symptom patterns" },
            { icon: Activity, text: "AI-powered weekly insights" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-muted-foreground text-sm">
              <Icon className="h-4 w-4 text-primary" />
              <span>{text}</span>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8 opacity-60">
          ⚕️ This is not a medical tool. Always consult healthcare professionals.
        </p>
      </div>
    </div>
  );
}
