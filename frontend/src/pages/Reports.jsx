
import { useEffect, useState } from "react";

import {
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Database,
  ShieldCheck,
  Clock3
} from "lucide-react";

import "../styles/pipeline.css";

// =====================================================
// CONFIGURATION
// =====================================================

const API_BASE = "http://127.0.0.1:8000";

const HISTORY_API = `${API_BASE}/api/v1/history`;

const panel = {
  background: "#17243a",
  border: "1px solid #34445b",
  borderRadius: "12px",
  padding: "22px"
};

const muted = {
  color: "#9aabc3",
  fontSize: "13px"
};

// =====================================================
// HELPERS
// =====================================================

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function formatQuality(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  return `${Number(value).toFixed(1)}%`;
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  return Number(value).toLocaleString();
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(
      `History API request failed (${response.status}).`
    );
  }

  return response.json();
}

// =====================================================
// KPI CARD
// =====================================================

function ReportMetric({ icon: Icon, label, value }) {
  return (
    <div
      style={{
        ...panel,
        display: "flex",
        alignItems: "center",
        gap: "14px"
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: "#23354f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#4be3c3",
          flexShrink: 0
        }}
      >
        <Icon size={20} />
      </div>

      <div>
        <div style={muted}>{label}</div>

        <strong
          style={{
            display: "block",
            color: "#f1f5fb",
            fontSize: "23px",
            marginTop: 5
          }}
        >
          {value}
        </strong>
      </div>
    </div>
  );
}

// =====================================================
// REPORTS PAGE
// =====================================================

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // ===================================================
  // LOAD HISTORY
  // ===================================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadReports() {
      setLoading(true);
      setError("");

      try {
        const [summaryResult, runsResult] =
          await Promise.all([
            fetchJson(
              `${HISTORY_API}/summary`,
              controller.signal
            ),
            fetchJson(
              `${HISTORY_API}/runs?limit=20`,
              controller.signal
            )
          ]);

        if (
          summaryResult.status !== "success" ||
          runsResult.status !== "success" ||
          !Array.isArray(runsResult.runs)
        ) {
          throw new Error(
            "Unexpected History API response."
          );
        }

        if (controller.signal.aborted) return;

        setSummary(summaryResult);
        setRuns(runsResult.runs);
        setSelectedRun(null);

      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load Reports."
        );

      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadReports();

    return () => controller.abort();

  }, [refreshKey]);

  // ===================================================
  // SELECT EXECUTION
  // ===================================================

  async function viewRun(runId) {
    setError("");

    try {
      const result = await fetchJson(
        `${HISTORY_API}/runs/${encodeURIComponent(runId)}`
      );

      if (
        result.status !== "success" ||
        result.run?.run_id !== runId
      ) {
        throw new Error(
          "Unable to verify selected execution."
        );
      }

      setSelectedRun(result.run);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to retrieve execution."
      );
    }
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div
      className="pipeline-page"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px"
      }}
    >
      {/* REPORTS TOOLBAR */}

      <section
        style={{
          ...panel,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px"
        }}
      >
        <div>
          <h2
            style={{
              color: "#f1f5fb",
              fontSize: "17px",
              margin: 0
            }}
          >
            Pipeline Reports
          </h2>

          <p style={{ ...muted, marginTop: 7 }}>
            Actual execution history from PostgreSQL.
          </p>
        </div>

        <button
          type="button"
          className="pipeline-run-button"
          onClick={() => setRefreshKey((n) => n + 1)}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <RefreshCw size={16} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      {/* ERRORS */}

      {error && (
        <div
          className="pipeline-error"
          role="alert"
        >
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* KPI SUMMARY */}

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "14px"
        }}
      >
        <ReportMetric
          icon={Database}
          label="Total Runs"
          value={
            summary
              ? formatNumber(summary.total_runs)
              : "—"
          }
        />

        <ReportMetric
          icon={CheckCircle2}
          label="Completed"
          value={
            summary
              ? formatNumber(summary.completed_runs)
              : "—"
          }
        />

        <ReportMetric
          icon={ShieldCheck}
          label="Average Quality"
          value={
            summary
              ? formatQuality(
                  summary.average_quality_score
                )
              : "—"
          }
        />

        <ReportMetric
          icon={AlertTriangle}
          label="Issue Occurrences"
          value={
            summary
              ? formatNumber(
                  summary.total_validation_issues
                )
              : "—"
          }
        />
      </section>

      {/* EXECUTION HISTORY */}

      <section className="pipeline-panel">
        <div className="pipeline-panel-heading">
          <div>
            <h2>Execution History</h2>
            <p>
              Latest 20 recorded pipeline executions.
            </p>
          </div>

          <span className="pipeline-privacy">
            <ShieldCheck size={14} />
            Metadata only
          </span>
        </div>

        {loading ? (
          <p style={muted}>
            Loading PostgreSQL execution history...
          </p>
        ) : runs.length === 0 ? (
          <p style={muted}>
            No execution history available.
          </p>
        ) : (
          <div className="pipeline-table-wrap">
            <table className="pipeline-table">
              <thead>
                <tr>
                  <th>Pipeline</th>
                  <th>Status</th>
                  <th>Quality</th>
                  <th>Issues</th>
                  <th>Duration</th>
                  <th>Executed</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {runs.map((run) => (
                  <tr key={run.run_id}>
                    <td>{run.pipeline_name}</td>

                    <td>
                      {run.status === "completed"
                        ? "Completed"
                        : "Failed"}
                    </td>

                    <td>
                      {formatQuality(run.quality_score)}
                    </td>

                    <td>{run.total_issues}</td>

                    <td>
                      {Number(run.duration_ms).toFixed(1)}
                      {" ms"}
                    </td>

                    <td>{formatDate(run.started_at)}</td>

                    <td>
                      <button
                        type="button"
                        onClick={() => viewRun(run.run_id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#4be3c3",
                          cursor: "pointer",
                          fontWeight: 600
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p
          className="pipeline-footnote"
          style={{ marginTop: 15 }}
        >
          Issue counts are recorded per execution.
          Repeated detections are counted separately.
        </p>
      </section>

      {/* SELECTED EXECUTION DETAILS */}

      {selectedRun && (
        <section className="pipeline-panel">
          <div className="pipeline-panel-heading">
            <div>
              <h2>
                <FileText size={18} />
                Execution Details
              </h2>

              <p>
                Approved metadata for the selected run.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedRun(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#9aabc3",
                cursor: "pointer"
              }}
            >
              Close
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "15px"
            }}
          >
            {[
              ["Run ID", selectedRun.run_id],
              ["Status", selectedRun.status],
              ["Source", selectedRun.source],
              ["Table", selectedRun.table],
              [
                "Source Records",
                selectedRun.source_records
              ],
              [
                "Sample Records",
                selectedRun.sample_records
              ],
              [
                "Output Records",
                selectedRun.output_records
              ],
              [
                "Quality Score",
                formatQuality(selectedRun.quality_score)
              ],
              ["Missing", selectedRun.missing],
              ["Duplicates", selectedRun.duplicates],
              ["Invalid", selectedRun.invalid],
              [
                "Total Issues",
                selectedRun.total_issues
              ]
            ].map(([label, value]) => (
              <div key={label}>
                <div style={muted}>{label}</div>

                <strong
                  style={{
                    display: "block",
                    color: "#f1f5fb",
                    marginTop: 5,
                    fontSize: "13px",
                    overflowWrap: "anywhere"
                  }}
                >
                  {value ?? "—"}
                </strong>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              ...muted,
              marginTop: 22
            }}
          >
            <Clock3 size={15} />
            {formatDate(selectedRun.completed_at)}
          </div>
        </section>
      )}
    </div>
  );
}
