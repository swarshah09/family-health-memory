import { useState, createContext, useContext, ReactNode } from "react";

export interface FamilyMember {
  id: string;
  name: string;
  age: number;
  relationship: string;
  notes?: string;
  avatar?: string;
}

export interface HealthLog {
  id: string;
  memberId: string;
  text: string;
  timestamp: Date;
  type: "text" | "voice";
  audioUrl?: string;
}

export interface Insight {
  id: string;
  memberId: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "alert";
  keyword: string;
  count: number;
  date: Date;
}

interface AppState {
  isAuthenticated: boolean;
  user: { email: string; name: string } | null;
  members: FamilyMember[];
  logs: HealthLog[];
  login: (email: string, password: string) => void;
  signup: (email: string, name: string, password: string) => void;
  logout: () => void;
  addMember: (member: Omit<FamilyMember, "id">) => void;
  removeMember: (id: string) => void;
  addLog: (log: Omit<HealthLog, "id" | "timestamp">) => void;
  getLogsForMember: (memberId: string) => HealthLog[];
  getInsightsForMember: (memberId: string) => Insight[];
  getAllInsights: () => Insight[];
}

const AppContext = createContext<AppState | null>(null);

const SYMPTOM_KEYWORDS = [
  "pain", "headache", "tired", "fatigue", "sleep", "insomnia",
  "dizzy", "nausea", "chest", "tightness", "breathing", "cough",
  "fever", "swelling", "weakness", "appetite", "weight", "pressure",
  "anxiety", "stress", "joint", "back", "stomach", "heart",
];

function generateInsights(logs: HealthLog[], memberId: string): Insight[] {
  const memberLogs = logs.filter((l) => l.memberId === memberId);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recentLogs = memberLogs.filter((l) => new Date(l.timestamp) >= weekAgo);

  const keywordCounts: Record<string, number> = {};
  recentLogs.forEach((log) => {
    const lower = log.text.toLowerCase();
    SYMPTOM_KEYWORDS.forEach((kw) => {
      if (lower.includes(kw)) {
        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
      }
    });
  });

  return Object.entries(keywordCounts)
    .filter(([, count]) => count >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([keyword, count]) => ({
      id: `insight-${memberId}-${keyword}`,
      memberId,
      keyword,
      count,
      title: count >= 3
        ? `"${keyword}" mentioned ${count} times this week`
        : `"${keyword}" noted recently`,
      description: count >= 3
        ? `This symptom has been reported frequently. Consider discussing with a healthcare provider.`
        : `Logged ${count} time${count > 1 ? "s" : ""} in the past week.`,
      severity: (count >= 3 ? "alert" : count >= 2 ? "warning" : "info") as Insight["severity"],
      date: new Date(),
    }));
}

const DEMO_MEMBERS: FamilyMember[] = [
  { id: "m1", name: "Dad", age: 68, relationship: "Father", notes: "Hypertension, takes BP medication daily" },
  { id: "m2", name: "Mom", age: 64, relationship: "Mother", notes: "Mild diabetes, regular check-ups" },
];

const DEMO_LOGS: HealthLog[] = [
  { id: "l1", memberId: "m1", text: "Dad mentioned chest tightness again today after walking upstairs. Said it went away after resting.", timestamp: new Date(Date.now() - 86400000 * 0.5), type: "text" },
  { id: "l2", memberId: "m1", text: "Complained about back pain in the morning. Took a painkiller.", timestamp: new Date(Date.now() - 86400000 * 1), type: "text" },
  { id: "l3", memberId: "m1", text: "Sleep was poor last night. Woke up 3 times. Mentioned chest discomfort again.", timestamp: new Date(Date.now() - 86400000 * 2), type: "text" },
  { id: "l4", memberId: "m2", text: "Mom said she felt dizzy after lunch. Checked blood sugar — was a bit high.", timestamp: new Date(Date.now() - 86400000 * 0.3), type: "text" },
  { id: "l5", memberId: "m2", text: "Appetite has been low for the past two days. Feeling tired.", timestamp: new Date(Date.now() - 86400000 * 1.5), type: "text" },
  { id: "l6", memberId: "m2", text: "Sleep was okay but complained about joint pain in knees.", timestamp: new Date(Date.now() - 86400000 * 3), type: "text" },
  { id: "l7", memberId: "m1", text: "Had a good day today. Went for a short walk, no chest pain.", timestamp: new Date(Date.now() - 86400000 * 4), type: "text" },
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>(DEMO_MEMBERS);
  const [logs, setLogs] = useState<HealthLog[]>(DEMO_LOGS);

  const login = (email: string, _password: string) => {
    setUser({ email, name: email.split("@")[0] });
    setIsAuthenticated(true);
  };

  const signup = (email: string, name: string, _password: string) => {
    setUser({ email, name });
    setIsAuthenticated(true);
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
  };

  const addMember = (member: Omit<FamilyMember, "id">) => {
    setMembers((prev) => [...prev, { ...member, id: `m${Date.now()}` }]);
  };

  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const addLog = (log: Omit<HealthLog, "id" | "timestamp">) => {
    setLogs((prev) => [
      { ...log, id: `l${Date.now()}`, timestamp: new Date() },
      ...prev,
    ]);
  };

  const getLogsForMember = (memberId: string) =>
    logs
      .filter((l) => l.memberId === memberId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const getInsightsForMember = (memberId: string) => generateInsights(logs, memberId);

  const getAllInsights = () => members.flatMap((m) => generateInsights(logs, m.id));

  return (
    <AppContext.Provider
      value={{
        isAuthenticated, user, members, logs,
        login, signup, logout, addMember, removeMember,
        addLog, getLogsForMember, getInsightsForMember, getAllInsights,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
