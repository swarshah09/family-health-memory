export type DoctorSummaryMetadata = {
  generatedAt: string;
  coveredDateRange: { start: string; end: string };
  evidenceLogIds: string[];
};

export type DoctorSummaryDocument = {
  title: string;
  subtitle: string;
  periodLabel: string;
  generatedAt: string;
  observationalDisclaimer: string;
  observationalSummary: string;
  recurringSymptoms: Array<{ symptom: string; count: number }>;
  symptomFrequency: Array<{ symptom: string; count: number }>;
  trendComparison: Array<{
    symptom: string;
    count: number;
    previousCount: number;
    trend: "increasing" | "decreasing" | "stable";
  }>;
  majorChangesTimeline: Array<{ date: string; event: string; details: string }>;
  medicationObservations: string[];
  redFlagEvents: Array<{
    title: string;
    description: string;
    observedAt: string;
    priority: "low" | "medium" | "high";
    evidenceLogIds: string[];
  }>;
  aiWeeklySummaries: Array<{
    weekLabel: string;
    weekStart: string;
    weekEnd: string;
    generatedAt: string;
    summary: string;
    highlightTitles: string[];
    evidenceLogIds: string[];
  }>;
  metadata: DoctorSummaryMetadata;
};
