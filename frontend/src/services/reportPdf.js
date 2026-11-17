
import { jsPDF } from "jspdf";

// Strictly approved execution-metadata fields.
function identifier(value) {
  const text = String(value ?? "");
  return /^[A-Za-z0-9_.-]{1,100}$/.test(text)
    ? text
    : "Not available";
}

function number(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const result = Number(value);
  return Number.isFinite(result) && result >= 0
    ? result
    : null;
}

function integer(value) {
  const result = number(value);
  return result === null ? null : Math.trunc(result);
}

function display(value) {
  return value === null ? "Not recorded" : String(value);
}

function date(value) {
  if (typeof value !== "string" || !value) {
    return "Not recorded";
  }
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Not recorded"
    : timestamp.toLocaleString("en-MY", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "Asia/Kuala_Lumpur"
      });
}

export function downloadQualityPdf(run) {
  if (!run || typeof run !== "object") {
    throw new Error("Select a verified execution first.");
  }

  if (!/^[0-9a-f-]{36}$/i.test(String(run.run_id ?? ""))) {
    throw new Error("Invalid execution identifier.");
  }

  const score = number(run.quality_score);
  if (score !== null && score > 100) {
    throw new Error("Invalid quality score.");
  }

  const missing = integer(run.missing);
  const duplicates = integer(run.duplicates);
  const invalid = integer(run.invalid);
  const issues = integer(run.total_issues);
  const records = integer(run.source_records);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const W = 210;
  const M = 18;
  const contentWidth = W - 2 * M;
  let y = 20;

  const navy = [24, 39, 61];
  const teal = [16, 139, 127];
  const dark = [42, 53, 67];
  const muted = [105, 116, 130];

  function nextPageIfNeeded(height = 12) {
    if (y + height > 272) {
      pdf.addPage();
      y = 22;
    }
  }

  function text(value, x, yy, size = 10, color = dark, style = "normal") {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    pdf.text(String(value), x, yy);
  }

  function paragraph(value, size = 10) {
    const lines = pdf.splitTextToSize(String(value), contentWidth);
    const lineHeight = size * 0.47;
    for (const line of lines) {
      nextPageIfNeeded(lineHeight + 2);
      text(line, M, y, size);
      y += lineHeight;
    }
    y += 4;
  }

  function section(title) {
    nextPageIfNeeded(17);
    y += 3;
    text(title.toUpperCase(), M, y, 11, navy, "bold");
    y += 4;
    pdf.setDrawColor(215, 222, 230);
    pdf.line(M, y, W - M, y);
    y += 8;
  }

  function metric(label, value, x, width = 54) {
    pdf.setFillColor(244, 248, 250);
    pdf.roundedRect(x, y, width, 23, 2, 2, "F");
    text(label, x + 4, y + 7, 8, muted);
    text(String(value), x + 4, y + 17, 15, navy, "bold");
  }

  function detail(label, value) {
    nextPageIfNeeded(9);
    text(label, M, y, 9, muted);
    const formatted = String(value);
    const lines = pdf.splitTextToSize(formatted, 98);
    lines.forEach((line, index) => {
      if (index > 0) nextPageIfNeeded(5);
      text(line, M + 67, y, 9, dark, index === 0 ? "bold" : "normal");
      if (index < lines.length - 1) y += 5;
    });
    y += 8;
  }

  function finding(label, count, recommendation) {
    nextPageIfNeeded(24);
    text(label, M, y, 10, navy, "bold");
    text(display(count), W - M, y, 10, teal, "bold");
    y += 7;
    paragraph(recommendation, 9);
  }

  // Header
  pdf.setFillColor(...navy);
  pdf.rect(0, 0, W, 44, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("AI DATA GUARDIAN 3.0", M, 22);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text("DATA QUALITY ASSESSMENT REPORT", M, 31);
  y = 56;

  section("Executive summary");
  paragraph(
    `The recorded ${identifier(run.pipeline_name)} execution assessed ` +
    `${display(records)} source records and reported ` +
    `${display(issues)} validation-rule occurrences. ` +
    `The recorded quality score is ` +
    `${score === null ? "not available" : score.toFixed(1) + "%"}. ` +
    `Findings describe this execution only.`
  );

  nextPageIfNeeded(30);
  metric("QUALITY SCORE",
    score === null ? "N/A" : score.toFixed(1) + "%", M);
  metric("SOURCE RECORDS", display(records), M + 60);
  metric("RULE OCCURRENCES", display(issues), M + 120);
  y += 32;

  section("Verified validation findings");

  const recommendations = [
    [
      "Missing values",
      missing,
      "Review upstream completeness checks and require appropriate " +
      "handling of mandatory email fields."
    ],
    [
      "Duplicate values",
      duplicates,
      "Review uniqueness constraints and duplicate detection before " +
      "downstream ingestion."
    ],
    [
      "Invalid formats",
      invalid,
      "Standardize phone-number formats and validate values during " +
      "ingestion."
    ]
  ];

  for (const [label, count, advice] of recommendations) {
    finding(label, count, advice);
  }

  section("Corrective action guidance");
  paragraph(
    "Recommendations above are deterministic operational guidance " +
    "based on the reported issue categories. They are not proven " +
    "root causes and require human approval. No source data is " +
    "automatically corrected."
  );

  section("Execution audit information");
  detail("Execution ID", identifier(run.run_id));
  detail("Pipeline", identifier(run.pipeline_name));
  detail("Status", identifier(run.status));
  detail("Source type", identifier(run.source));
  detail("Table", identifier(run.table));
  detail("Source records", display(records));
  detail("Sample records", display(integer(run.sample_records)));
  detail("Output records", display(integer(run.output_records)));
  detail("Execution duration", number(run.duration_ms) === null
    ? "Not recorded"
    : `${Number(run.duration_ms).toFixed(2)} ms`);
  detail("Started", date(run.started_at));
  detail("Completed", date(run.completed_at));

  section("Privacy and methodology");
  paragraph(
    "This report contains approved execution metadata and aggregated " +
    "quality metrics only. It excludes customer names, email addresses, " +
    "phone numbers and raw database rows. Figures are taken from the " +
    "selected recorded pipeline execution, not independently " +
    "recalculated at export time."
  );
  paragraph(
    "AI-generated root-cause hypotheses and source-to-target " +
    "reconciliation results are excluded because they are not linked " +
    "to this execution in the current report data. This document " +
    "does not constitute an independently certified audit."
  );

  // Add footers after pagination is complete.
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(210, 219, 225);
    pdf.line(M, 282, W - M, 282);
    text("AI Data Guardian 3.0 | Internal demonstration", M, 289, 8, muted);
    text(`Page ${i} of ${pages}`, W - M - 23, 289, 8, muted);
  }

  const shortId = String(run.run_id).slice(0, 8);
  pdf.save(`AI-Data-Guardian-Quality-Report-${shortId}.pdf`);
}
