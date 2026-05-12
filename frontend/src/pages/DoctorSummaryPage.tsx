import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { toastFromCaughtError, toastError } from "@/lib/toast-errors";
import type { DoctorSummaryDocument } from "@/types/doctor-summary";
import { formatEvidenceLogLabel } from "@/lib/evidence-log-label";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function DoctorSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, members, getLogsForMember } = useApp();
  const [doctorSummary, setDoctorSummary] = useState<DoctorSummaryDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const token = localStorage.getItem("fhm_access_token");
  const member = members.find((m) => m.id === id);
  const memberLogs = id ? getLogsForMember(id) : [];

  useEffect(() => {
    if (!user?.familyId || !id || !token) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/families/${user.familyId}/doctor-summary/${id}?days=30`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load doctor summary");
        const json = (await response.json()) as { doctorSummary?: DoctorSummaryDocument };
        setDoctorSummary(json.doctorSummary || null);
      })
      .catch((err: unknown) => {
        toastFromCaughtError(
          err,
          "Doctor visit summary unavailable",
          "We could not load the generated summary. Check your connection or try again later."
        );
        setDoctorSummary(null);
      })
      .finally(() => setLoading(false));
  }, [user?.familyId, id, token]);

  const handleDownloadPdf = async () => {
    if (!user?.familyId || !id || !token) return;
    setPdfLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/families/${user.familyId}/doctor-summary/${id}/export.pdf?days=30`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        toastError("PDF export failed", "The server could not build the PDF. Try again in a moment.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safe = (member?.name || "member").replace(/\s+/g, "-").slice(0, 48);
      link.href = url;
      link.download = `doctor-summary-${safe}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toastFromCaughtError(err, "Download failed", "Check your network connection and try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="doctor-summary-print-root app-shell app-safe-bottom px-5 py-6 bg-background min-h-screen">
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
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button
            type="button"
            disabled={pdfLoading || !doctorSummary}
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> {pdfLoading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Preparing summary...</p>
      ) : !doctorSummary ? (
        <p className="text-sm text-muted-foreground">Summary unavailable.</p>
      ) : (
        <article className="max-w-3xl mx-auto bg-card border border-border/50 rounded-2xl p-6 md:p-8 print:shadow-none print:border-0 print:rounded-none print:p-0 print:max-w-none">
          <header className="border-b border-border/40 pb-4 print:border-black/20">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground print:text-black/70">
              Family health observations — not a diagnosis
            </p>
            <h1 className="text-2xl font-display font-bold text-foreground mt-1 print:text-black">{doctorSummary.title}</h1>
            <p className="text-xs text-muted-foreground mt-1 print:text-black/80">{doctorSummary.subtitle}</p>
            <p className="text-xs text-muted-foreground mt-2 print:text-black/80">
              {doctorSummary.periodLabel}
              {member ? ` · ${member.name}` : ""} · Generated {new Date(doctorSummary.generatedAt).toLocaleString()}
            </p>
          </header>

          <section className="mt-5 print:break-inside-avoid">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground print:text-black">Disclaimer</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed print:text-black/90">{doctorSummary.observationalDisclaimer}</p>
          </section>

          <section className="mt-5 print:break-inside-avoid">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground print:text-black">Overview</h2>
            <p className="text-sm text-foreground/90 mt-2 leading-relaxed print:text-black">{doctorSummary.observationalSummary}</p>
          </section>

          <section className="mt-6 print:break-inside-avoid">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground print:text-black">Recurring symptoms</h2>
            <p className="text-[11px] text-muted-foreground mt-1 print:text-black/80">
              Tags that appear on more than one log entry in the window (family-recorded).
            </p>
            <ul className="mt-2 space-y-1">
              {doctorSummary.recurringSymptoms.length ? (
                doctorSummary.recurringSymptoms.map((row) => (
                  <li key={row.symptom} className="text-sm text-foreground print:text-black">
                    {row.symptom} — <span className="text-muted-foreground print:text-black/80">{row.count} mentions</span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground print:text-black/80">None noted in this period.</li>
              )}
            </ul>
          </section>

          <section className="mt-6 print:break-inside-avoid">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground print:text-black">Symptom frequency</h2>
            <p className="text-[11px] text-muted-foreground mt-1 print:text-black/80">All tagged symptom mentions in the covered window.</p>
            <ul className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1">
              {doctorSummary.symptomFrequency.slice(0, 24).map((row) => (
                <li key={row.symptom} className="text-sm text-foreground print:text-black flex justify-between gap-2 border-b border-border/30 print:border-black/10 pb-0.5">
                  <span>{row.symptom}</span>
                  <span className="tabular-nums text-muted-foreground print:text-black/80">{row.count}</span>
                </li>
              ))}
            </ul>
            {doctorSummary.symptomFrequency.length === 0 && (
              <p className="text-sm text-muted-foreground mt-1 print:text-black/80">No symptom tags on logs in this window.</p>
            )}
          </section>

          <section className="mt-6 print:break-inside-avoid">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground print:text-black">Compared to prior period</h2>
            <ul className="mt-2 space-y-1">
              {doctorSummary.trendComparison.length ? (
                doctorSummary.trendComparison.map((row) => (
                  <li key={row.symptom} className="text-sm text-foreground print:text-black">
                    {row.symptom}: {row.count} this window vs {row.previousCount} prior —{" "}
                    <span className="font-medium">{row.trend}</span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground print:text-black/80">Insufficient tagged data for comparison.</li>
              )}
            </ul>
          </section>

          <section className="mt-6 print:break-inside-avoid">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground print:text-black">Timeline — notable clusters</h2>
            <ul className="mt-2 space-y-2">
              {doctorSummary.majorChangesTimeline.length ? (
                doctorSummary.majorChangesTimeline.map((row, idx) => (
                  <li key={`${row.date}-${idx}`} className="text-sm text-foreground print:text-black">
                    <span className="font-medium">{row.date}</span> — {row.event}
                    <span className="block text-muted-foreground text-xs mt-0.5 print:text-black/80">{row.details}</span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground print:text-black/80">No major narrative clusters in this window.</li>
              )}
            </ul>
          </section>

          <section className="mt-6 print:break-inside-avoid">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground print:text-black">Medication-related observations</h2>
            <ul className="mt-2 space-y-1">
              {doctorSummary.medicationObservations.map((line) => (
                <li key={line.slice(0, 80)} className="text-sm text-foreground print:text-black leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 print:break-inside-avoid">
            <h2 className="text-xs font-bold uppercase tracking-wide text-destructive print:text-black">Red-flag alerts</h2>
            <p className="text-[11px] text-muted-foreground mt-1 print:text-black/80">
              Automated flags from family notes — review with a clinician; not an emergency assessment.
            </p>
            <ul className="mt-2 space-y-3">
              {doctorSummary.redFlagEvents.length ? (
                doctorSummary.redFlagEvents.map((ev) => (
                  <li key={`${ev.title}-${ev.observedAt}`} className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 print:border-black print:bg-transparent">
                    <p className="text-sm font-semibold text-foreground print:text-black">{ev.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 print:text-black/80">
                      {new Date(ev.observedAt).toLocaleString()} · priority {ev.priority}
                    </p>
                    <p className="text-sm text-foreground/90 mt-1 print:text-black">{ev.description}</p>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground print:text-black/80">No red-flag type alerts in this window.</li>
              )}
            </ul>
          </section>

          <section className="mt-6 print:break-inside-avoid">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground print:text-black">AI-assisted weekly summaries</h2>
            <p className="text-[11px] text-muted-foreground mt-1 print:text-black/80">
              From stored weekly digests in this app (may overlap partial weeks).
            </p>
            <div className="mt-3 space-y-4">
              {doctorSummary.aiWeeklySummaries.length ? (
                doctorSummary.aiWeeklySummaries.map((w) => (
                  <div key={w.weekStart} className="rounded-xl border border-border/50 p-4 print:border-black/20">
                    <p className="text-sm font-semibold text-foreground print:text-black">{w.weekLabel}</p>
                    <p className="text-[11px] text-muted-foreground print:text-black/80 mt-0.5">
                      Digest generated {new Date(w.generatedAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-foreground/90 mt-2 leading-relaxed print:text-black">{w.summary}</p>
                    {w.highlightTitles.length > 0 && (
                      <ul className="mt-2 text-xs text-muted-foreground print:text-black/85 list-disc pl-4 space-y-0.5">
                        {w.highlightTitles.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground print:text-black/80">
                  No weekly digest yet overlaps this date range — digests appear after background jobs run.
                </p>
              )}
            </div>
          </section>

          <footer className="mt-8 pt-4 border-t border-border/40 text-[10px] text-muted-foreground space-y-1 print:border-black/20 print:text-black/80 print:break-inside-avoid">
            <div>
              <p className="font-semibold text-foreground print:text-black">
                Source notes ({doctorSummary.metadata.evidenceLogIds.length})
              </p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[10px] text-muted-foreground print:text-black/80">
                {doctorSummary.metadata.evidenceLogIds.slice(0, 24).map((logId) => (
                  <li key={logId} className="break-words">
                    {formatEvidenceLogLabel(logId, memberLogs, { maxLen: 96 })}
                  </li>
                ))}
              </ul>
              {doctorSummary.metadata.evidenceLogIds.length > 24 ? (
                <p className="mt-0.5 text-[10px] text-muted-foreground print:text-black/70">…and more</p>
              ) : null}
            </div>
            <p>
              Covered range: {new Date(doctorSummary.metadata.coveredDateRange.start).toLocaleDateString()} —{" "}
              {new Date(doctorSummary.metadata.coveredDateRange.end).toLocaleDateString()}
            </p>
            <p>Export generated at {new Date(doctorSummary.metadata.generatedAt).toISOString()}</p>
          </footer>
        </article>
      )}
    </div>
  );
}
