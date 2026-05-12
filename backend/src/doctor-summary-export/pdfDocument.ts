import PDFDocument from "pdfkit";
import type { DoctorSummaryDocument } from "./types.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

function bulletList(doc: PdfDoc, items: string[], size = 9) {
  doc.font("Helvetica").fontSize(size);
  for (const line of items) {
    doc.text(`• ${line}`, { indent: 8 });
  }
}

function sectionHeading(doc: PdfDoc, title: string) {
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(10).text(title);
  doc.moveDown(0.25);
}

export function renderDoctorSummaryPdf(data: DoctorSummaryDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 50
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(15).text(data.title, { align: "center" });
    doc.moveDown(0.2);
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#333").text(data.subtitle, { align: "center" });
    doc.fillColor("#000");
    doc.font("Helvetica").fontSize(8.5).text(`${data.periodLabel} · Generated ${new Date(data.generatedAt).toLocaleString()}`, {
      align: "center"
    });
    doc.moveDown(0.8);

    doc.font("Helvetica-Bold").fontSize(9).text("Important");
    doc.font("Helvetica").fontSize(8.5).text(data.observationalDisclaimer, { align: "justify" });
    doc.moveDown(0.5);

    sectionHeading(doc, "Overview (observational)");
    doc.font("Helvetica").fontSize(9).text(data.observationalSummary, { align: "justify" });

    sectionHeading(doc, "Recurring symptoms (tagged in logs)");
    if (data.recurringSymptoms.length) {
      bulletList(
        doc,
        data.recurringSymptoms.map((r) => `${r.symptom} — ${r.count} mentions in window`)
      );
    } else {
      doc.font("Helvetica").fontSize(9).text("No recurring symptom tags in this period.");
    }

    sectionHeading(doc, "Symptom mention frequency (all tags)");
    const freqLines = data.symptomFrequency.slice(0, 20).map((r) => `${r.symptom}: ${r.count}`);
    if (freqLines.length) bulletList(doc, freqLines);
    else doc.font("Helvetica").fontSize(9).text("No symptom tags on logs in this window.");

    sectionHeading(doc, "Compared to prior period (same length)");
    if (data.trendComparison.length) {
      bulletList(
        doc,
        data.trendComparison.map(
          (t) => `${t.symptom}: ${t.count} this window vs ${t.previousCount} prior (${t.trend})`
        )
      );
    } else doc.font("Helvetica").fontSize(9).text("Insufficient tagged data for trend comparison.");

    sectionHeading(doc, "Timeline — notable narrative clusters");
    if (data.majorChangesTimeline.length) {
      bulletList(
        doc,
        data.majorChangesTimeline.map((e) => `${e.date}: ${e.event} — ${e.details}`)
      );
    } else doc.font("Helvetica").fontSize(9).text("No narrative clusters in this window.");

    sectionHeading(doc, "Medication-related observations (family notes)");
    bulletList(doc, data.medicationObservations);

    sectionHeading(doc, "Red-flag pattern alerts (review with clinician)");
    if (data.redFlagEvents.length) {
      for (const ev of data.redFlagEvents) {
        doc.font("Helvetica-Bold").fontSize(9).text(ev.title);
        doc.font("Helvetica").fontSize(8.5).text(`${new Date(ev.observedAt).toLocaleString()} · priority ${ev.priority}`);
        doc.text(ev.description, { align: "justify" });
        doc.moveDown(0.35);
      }
    } else {
      doc.font("Helvetica").fontSize(9).text("No red-flag type alerts recorded for this window.");
    }

    sectionHeading(doc, "AI-assisted weekly summaries (family app)");
    if (data.aiWeeklySummaries.length) {
      for (const w of data.aiWeeklySummaries) {
        doc.font("Helvetica-Bold").fontSize(9).text(w.weekLabel);
        doc.font("Helvetica-Oblique").fontSize(8).text(`Digest generated ${new Date(w.generatedAt).toLocaleString()}`);
        doc.font("Helvetica").fontSize(8.5).text(w.summary, { align: "justify" });
        if (w.highlightTitles.length) {
          doc.moveDown(0.15);
          doc.font("Helvetica-Bold").fontSize(8).text("Highlights:");
          bulletList(doc, w.highlightTitles, 8);
        }
        doc.moveDown(0.4);
      }
    } else {
      doc.font("Helvetica").fontSize(9).text("No stored weekly digest overlaps this date range yet.");
    }

    sectionHeading(doc, "Metadata");
    doc.font("Helvetica").fontSize(8.5);
    doc.text(`Covered range: ${new Date(data.metadata.coveredDateRange.start).toLocaleString()} — ${new Date(data.metadata.coveredDateRange.end).toLocaleString()}`);
    doc.text(`Evidence log IDs (${data.metadata.evidenceLogIds.length}):`);
    const idSample = data.metadata.evidenceLogIds.slice(0, 40).join(", ");
    doc.text(idSample + (data.metadata.evidenceLogIds.length > 40 ? " …" : ""), { align: "left" });

    doc.end();
  });
}
