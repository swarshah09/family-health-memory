export type DoctorSummaryDateRange = {
  start: string;
  end: string;
};

export type DoctorSummaryMetadata = {
  generatedAt: string;
  coveredDateRange: DoctorSummaryDateRange;
  evidenceLogIds: string[];
};

export type DoctorSummarySymptomRow = { symptom: string; count: number };

export type DoctorSummaryTrendRow = {
  symptom: string;
  count: number;
  previousCount: number;
  trend: "increasing" | "decreasing" | "stable";
};

export type DoctorSummaryTimelineRow = {
  date: string;
  event: string;
  details: string;
};

export type DoctorSummaryRedFlagEvent = {
  title: string;
  description: string;
  observedAt: string;
  priority: "low" | "medium" | "high";
  evidenceLogIds: string[];
};

export type DoctorSummaryWeeklyBlock = {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  summary: string;
  highlightTitles: string[];
  evidenceLogIds: string[];
};

export type DoctorSummaryDocument = {
  title: string;
  subtitle: string;
  periodLabel: string;
  generatedAt: string;
  observationalDisclaimer: string;
  observationalSummary: string;
  recurringSymptoms: DoctorSummarySymptomRow[];
  symptomFrequency: DoctorSummarySymptomRow[];
  trendComparison: DoctorSummaryTrendRow[];
  majorChangesTimeline: DoctorSummaryTimelineRow[];
  medicationObservations: string[];
  redFlagEvents: DoctorSummaryRedFlagEvent[];
  aiWeeklySummaries: DoctorSummaryWeeklyBlock[];
  metadata: DoctorSummaryMetadata;
};
