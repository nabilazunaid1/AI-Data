import { guardianFetch as fetch } from "../services/apiClient.js";
﻿import { useEffect, useState } from "react";
import { Activity, AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";

const API = "http://127.0.0.1:8000/api/v1/historical";

const METRIC_UNITS = {
  avg_quality_score: "%",
  avg_processing_ms: " ms",
  avg_queue_wait_ms: " ms",
  missing_rate: " occurrences/record",
  duplicate_rate: " occurrences/record",
  invalid_rate: " occurrences/record",
};

function formatNumber(value) {
  return Number(value).toLocaleString("en-MY", {
    maximumFractionDigits: 2,
  });
}

function monthLabel(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  if (!match) return "Unknown period";

  const [year, month] = [Number(match[1]), Number(match[2])];
  const date = new Date(Date.UTC(year, month - 1, 1));

  return date.toLocaleDateString("en-MY", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Stat({ label, value }) {
  return (
    <div style={{
      padding: 14,
      background: "#121e32",
      border: "1px solid #34415d",
      borderRadius: 10,
      flex: "1 1 130px",
    }}>
      <div style={{ fontSize: 12, color: "#a8bad2" }}>
        {label}
      </div>
      <strong style={{ fontSize: 23, display: "block", marginTop: 5 }}>
        {value}
      </strong>
    </div>
  );
}

function QualityChart({ periods, anomalousMonths }) {
  const items = periods.filter(
    (item) => Number.isFinite(Number(item.avg_quality_score)) &&
      item.avg_quality_score !== null
  );

  if (!items.length) {
    return <p>No historical quality scores available.</p>;
  }

  const width = 720;
  const height = 220;
  const left = 42;
  const right = 14;
  const top = 18;
  const bottom = 42;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const x = (index) =>
    left + (items.length === 1
      ? plotW / 2
      : index * plotW / (items.length - 1));

  const y = (value) =>
    top + plotH * (1 - Math.max(0, Math.min(100, value)) / 100);

  const path = items.map((item, index) =>
    `${index === 0 ? "M" : "L"} ${x(index)} ${y(Number(item.avg_quality_score))}`
  ).join(" ");

  const ticks = [0, 25, 50, 75, 100];

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Monthly historical data quality scores. Highlighted points indicate months with verified statistical outliers."
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left} x2={width - right}
              y1={y(tick)} y2={y(tick)}
              stroke="#35435b" strokeDasharray="3 5"
            />
            <text
              x={left - 7} y={y(tick) + 4}
              textAnchor="end" fill="#a8bad2" fontSize="11"
            >
              {tick}%
            </text>
          </g>
        ))}

        <path
          d={path}
          fill="none"
          stroke="#69b5ee"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {items.map((item, index) => {
          const month = String(item.period_start).slice(0, 7);
          const flagged = anomalousMonths.has(month);

          return (
            <circle
              key={`${month}-${index}`}
              cx={x(index)}
              cy={y(Number(item.avg_quality_score))}
              r={flagged ? 6 : 3}
              fill={flagged ? "#ffbd73" : "#69b5ee"}
              stroke={flagged ? "#ffe2ae" : "#142139"}
              strokeWidth="1.5"
            >
              <title>
                {monthLabel(item.period_start)}:
                {" "}{formatNumber(item.avg_quality_score)}%
                {flagged ? " — statistical findings detected" : ""}
              </title>
            </circle>
          );
        })}

        {[0, Math.floor((items.length - 1) / 2), items.length - 1]
          .filter((index, position, all) => all.indexOf(index) === position)
          .map((index) => (
            <text
              key={index}
              x={x(index)}
              y={height - 12}
              textAnchor="middle"
              fontSize="11"
              fill="#a8bad2"
            >
              {monthLabel(items[index].period_start)}
            </text>
          ))}
      </svg>
    </div>
  );
}

export default function HistoricalAnomalyPanel() {
  const [trend, setTrend] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const responses = await Promise.all([
          fetch(`${API}/trend?granularity=month`, {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(`${API}/anomalies`, {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        if (responses.some((response) => !response.ok)) {
          throw new Error("Historical monitoring API unavailable.");
        }

        const [nextTrend, nextAnalysis] = await Promise.all(
          responses.map((response) => response.json())
        );

        if (
          nextTrend.status !== "success" ||
          nextAnalysis.status !== "success" ||
          nextTrend.dataset_type !== "synthetic_demo" ||
          nextAnalysis.dataset_type !== "synthetic_demo" ||
          nextTrend.read_only !== true ||
          nextAnalysis.read_only !== true ||
          nextAnalysis.ai_used !== false ||
          nextTrend.raw_records_included !== false ||
          nextAnalysis.raw_records_included !== false ||
          !Array.isArray(nextTrend.periods) ||
          !Array.isArray(nextAnalysis.findings)
        ) {
          throw new Error("Unexpected historical monitoring response.");
        }

        if (!controller.signal.aborted) {
          setTrend(nextTrend);
          setAnalysis(nextAnalysis);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError("Unable to load historical monitoring results.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [refreshKey]);

  const findings = analysis?.findings || [];
  const anomalousMonths = new Set(
    findings.map((item) => String(item.period_start).slice(0, 7))
  );

  return (
    <article className="panel trend-panel" style={{ marginTop: 18 }}>
      <div className="extra-panel-heading">
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={18} />
            Historical Anomaly Monitoring
          </h2>
          <span className="extra-subtitle">
            PostgreSQL historical analysis · Synthetic demonstration dataset
          </span>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
          aria-label="Refresh historical anomalies"
          title="Refresh historical anomalies"
          style={{
            border: "1px solid #34415d",
            borderRadius: 8,
            background: "#16243b",
            color: "#dce7f5",
            padding: 9,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {loading && (
        <p role="status">Loading aggregated historical data...</p>
      )}

      {error && (
        <p role="alert" style={{ color: "#ffbd73" }}>{error}</p>
      )}

      {!loading && !error && trend && analysis && (
        <>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 12,
            marginTop: 18, marginBottom: 18,
          }}>
            <Stat label="Recorded months" value={trend.period_count} />
            <Stat
              label="Statistical findings"
              value={analysis.finding_count ?? findings.length}
            />
            <Stat label="Analysis mode" value="Read-only" />
          </div>

          <h3 style={{ fontSize: 14, margin: "14px 0 8px" }}>
            Monthly Data Quality Score
          </h3>

          <QualityChart
            periods={trend.periods}
            anomalousMonths={anomalousMonths}
          />

          <p style={{ color: "#a8bad2", fontSize: 12 }}>
            Malaysian calendar time · Amber points indicate periods with
            statistical findings. Results are retrospective, not forecasts.
          </p>

          <h3 style={{ fontSize: 14, margin: "20px 0 10px" }}>
            Verified Statistical Findings
          </h3>

          {analysis.assessment === "insufficient_history" ? (
            <p>{analysis.message || "Insufficient historical observations."}</p>
          ) : findings.length === 0 ? (
            <p>No statistical outliers detected using the current method.</p>
          ) : (
            <div style={{ display: "grid", gap: 9 }}>
              {findings.map((finding, index) => {
                const unit = METRIC_UNITS[finding.metric] || "";
                return (
                  <div
                    key={`${finding.period_start}-${finding.metric}-${index}`}
                    style={{
                      background: "#121e32",
                      border: "1px solid #34415d",
                      borderRadius: 9,
                      padding: 12,
                    }}
                  >
                    <div style={{
                      display: "flex", alignItems: "center",
                      gap: 8, flexWrap: "wrap",
                    }}>
                      <AlertTriangle size={15} color="#ffbd73" />
                      <strong style={{ fontSize: 13 }}>
                        {finding.metric_label || finding.metric}
                      </strong>
                      <span style={{ color: "#a8bad2", fontSize: 12 }}>
                        {monthLabel(finding.period_start)}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, margin: "8px 0 0" }}>
                      Actual: <strong>{formatNumber(finding.actual)}{unit}</strong>
                      {" · "}Baseline: {formatNumber(finding.baseline_median)}{unit}
                      {" · "}Modified Z-score: {formatNumber(finding.modified_z_score)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <p style={{
            display: "flex", gap: 7, alignItems: "flex-start",
            color: "#a8bad2", fontSize: 12, marginTop: 14,
          }}>
            <ShieldCheck size={15} style={{ flexShrink: 0 }} />
            Read-only SQL aggregation and Python statistical analysis.
            No raw records or AI inference. Findings are advisory and
            do not establish root cause.
          </p>
        </>
      )}
    </article>
  );
}
