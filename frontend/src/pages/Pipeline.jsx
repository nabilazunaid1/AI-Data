
import { useState } from "react";

import {
  Database,
  ShieldCheck,
  Workflow,
  Play,
  Download,
  CheckCircle2,
  AlertTriangle,
  LoaderCircle,
  FileText,
  LockKeyhole
} from "lucide-react";

import "../styles/pipeline.css";

// =====================================================
// CONFIGURATION
// =====================================================

const API_BASE = "http://127.0.0.1:8000";

const PIPELINE_ENDPOINT =
  `${API_BASE}/api/v1/pipeline/run`;

const DOWNLOAD_ENDPOINT =
  `${API_BASE}/api/v1/pipeline/download/csv`;

const DOWNLOAD_FILENAME =
  "guardian_customers_masked.csv";

const HISTORICAL_PIPELINE_ENDPOINT =
  `${API_BASE}/api/v1/pipeline/historical/run`;


const STAGES = [
  {
    id: "extract",
    label: "Extract",
    icon: Database,
    description: "Read approved PostgreSQL data"
  },
  {
    id: "validate",
    label: "Validate",
    icon: ShieldCheck,
    description: "Run deterministic SQL checks"
  },
  {
    id: "transform_and_mask",
    label: "Transform & Mask",
    icon: Workflow,
    description: "Prepare protected output"
  }
];

// =====================================================
// PROCESSING STAGE
// =====================================================

function PipelineStage({
  stage,
  result,
  running
}) {
  const Icon = stage.icon;

  const completed = result?.stages?.some(
    (item) =>
      item.stage === stage.id &&
      item.status === "completed"
  );

  return (
    <div className="pipeline-stage">
      <div className="pipeline-stage-icon">
        <Icon size={21} />
      </div>

      <div className="pipeline-stage-info">
        <strong>{stage.label}</strong>
        <span>{stage.description}</span>
      </div>

      <div className="pipeline-stage-status">
        {completed ? (
          <>
            <CheckCircle2 size={15} />
            <span>Completed</span>
          </>
        ) : running ? (
          <>
            <LoaderCircle
              size={15}
              className="pipeline-spinner"
            />
            <span>Processing</span>
          </>
        ) : (
          <span>Pending</span>
        )}
      </div>
    </div>
  );
}

// =====================================================
// METRIC CARD
// =====================================================

function Metric({ label, value }) {
  return (
    <div className="pipeline-metric">
      <strong>{value ?? "—"}</strong>
      <span>{label}</span>
    </div>
  );
}

// =====================================================
// MAIN PIPELINE PAGE
// =====================================================

export default function Pipeline() {
  const [limit, setLimit] = useState(20);

  const [running, setRunning] =
    useState(false);

  const [downloading, setDownloading] =
    useState(false);

  const [result, setResult] =
    useState(null);

  const [error, setError] =
    useState("");

  const [downloadMessage, setDownloadMessage] =
    useState("");

  // Independent historical execution state.
  const [historicalRunning, setHistoricalRunning] =
    useState(false);

  const [historicalResult, setHistoricalResult] =
    useState(null);

  const [historicalError, setHistoricalError] =
    useState("");


  // ===================================================
  // RUN PIPELINE
  // ===================================================

  async function handleRunPipeline() {
    if (running || downloading) {
      return;
    }

    setRunning(true);
    setError("");
    setDownloadMessage("");
    setResult(null);

    try {
      const response = await fetch(
        PIPELINE_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            table_name: "customers",
            limit: Number(limit)
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Pipeline execution failed."
        );
      }

      if (
        data.status !== "completed" ||
        data.stage_count !== 3 ||
        data.pii_masked !== true ||
        data.read_only !== true ||
        data.ai_used !== false
      ) {
        throw new Error(
          "Unexpected pipeline response."
        );
      }

      setResult(data);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to execute the pipeline."
      );

    } finally {
      setRunning(false);
    }
  }


  // ===================================================
  // RUN HISTORICAL QUALITY PIPELINE
  // ===================================================

  async function handleRunHistoricalPipeline() {
    if (historicalRunning) {
      return;
    }

    setHistoricalRunning(true);
    setHistoricalError("");
    setHistoricalResult(null);

    try {
      const response = await fetch(
        HISTORICAL_PIPELINE_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "Historical pipeline returned an invalid response."
        );
      }

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Historical pipeline execution failed."
        );
      }

      if (
        data.status !== "success" ||
        data.history_persisted !== true ||
        typeof data.run_id !== "string" ||
        !data.run_id.trim() ||
        data.read_only !== true ||
        data.raw_records_included !== false ||
        data.ai_used !== false ||
        !Array.isArray(data.findings) ||
        !Number.isInteger(data.period_count) ||
        !Number.isInteger(data.finding_count) ||
        data.finding_count !== data.findings.length
      ) {
        throw new Error(
          "Historical pipeline response or persistence verification failed."
        );
      }

      setHistoricalResult(data);

    } catch (err) {
      setHistoricalError(
        err instanceof Error
          ? err.message
          : "Unable to execute historical analysis."
      );

    } finally {
      setHistoricalRunning(false);
    }
  }

  // ===================================================
  // DOWNLOAD MASKED CSV
  // ===================================================

  async function handleDownloadCsv() {
    if (
      downloading ||
      running ||
      !result
    ) {
      return;
    }

    setDownloading(true);
    setError("");
    setDownloadMessage("");

    try {
      // This endpoint intentionally reruns the
      // approved pipeline on demand.
      // It does not retrieve a saved run artifact.

      const response = await fetch(
        DOWNLOAD_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            table_name: "customers",
            limit: result.extraction.limit
          })
        }
      );

      if (!response.ok) {
        let message =
          "Masked CSV download failed.";

        try {
          const data = await response.json();

          if (
            typeof data.detail === "string"
          ) {
            message = data.detail;
          }
        } catch {
          // Keep the generic error message.
        }

        throw new Error(message);
      }

      const contentType =
        response.headers.get("content-type") || "";

      if (
        !contentType.toLowerCase().includes(
          "text/csv"
        )
      ) {
        throw new Error(
          "The server did not return CSV content."
        );
      }

      const csvBlob = await response.blob();

      if (
        csvBlob.size === 0 ||
        csvBlob.size > 1024 * 1024
      ) {
        throw new Error(
          "Unexpected CSV download size."
        );
      }

      // Create a temporary browser download.
      // No raw customer records are requested.

      const objectUrl =
        URL.createObjectURL(csvBlob);

      try {
        const link =
          document.createElement("a");

        link.href = objectUrl;

        link.download =
          DOWNLOAD_FILENAME;

        document.body.appendChild(link);

        link.click();

        link.remove();

      } finally {
        URL.revokeObjectURL(objectUrl);
      }

      setDownloadMessage(
        "Masked CSV download requested successfully. " +
        "The export was regenerated from PostgreSQL."
      );

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to download masked CSV."
      );

    } finally {
      setDownloading(false);
    }
  }

  // ===================================================
  // RESULT DATA
  // ===================================================

  const validation = result?.validation;

  const output = result?.output;

  return (
    <div className="pipeline-page">

      {/* CONFIGURATION */}

      <section className="pipeline-panel">
        <div className="pipeline-panel-heading">
          <div>
            <h2>Pipeline Configuration</h2>
            <p>
              Execute an approved PostgreSQL
              data-quality workflow.
            </p>
          </div>

          <span className="pipeline-privacy">
            <LockKeyhole size={14} />
            Read-only
          </span>
        </div>

        <div className="pipeline-controls">

          <label>
            Data Source
            <select
              disabled
              value="postgresql"
            >
              <option value="postgresql">
                PostgreSQL
              </option>
            </select>
          </label>

          <label>
            Table
            <select
              disabled
              value="customers"
            >
              <option value="customers">
                customers
              </option>
            </select>
          </label>

          <label>
            Sample Size

            <select
              value={limit}
              disabled={
                running || downloading
              }
              onChange={(event) => {
                setLimit(
                  Number(event.target.value)
                );

                // The previous result belongs
                // to a different sample size.
                setResult(null);
                setError("");
                setDownloadMessage("");
              }}
            >
              <option value={5}>5 rows</option>
              <option value={10}>10 rows</option>
              <option value={20}>20 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
            </select>
          </label>

          <button
            className="pipeline-run-button"
            onClick={handleRunPipeline}
            disabled={
              running || downloading
            }
            type="button"
          >
            {running ? (
              <LoaderCircle
                size={17}
                className="pipeline-spinner"
              />
            ) : (
              <Play size={17} />
            )}

            {running
              ? "Processing..."
              : "Run Pipeline"}
          </button>
        </div>
      </section>

      {/* PROCESSING STAGES */}

      <section className="pipeline-panel">
        <div className="pipeline-panel-heading">
          <div>
            <h2>Processing Stages</h2>
            <p>
              Deterministic processing.
              AI is not invoked automatically.
            </p>
          </div>
        </div>

        <div className="pipeline-stage-list">
          {STAGES.map((stage) => (
            <PipelineStage
              key={stage.id}
              stage={stage}
              result={result}
              running={running}
            />
          ))}
        </div>
      </section>

      {/* ERRORS */}

      {error && (
        <div
          className="pipeline-error"
          role="alert"
        >
          <AlertTriangle size={19} />
          <span>{error}</span>
        </div>
      )}

      {/* EXECUTION RESULTS */}

      <section className="pipeline-panel">
        <div className="pipeline-panel-heading">
          <div>
            <h2>Execution Results</h2>
            <p>
              Live metrics from the completed
              PostgreSQL pipeline.
            </p>
          </div>

          {result && (
            <span className="pipeline-success">
              <CheckCircle2 size={15} />
              Completed
            </span>
          )}
        </div>

        <div className="pipeline-metrics">
          <Metric
            label="Extracted Sample"
            value={
              result?.extraction?.extracted_records
            }
          />

          <Metric
            label="Quality Score"
            value={
              validation?.quality_score == null
                ? null
                : `${validation.quality_score}%`
            }
          />

          <Metric
            label="Total Issues"
            value={validation?.total_issues}
          />

          <Metric
            label="Output Records"
            value={output?.record_count}
          />
        </div>

        {result && (
          <>
            <div className="pipeline-result-details">
              <span>
                Full-table records checked:
                {" "}
                <strong>
                  {validation.total_records}
                </strong>
              </span>

              <span>
                Duration:
                {" "}
                <strong>
                  {result.duration_ms} ms
                </strong>
              </span>

              <span>
                AI calls:
                {" "}
                <strong>0</strong>
              </span>
            </div>

            {/* DOWNLOAD CONTROL */}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
                marginTop: "22px",
                paddingTop: "18px",
                borderTop: "1px solid #34445b"
              }}
            >
              <span
                style={{
                  color: "#9aabc3",
                  fontSize: "12px"
                }}
              >
                Protected customer sample · CSV
              </span>

              <button
                className="pipeline-run-button"
                type="button"
                onClick={handleDownloadCsv}
                disabled={
                  downloading || running
                }
              >
                {downloading ? (
                  <LoaderCircle
                    size={17}
                    className="pipeline-spinner"
                  />
                ) : (
                  <Download size={17} />
                )}

                {downloading
                  ? "Preparing CSV..."
                  : "Download CSV"}
              </button>
            </div>

            {downloadMessage && (
              <p
                role="status"
                style={{
                  color: "#4be3c3",
                  fontSize: "12px",
                  marginTop: "12px"
                }}
              >
                {downloadMessage}
              </p>
            )}
          </>
        )}
      </section>

      {/* HISTORICAL QUALITY PIPELINE */}

      <section className="pipeline-panel historical-pipeline-panel">

        <div className="pipeline-panel-heading">
          <div>
            <h2>
              <Database size={18} />
              Historical Quality Pipeline
            </h2>

            <p>
              Analyze monthly aggregated PostgreSQL statistics
              and persist verified anomaly findings.
            </p>
          </div>

          <span className="pipeline-privacy">
            <LockKeyhole size={14} />
            Read-only
          </span>
        </div>

        <div className="historical-pipeline-toolbar">
          <div>
            <strong>Historical Database</strong>
            <span>
              24 monthly periods ? Statistical analysis ? No AI inference
            </span>
          </div>

          <button
            className="pipeline-run-button"
            type="button"
            onClick={handleRunHistoricalPipeline}
            disabled={historicalRunning}
          >
            {historicalRunning ? (
              <LoaderCircle
                size={17}
                className="pipeline-spinner"
              />
            ) : (
              <Play size={17} />
            )}

            {historicalRunning
              ? "Analyzing..."
              : "Run Historical Analysis"}
          </button>
        </div>

        {historicalError && (
          <div className="pipeline-error" role="alert">
            <AlertTriangle size={19} />
            <span>{historicalError}</span>
          </div>
        )}

        {historicalRunning && (
          <p className="historical-pipeline-loading" role="status">
            Analyzing historical monthly statistics and saving findings...
          </p>
        )}

        {historicalResult && (
          <div className="historical-pipeline-results">

            <div className="historical-pipeline-status">
              <CheckCircle2 size={17} />
              Historical execution completed and persisted
            </div>

            <div className="pipeline-metrics">

              <Metric
                label="Periods Analyzed"
                value={historicalResult.period_count}
              />

              <Metric
                label="Statistical Findings"
                value={historicalResult.finding_count}
              />

              <Metric
                label="Duration"
                value={`${historicalResult.duration_ms} ms`}
              />

              <Metric
                label="Assessment"
                value={historicalResult.assessment}
              />

            </div>

            <div className="historical-pipeline-details">

              <div>
                <span>Run ID</span>
                <code>{historicalResult.run_id}</code>
              </div>

              <div>
                <span>Source</span>
                <strong>{historicalResult.connection_id}</strong>
              </div>

              <div>
                <span>Persistence</span>
                <strong>Verified</strong>
              </div>

              <div>
                <span>AI inference</span>
                <strong>Not used</strong>
              </div>

            </div>

            <div className="historical-findings">

              <h3>Statistical Findings</h3>

              <div className="pipeline-table-wrap">
                <table className="pipeline-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Actual</th>
                      <th>Baseline Median</th>
                      <th>Modified Z-score</th>
                    </tr>
                  </thead>

                  <tbody>
                    {historicalResult.findings.map(
                      (finding, index) => (
                        <tr
                          key={
                            finding.finding_id ||
                            `${finding.metric}-${finding.period_start}-${index}`
                          }
                        >
                          <td>{finding.metric}</td>
                          <td>{finding.actual}</td>
                          <td>{finding.baseline_median}</td>
                          <td>{finding.modified_z_score}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

            </div>

            <p className="historical-pipeline-footnote">
              Historical analysis uses aggregated statistics only.
              Source records remain unchanged. No raw historical
              records are included in execution history.
            </p>

          </div>
        )}

      </section>

      {/* MASKED OUTPUT PREVIEW */}

      {output && (
        <section className="pipeline-panel">
          <div className="pipeline-panel-heading">
            <div>
              <h2>
                <FileText size={18} />
                Masked Output Preview
              </h2>

              <p>
                Limited sample only.
                Sensitive values are masked.
              </p>
            </div>
          </div>

          <div className="pipeline-table-wrap">
            <table className="pipeline-table">
              <thead>
                <tr>
                  {output.columns.map(
                    (column) => (
                      <th key={column}>
                        {column}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {output.rows.map(
                  (row, index) => (
                    <tr key={index}>
                      {output.columns.map(
                        (column) => (
                          <td key={column}>
                            {row[column] ?? "—"}
                          </td>
                        )
                      )}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <p className="pipeline-footnote">
            Validation metrics cover the full
            source table. The preview contains
            only the requested masked sample.
            Download CSV regenerates the sample
            and may reflect newer source data.
          </p>
        </section>
      )}
    </div>
  );
}
