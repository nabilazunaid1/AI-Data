import { guardianFetch as fetch } from "../services/apiClient.js";
﻿import { useCallback, useEffect, useState } from "react";
import {
  Database,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Activity,
} from "lucide-react";

import CustomerDataCheck from "./DataCheck.jsx";
import QualityReview from "./QualityReview.jsx";

const API = "http://127.0.0.1:8000/api/v1";

const cardStyle = {
  background: "#142139",
  border: "1px solid #34415d",
  borderRadius: 12,
  padding: 16,
};

const textStyle = {
  color: "#a8bad2",
  fontSize: 12,
};

async function fetchJson(path, signal) {
  const response = await fetch(`${API}${path}`, {
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function HistoricalDataCheck() {
  const [schema, setSchema] = useState(null);
  const [trend, setTrend] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [nextSchema, nextTrend, nextAnalysis] =
          await Promise.all([
            fetchJson("/historical/schema", controller.signal),
            fetchJson(
              "/historical/trend?granularity=month",
              controller.signal
            ),
            fetchJson("/historical/anomalies", controller.signal),
          ]);

        if (
          nextSchema.status !== "success" ||
          nextTrend.status !== "success" ||
          nextAnalysis.status !== "success" ||
          nextTrend.dataset_type !== "synthetic_demo" ||
          nextAnalysis.dataset_type !== "synthetic_demo" ||
          nextTrend.read_only !== true ||
          nextAnalysis.read_only !== true ||
          nextAnalysis.ai_used !== false ||
          nextSchema.raw_records_included !== false ||
          nextTrend.raw_records_included !== false ||
          nextAnalysis.raw_records_included !== false ||
          !Array.isArray(nextSchema.columns) ||
          !Array.isArray(nextTrend.periods) ||
          !Array.isArray(nextAnalysis.findings)
        ) {
          throw new Error("Unexpected historical API response.");
        }

        if (!controller.signal.aborted) {
          setSchema(nextSchema);
          setTrend(nextTrend);
          setAnalysis(nextAnalysis);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Historical database analysis is unavailable.");
          setSchema(null);
          setTrend(null);
          setAnalysis(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => controller.abort();
  }, [refreshKey]);

  const format = (value, suffix = "") => {
    if (value === null || value === undefined) {
      return "N/A";
    }

    return `${Number(value).toLocaleString("en-MY", {
      maximumFractionDigits: 2,
    })}${suffix}`;
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={cardStyle}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              Historical PostgreSQL Data Check
            </h2>
            <p style={textStyle}>
              Approved synthetic demonstration data · Read-only SQL
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => setRefreshKey((n) => n + 1)}
            style={{
              background: "#1c3554",
              color: "#e5edf8",
              padding: "9px 13px",
              border: "1px solid #456284",
              borderRadius: 8,
              cursor: loading ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <RefreshCw size={15} />
            Refresh Analysis
          </button>
        </div>

        {loading && (
          <p role="status">Retrieving PostgreSQL aggregates...</p>
        )}

        {error && (
          <p role="alert" style={{ color: "#ffbd73" }}>
            {error}
          </p>
        )}

        {!loading && !error && schema && trend && analysis && (
          <>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 18,
            }}>
              {[
                ["Columns", schema.column_count],
                ["Monthly periods", trend.period_count],
                ["Statistical findings",
                  analysis.finding_count ?? analysis.findings.length],
              ].map(([label, value]) => (
                <div key={label} style={{
                  ...cardStyle,
                  flex: "1 1 135px",
                }}>
                  <div style={textStyle}>{label}</div>
                  <strong style={{ fontSize: 24 }}>{value}</strong>
                </div>
              ))}
            </div>

            <p style={textStyle}>
              {schema.schema}.{schema.table}
              {" · "}Timezone: {trend.timezone}
              {" · "}Analysis: {analysis.assessment}
            </p>
          </>
        )}
      </section>

      {!loading && !error && schema && trend && analysis && (
        <>
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Database Schema</h3>
            <p style={textStyle}>
              Column metadata from PostgreSQL. No row-level values.
            </p>

            <div style={{
              maxHeight: 260,
              overflow: "auto",
              marginTop: 12,
            }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                fontSize: 13,
              }}>
                <thead>
                  <tr>
                    <th style={{ padding: 10 }}>Column</th>
                    <th style={{ padding: 10 }}>Data type</th>
                    <th style={{ padding: 10 }}>Nullable</th>
                  </tr>
                </thead>
                <tbody>
                  {schema.columns.map((column) => (
                    <tr key={column.name}
                      style={{ borderTop: "1px solid #34415d" }}>
                      <td style={{ padding: 10 }}>{column.name}</td>
                      <td style={{ padding: 10 }}>{column.data_type}</td>
                      <td style={{ padding: 10 }}>
                        {column.nullable ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>
              Monthly SQL Quality Aggregates
            </h3>
            <p style={textStyle}>
              Direct database aggregation; historical records are not
              uploaded through CSV.
            </p>

            <div style={{
              overflowX: "auto",
              maxHeight: 360,
              overflowY: "auto",
            }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
                textAlign: "left",
              }}>
                <thead>
                  <tr>
                    {[
                      "Month",
                      "Records",
                      "Quality",
                      "Missing",
                      "Duplicates",
                      "Invalid",
                      "Processing",
                    ].map((label) => (
                      <th key={label} style={{
                        padding: 9,
                        whiteSpace: "nowrap",
                      }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trend.periods.map((period) => (
                    <tr
                      key={period.period_start}
                      style={{ borderTop: "1px solid #34415d" }}
                    >
                      <td style={{ padding: 9 }}>
                        {String(period.period_start).slice(0, 7)}
                      </td>
                      <td style={{ padding: 9 }}>
                        {period.record_count}
                      </td>
                      <td style={{ padding: 9 }}>
                        {format(period.avg_quality_score, "%")}
                      </td>
                      <td style={{ padding: 9 }}>
                        {period.missing_total ?? "N/A"}
                      </td>
                      <td style={{ padding: 9 }}>
                        {period.duplicate_total ?? "N/A"}
                      </td>
                      <td style={{ padding: 9 }}>
                        {period.invalid_total ?? "N/A"}
                      </td>
                      <td style={{ padding: 9 }}>
                        {format(period.avg_processing_ms, " ms")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={cardStyle}>
            <h3 style={{
              marginTop: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <Activity size={18} />
              Verified Statistical Findings
            </h3>

            {analysis.assessment === "insufficient_history" ? (
              <p>{analysis.message}</p>
            ) : analysis.findings.length === 0 ? (
              <p>No statistical outliers detected.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {analysis.findings.map((finding) => (
                  <div
                    key={`${finding.period_start}-${finding.metric}`}
                    style={{
                      background: "#10192c",
                      border: "1px solid #34415d",
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}>
                      <AlertTriangle size={16} color="#ffbd73" />
                      <strong>
                        {finding.metric_label || finding.metric}
                      </strong>
                    </div>
                    <p style={textStyle}>
                      Period: {String(finding.period_start).slice(0, 7)}
                    </p>
                    <p style={{ fontSize: 13 }}>
                      Actual: {format(finding.actual)}
                      {" · "}Baseline: {format(finding.baseline_median)}
                      {" · "}Modified Z-score:
                      {" "}{format(finding.modified_z_score)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <p style={{
              ...textStyle,
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginTop: 15,
            }}>
              <ShieldCheck size={15} />
              Statistical findings are advisory, not confirmed causes.
              No raw records or AI inference.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export default function DataCheckWorkspace({ request }) {
  const [connections, setConnections] = useState([]);
  const [selected, setSelected] = useState("customer_source");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [datasetName, setDatasetName] = useState('public.customers');
  const [view, setView] = useState('quality');
  const [refresh, setRefresh] = useState(0);
  const [fixRequest, setFixRequest] = useState(null);
  const onTableChange = useCallback(name => { setDatasetName(`public.${name}`); setFixRequest(null); }, []);
  useEffect(() => { if (request) setView('quality'); }, [request]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadConnections() {
      setLoading(true);
      setError('');
      try {
        const result = await fetchJson(
          "/connections",
          controller.signal
        );

        if (
          result.status !== "success" ||
          !Array.isArray(result.connections) ||
          result.credentials_included !== false ||
          result.raw_records_included !== false
        ) {
          throw new Error("Invalid connection registry.");
        }

        if (!controller.signal.aborted) {
          setConnections(result.connections);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Database connection registry is unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadConnections();
    return () => controller.abort();
  }, [refresh]);

  const connection = connections.find((item) => item.id === selected);
  const dataset = connection?.tables.find(item => `${item.schema}.${item.name}` === datasetName) || connection?.tables[0];
  const reviewDataset = dataset ? { connection_id: selected, schema_name: dataset.schema,
    table_name: dataset.name, connection_name: connection.name } : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={cardStyle}>
        <h2 style={{
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginTop: 0,
        }}>
          <Database size={18} />
          Database Connection
        </h2>

        {loading && <p role="status">Loading registered databases...</p>}

        {error && <p role="alert">{error}</p>}

        {!loading && !error && (
          <>
            <label
              htmlFor="guardian-database-selector"
              style={{
                display: "block",
                fontSize: 12,
                marginBottom: 8,
              }}
            >
              Select registered database
            </label>

            <select
              id="guardian-database-selector"
              value={selected}
              onChange={(event) => {
                const next = connections.find(item => item.id === event.target.value);
                setSelected(event.target.value);
                const first = next?.tables[0];
                setDatasetName(first ? `${first.schema}.${first.name}` : '');
                setView('quality');
                setFixRequest(null);
              }}
              style={{
                width: "100%",
                padding: 11,
                background: "#10192c",
                color: "#e4edf8",
                border: "1px solid #405472",
                borderRadius: 8,
              }}
            >
              {connections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            {connection && (
              <p style={textStyle}>
                Engine: {connection.engine}
                {" · "}Purpose: {connection.purpose}
                {" · "}Configuration: {connection.configuration_status}
              </p>
            )}
            {!!connection?.tables.length && <label className="qr-field" style={{ marginTop: 14 }}>
              <span>Select table or warehouse dataset</span>
              <select value={dataset ? `${dataset.schema}.${dataset.name}` : ''}
                onChange={event => { setDatasetName(event.target.value); setFixRequest(null); }}
                style={{ padding: 11, background: '#10192c', color: '#e4edf8', border: '1px solid #405472', borderRadius: 8 }}>
                {connection.tables.map(item => <option key={`${item.schema}.${item.name}`} value={`${item.schema}.${item.name}`}>{item.schema}.{item.name}</option>)}
              </select>
            </label>}
            {selected !== 'reconciliation_target' && <div className="qr-tabs" style={{ marginTop: 16 }} aria-label="Data Check workspace">
              <button onClick={() => setView('quality')} aria-selected={view === 'quality'}>Data quality checks</button>
              {selected !== 'quality_source' && <button onClick={() => setView('browse')} aria-selected={view === 'browse'}>{selected === 'historical_source' ? 'Historical SQL analysis' : 'SQL & evidence'}</button>}
            </div>}
          </>
        )}
      </section>

      {selected !== 'reconciliation_target' && <div hidden={view !== 'quality'}><QualityReview
        key={`${selected}.${dataset?.schema}.${dataset?.name}`} request={request} dataset={reviewDataset}
        onAccessChange={() => setRefresh(value => value + 1)}
        onOpenSql={selected === 'customer_source' ? action => {
          if (action.dataset.connection_id !== selected || action.dataset.schema !== dataset?.schema || action.dataset.table !== dataset?.name) return;
          setFixRequest({ ...action, navigationId: Date.now() }); setView('browse');
        } : undefined} /></div>}
      {connection?.id === "customer_source" && (
        <div hidden={view !== 'browse'}><CustomerDataCheck tableName={dataset?.name} onTableChange={onTableChange} fixRequest={fixRequest} /></div>
      )}

      {view === 'browse' && connection?.id === "historical_source" && (
        connection.configuration_status === "configured" ? (
          <HistoricalDataCheck />
        ) : (
          <p role="alert">
            Historical PostgreSQL is not configured.
          </p>
        )
      )}

      {connection?.id === "reconciliation_target" && (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>
            Source-to-Target Reconciliation
          </h2>

          <p style={textStyle}>
            This connection is restricted to approved reconciliation
            operations. General SQL editing and unrestricted database
            browsing are not available.
          </p>

          {connection.configuration_status !== "configured" ? (
            <p role="alert" style={{ color: "#ffbd73" }}>
              Reconciliation target configuration is missing.
              Restore the TARGET_DB_* settings in the backend
              environment before running comparisons.
            </p>
          ) : (
            <p>
              The approved reconciliation workflow is currently
              available in the Customer Database workspace.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
