import { guardianFetch as fetch } from "../services/apiClient.js";

import { useEffect, useState } from "react";

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Activity,
  Server
} from "lucide-react";

import "../styles/home-extras.css";

// =====================================================
// API CONFIGURATION
// =====================================================

const API_BASE = "http://127.0.0.1:8000/api/v1";

const ENDPOINTS = {
  validation: `${API_BASE}/validation/customers`,
  history: `${API_BASE}/history/summary`,
  runs: `${API_BASE}/history/runs?limit=20`,
  tables: `${API_BASE}/database/tables`,
  database: `${API_BASE}/database/health`,
  backend: `${API_BASE}/health`
};

// =====================================================
// DISPLAY HELPERS
// =====================================================

const panelStyle = {
  background: "linear-gradient(140deg, #152035, #111b2f)",
  border: "1px solid #303b53",
  borderRadius: "12px",
  padding: "20px"
};

const mutedStyle = {
  color: "#aebbd0",
  fontSize: "12px"
};

function numberText(value) {
  return typeof value === "number"
    ? value.toLocaleString()
    : "—";
}

function qualityText(value) {
  return typeof value === "number"
    ? `${value.toFixed(1)}%`
    : "—";
}

function dateText(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur"
  });
}

async function getJson(url, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(
      `Backend request failed (${response.status})`
    );
  }

  return response.json();
}

// =====================================================
// KPI CARD
// =====================================================

function HomeMetric({ icon: Icon, label, value, note }) {
  return (
    <article
      className="metric-card"
      style={{
        ...panelStyle,
        display: "flex",
        flexDirection: "column",
        gap: "9px",
        minHeight: "135px"
      }}
    >
      <Icon size={23} color="#4be3c3" />

      <strong
        style={{
          color: "#f4f6ff",
          fontSize: "25px",
          overflowWrap: "anywhere"
        }}
      >
        {value}
      </strong>

      <span style={{ color: "#f4f6ff", fontSize: 12 }}>
        {label}
      </span>

      <span style={{ ...mutedStyle, fontSize: 10 }}>
        {note}
      </span>
    </article>
  );
}

// =====================================================
// QUALITY OVERVIEW
// =====================================================

function QualityOverview({ validation }) {
  const score = validation?.quality_score;

  return (
    <article className="panel overview-panel">
      <h2>Data Quality Overview</h2>

      <p style={mutedStyle}>
        Latest deterministic customer validation
      </p>

      <div
        className="quality-list"
        style={{ marginTop: 16 }}
      >
        <div className="quality-row">
          <span className="quality-name">
            Customers
          </span>

          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width:
                  typeof score === "number"
                    ? `${Math.min(100, Math.max(0, score))}%`
                    : "0%"
              }}
            />
          </div>

          <strong className="quality-percentage">
            {qualityText(score)}
          </strong>
        </div>
      </div>

      <p className="extra-footnote">
        Quality scores currently cover the customers
        table only. Scores for other approved tables
        are not included.
      </p>
    </article>
  );
}

// =====================================================
// RECENT ACTIVITY
// =====================================================

function RecentActivity({ runs }) {
  return (
    <article className="panel activity-panel">
      <h2>Recent Activity</h2>

      <div className="activity-list">
        {runs.length === 0 ? (
          <p style={mutedStyle}>
            No recorded pipeline executions.
          </p>
        ) : (
          runs.slice(0, 5).map((run) => (
            <div
              className="activity-row"
              key={run.run_id}
            >
              {run.status === "completed" ? (
                <CheckCircle2
                  size={18}
                  color="#4be3c3"
                />
              ) : (
                <AlertTriangle
                  size={18}
                  color="#ffbd46"
                />
              )}

              <span className="activity-label">
                {run.pipeline_name}
                {" — "}
                {run.status}
              </span>

              <time>{dateText(run.started_at)}</time>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

// =====================================================
// SYSTEM HEALTH
// =====================================================

function SystemHealth({ backend, database }) {
  const services = [
    {
      label: "FastAPI Backend",
      healthy: backend?.status === "healthy"
    },
    {
      label: "PostgreSQL",
      healthy: database?.status === "connected"
    }
  ];

  return (
    <article className="panel">
      <div className="extra-panel-heading">
        <h2>
          <Server
            size={18}
            className="health-title-icon"
          />
          System Health
        </h2>

        <span className="extra-subtitle">
          Live status
        </span>
      </div>

      <div className="service-list">
        {services.map((service) => (
          <div
            key={service.label}
            className="service-row"
          >
            <span className="service-name">
              {service.label}
            </span>

            <span className="service-status">
              <span
                className="service-status-dot"
                style={{
                  background: service.healthy
                    ? "#4be3c3"
                    : "#ffbd46"
                }}
              />

              {service.healthy
                ? "Connected"
                : "Unavailable"}
            </span>
          </div>
        ))}
      </div>

      <p className="extra-footnote">
        Connection status does not indicate
        AI model availability.
      </p>
    </article>
  );
}

// =====================================================
// ISSUES BREAKDOWN
// =====================================================

function IssuesBreakdown({ validation }) {
  const issueItems = [
    {
      label: "Missing",
      color: "yellow",
      count: validation?.missing
    },
    {
      label: "Duplicates",
      color: "blue",
      count: validation?.duplicates
    },
    {
      label: "Invalid",
      color: "red",
      count: validation?.invalid
    }
  ];

  return (
    <article className="panel issues-panel">
      <div className="extra-panel-heading">
        <h2>
          <AlertTriangle
            size={18}
            className="issues-title-icon"
          />
          Issues Breakdown
        </h2>

        <span className="extra-subtitle">
          Latest customer check
        </span>
      </div>

      <div className="issues-total">
        <strong>
          {numberText(validation?.total_issues)}
        </strong>

        <span>Total detected issues</span>
      </div>

      <div className="issue-breakdown-list">
        {issueItems.map((issue) => (
          <div
            key={issue.label}
            className="issue-breakdown-row"
          >
            <span className="issue-breakdown-label">
              <span
                className={
                  `issue-color-dot ${issue.color}`
                }
              />

              {issue.label}
            </span>

            <strong>
              {numberText(issue.count)}
            </strong>
          </div>
        ))}
      </div>
    </article>
  );
}

// =====================================================
// QUALITY HISTORY TREND
// =====================================================


// Explain actual recorded quality history.
// No synthetic scores or database modifications.
function qualityHistoryNote(runs) {
  if (!Array.isArray(runs)) {
    return "Historical quality data is unavailable.";
  }

  const scores = runs
    .filter((run) =>
      run.status === "completed" &&
      typeof run.quality_score === "number" &&
      Number.isFinite(run.quality_score) &&
      run.quality_score >= 0 &&
      run.quality_score <= 100
    )
    .map((run) => run.quality_score);

  if (scores.length === 0) {
    return "No recorded quality scores are available yet.";
  }

  if (scores.length === 1) {
    return (
      `One recorded execution has a quality score of ` +
      `${scores[0].toFixed(1)}%. More runs are needed ` +
      `to establish a trend.`
    );
  }

  if (scores.every((score) => score === scores[0])) {
    return (
      `Quality score remained unchanged at ` +
      `${scores[0].toFixed(1)}% across ` +
      `${scores.length} recorded executions.`
    );
  }

  return (
    `Showing ${scores.length} recorded quality scores. ` +
    `Scores vary between ${Math.min(...scores).toFixed(1)}% ` +
    `and ${Math.max(...scores).toFixed(1)}%.`
  );
}

function QualityTrend({ runs }) {
  const history = runs
    .filter(
      (run) =>
        run.status === "completed" &&
        typeof run.quality_score === "number"
    )
    .slice()
    .reverse();

  const width = 600;
  const height = 120;
  const padding = 12;

  const points = history.map((run, index) => {
    const x =
      history.length <= 1
        ? width / 2
        : padding +
          (index / (history.length - 1)) *
            (width - 2 * padding);

    const y =
      padding +
      (1 - run.quality_score / 100) *
        (height - 2 * padding);

    return { x, y, run };
  });

  const line = points
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");

  return (
    <article className="panel trend-panel">
      <div className="extra-panel-heading">
        <h2>
          <Activity size={18} />
          Data Quality Trend
        </h2>

        <span className="extra-subtitle">
          Recorded executions
        </span>

        <p
          style={{
            color: "#9fb0c9",
            fontSize: 12,
            margin: "8px 0 0",
            lineHeight: 1.5
          }}
          role="status"
        >
          {qualityHistoryNote(runs)}
        </p>
      </div>

      {points.length === 0 ? (
        <p style={mutedStyle}>
          Run a Pipeline to create quality history.
        </p>
      ) : (
        <>
          <div className="trend-chart">
            <div className="trend-y-axis">
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </div>

            <div className="trend-graph">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Historical pipeline quality scores"
              >
                {[0, 50, 100].map((value) => {
                  const y =
                    padding +
                    (1 - value / 100) *
                      (height - 2 * padding);

                  return (
                    <line
                      key={value}
                      x1="0"
                      x2={width}
                      y1={y}
                      y2={y}
                      stroke="#34445b"
                      strokeDasharray="4 5"
                    />
                  );
                })}

                {points.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#4be3c3"
                    strokeWidth="3"
                    points={line}
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {points.map(({ x, y, run }) => (
                  <circle
                    key={run.run_id}
                    cx={x}
                    cy={y}
                    r="4"
                    fill="#4be3c3"
                  >
                    <title>
                      {`${qualityText(
                        run.quality_score
                      )} — ${dateText(
                        run.completed_at
                      )}`}
                    </title>
                  </circle>
                ))}
              </svg>

              <div className="trend-x-axis">
                <span>Oldest shown</span>
                <span>Latest</span>
              </div>
            </div>
          </div>

          <div className="trend-footer">
            <span>Latest recorded quality</span>
            <strong>
              {qualityText(
                history[history.length - 1]
                  .quality_score
              )}
            </strong>
          </div>
        </>
      )}

      <p className="extra-footnote">
        Each point represents a completed pipeline
        execution, not a separate day. Repeated
        runs may have identical quality scores.
      </p>
    </article>
  );
}

// =====================================================
// MAIN HOME PAGE
// =====================================================

export default function HomeLive() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError("");
      setData(null);

      try {
        const results = await Promise.all(
          Object.values(ENDPOINTS).map((url) =>
            getJson(url, controller.signal)
          )
        );

        if (controller.signal.aborted) {
          return;
        }

        const [
          validation,
          history,
          recent,
          tables,
          database,
          backend
        ] = results;

        if (
          validation?.status !== "completed" ||
          history?.status !== "success" ||
          recent?.status !== "success" ||
          !Array.isArray(recent.runs) ||
          tables?.status !== "success"
        ) {
          throw new Error(
            "Unexpected backend response."
          );
        }

        setData({
          validation,
          history,
          recent,
          tables,
          database,
          backend
        });

      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load Home dashboard."
        );

      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => controller.abort();

  }, [refreshKey]);

  const validation = data?.validation;
  const history = data?.history;
  const runs = data?.recent?.runs || [];

  return (
    <div className="dashboard">

      <div
        className="demo-label"
        style={{
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12
        }}
      >
        <span>
          <ShieldCheck size={14} />
          Live PostgreSQL dashboard
        </span>

        <button
          type="button"
          onClick={() => setRefreshKey((n) => n + 1)}
          disabled={loading}
          style={{
            background: "#23354f",
            border: "1px solid #34445b",
            borderRadius: 7,
            color: "#f4f6ff",
            padding: "7px 12px",
            display: "flex",
            alignItems: "center",
            gap: 7
          }}
        >
          <RefreshCw size={14} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div
          className="pipeline-error"
          role="alert"
          style={{ marginBottom: 15 }}
        >
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <section className="metrics-grid">
        <HomeMetric
          icon={ShieldCheck}
          label="Data Quality Score"
          value={qualityText(validation?.quality_score)}
          note="Current customer validation"
        />

        <HomeMetric
          icon={AlertTriangle}
          label="Validation Issues"
          value={numberText(validation?.total_issues)}
          note="Current customer issue occurrences"
        />

        <HomeMetric
          icon={Database}
          label="Available Tables"
          value={numberText(data?.tables?.total_tables)}
          note="Approved PostgreSQL tables"
        />

        <HomeMetric
          icon={Clock3}
          label="Last Pipeline Run"
          value={dateText(history?.latest_completed_at)}
          note={
            history
              ? `${history.total_runs} recorded executions`
              : "Waiting for history"
          }
        />
      </section>

      <section className="dashboard-bottom">
        <QualityOverview validation={validation} />
        <RecentActivity runs={runs} />
      </section>

      <section className="home-extras-grid">
        <SystemHealth
          backend={data?.backend}
          database={data?.database}
        />

        <IssuesBreakdown validation={validation} />
      </section>

      <section className="home-trend-section">
        <QualityTrend runs={runs} />
      </section>


      {loading && (
        <p style={mutedStyle} role="status">
          Loading live dashboard metrics...
        </p>
      )}

      <p style={{ ...mutedStyle, marginTop: 15 }}>
        Dashboard metrics use live validation and
        saved execution metadata. No automatic
        Pipeline runs or AI calls are performed.
      </p>
    </div>
  );
}
