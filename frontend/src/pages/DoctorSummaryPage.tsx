import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

type DoctorVisitSummary = {
  title: string;
  periodLabel: string;
  generatedAt: string;
  recurringSymptoms: Array<{ symptom: string; count: number }>;
  trendAnalysis: Array<{ symptom: string; count: number; previousCount: number; trend: "increasing" | "decreasing" | "stable" }>;
  majorChangesTimeline: Array<{ date: string; event: string; details: string }>;
  medicationObservations: string[];
  summary: string;
};

export default function DoctorSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, members } = useApp();
  const [summary, setSummary] = useState<DoctorVisitSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem("fhm_access_token");
  const member = members.find((m) => m.id === id);

  useEffect(() => {
    if (!user?.familyId || !id || !token) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/families/${user.familyId}/doctor-summary/${id}?days=30`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load doctor summary");
        const json = (await response.json()) as { summary?: DoctorVisitSummary };
        setSummary(json.summary || null);
      })
      .catch(() => {
        toast.error("Could not load doctor summary");
        setSummary(null);
      })
      .finally(() => setLoading(false));
  }, [user?.familyId, id, token]);

  return (
    <div className="app-shell app-safe-bottom px-5 py-6 print:bg-white print:text-black">
      <div className="flex items-center justify-between gap-3 mb-4 print:hidden">
        <button
          type="button"
          onClick={() => navigate(`/member/${id}`)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" /> Save PDF
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Preparing summary...</p>
      ) : !summary ? (
        <p className="text-sm text-muted-foreground">Summary unavailable.</p>
      ) : (
        <article className="max-w-4xl mx-auto bg-card border border-border/50 rounded-2xl p-6 print:border-0 print:rounded-none print:p-0">
          <h1 className="text-2xl font-display font-bold text-foreground">{summary.title}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {summary.periodLabel} · Generated {new Date(summary.generatedAt).toLocaleString()}
            {member ? ` · ${member.name}` : ""}
          </p>

          <section className="mt-4">
            <h2 className="text-sm font-semibold text-foreground">Clinical Summary</h2>
            <p className="text-sm text-muted-foreground mt-1">{summary.summary}</p>
          </section>

          <section className="mt-5">
            <h2 className="text-sm font-semibold text-foreground">Recurring Symptoms</h2>
            <ul className="mt-2 space-y-1">
              {summary.recurringSymptoms.length ? summary.recurringSymptoms.map((row) => (
                <li key={row.symptom} className="text-sm text-foreground">
                  - {row.symptom} ({row.count})
                </li>
              )) : <li className="text-sm text-muted-foreground">- None noted</li>}
            </ul>
          </section>

          <section className="mt-5">
            <h2 className="text-sm font-semibold text-foreground">Trend Analysis</h2>
            <ul className="mt-2 space-y-1">
              {summary.trendAnalysis.length ? summary.trendAnalysis.map((row) => (
                <li key={row.symptom} className="text-sm text-foreground">
                  - {row.symptom}: {row.count} vs {row.previousCount} ({row.trend})
                </li>
              )) : <li className="text-sm text-muted-foreground">- No trend data</li>}
            </ul>
          </section>

          <section className="mt-5">
            <h2 className="text-sm font-semibold text-foreground">Timeline of Major Changes</h2>
            <ul className="mt-2 space-y-1">
              {summary.majorChangesTimeline.length ? summary.majorChangesTimeline.map((row, idx) => (
                <li key={`${row.date}-${idx}`} className="text-sm text-foreground">
                  - {row.date}: {row.event} - {row.details}
                </li>
              )) : <li className="text-sm text-muted-foreground">- No major changes captured</li>}
            </ul>
          </section>

          <section className="mt-5">
            <h2 className="text-sm font-semibold text-foreground">Medication-related Observations</h2>
            <ul className="mt-2 space-y-1">
              {summary.medicationObservations.map((line) => (
                <li key={line} className="text-sm text-foreground">- {line}</li>
              ))}
            </ul>
          </section>
        </article>
      )}
    </div>
  );
}
