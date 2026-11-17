import { useEffect, useRef, useState } from "react";

import {
  Table2,
  Search,
  Play,
  Bot,
  Send,
  X,
  AlertTriangle,
  Info,
  ShieldCheck,
  FileSearch
} from "lucide-react";

import {
  investigateTable,
  askGuardianQuestion,
  runAgenticQualityReview
} from "../services/aiGuardian.js";

import {
  getCustomerEvidence
} from "../services/evidence.js";

import {
  classifyGuardianQuestion,
  getVerifiedRuleEvidence
} from "../services/evidenceQuestions.js";

import "../styles/data-check.css";

// =====================================================
// AI DATA GUARDIAN 3.0
// DATA CHECK â€” PRIVACY-AWARE CHAT ROUTING
//
// Verified questions -> Deterministic SQL
// General questions  -> Local Ollama
// Unsupported         -> No AI request
//
// Existing UI and features are preserved.
// =====================================================

const RULE_LABELS = {
  missing_email: "Missing email",
  duplicate_email: "Duplicate email",
  invalid_phone: "Invalid phone"
};


// Normalize escaped line breaks in AI display text.
// This is presentation-only. It does not change API data.
function formatGuardianText(value) {
  if (typeof value !== "string") {
    return value == null ? "" : String(value);
  }

  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");
}

function exampleSQL(table) {
  if (!table) return "";

  return `SELECT *
FROM ${table}
LIMIT 100;`;
}

function ValidationCard({ label, value, kind }) {
  return (
    <div className="dc-validation-card">
      <div className={`dc-validation-icon ${kind}`}>
        {kind === "invalid" ? (
          <Info size={18} />
        ) : (
          <AlertTriangle size={18} />
        )}
      </div>

      <strong>{value ?? "â€”"}</strong>
      <span>{label}</span>
    </div>
  );
}

function ResultTable({ columns, rows }) {
  return (
    <div className="dc-preview-scroll">
      <table className="dc-preview-table">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={`${column}-${index}`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, columnIndex) => (
                <td key={columnIndex}>
                  {value === null
                    ? "NULL"
                    : String(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="dc-empty">
          No records returned.
        </p>
      )}
    </div>
  );
}

// =====================================================
// REUSABLE VERIFIED EVIDENCE ROWS
// =====================================================

function EvidenceRows({ rows }) {
  if (!rows.length) {
    return <p>No affected records were returned.</p>;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "9px",
        marginTop: "12px"
      }}
    >
      {rows.map((item) => (
        <div
          key={item.row_ref}
          style={{
            background: "#10192c",
            border: "1px solid #34415d",
            borderRadius: "9px",
            padding: "10px"
          }}
        >
          <div
            style={{
              fontSize: "11px",
              color: "#b1c3d9",
              overflowWrap: "anywhere",
              marginBottom: "5px"
            }}
          >
            {item.row_ref}
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#ffce79"
            }}
          >
            {item.failed_rules
              .map((rule) => RULE_LABELS[rule] || rule)
              .join(" Â· ")}
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================
// FULL CUSTOMER EVIDENCE
// =====================================================

function EvidencePanel({ evidence }) {
  return (
    <div className="dc-ai-bubble">
      <div className="dc-ai-bubble-title">
        <ShieldCheck size={16} />
        Verified Row-Level Evidence
      </div>

      <p>
        <strong>{evidence.total_affected_rows}</strong>
        {" "}affected rows Â·{" "}
        <strong>
          {evidence.total_issue_occurrences}
        </strong>
        {" "}failed checks
      </p>

      <p>
        Missing: {evidence.issue_counts.missing}
        {" Â· "}
        Duplicates: {evidence.issue_counts.duplicates}
        {" Â· "}
        Invalid: {evidence.issue_counts.invalid}
      </p>

      <EvidenceRows rows={evidence.evidence} />

      {evidence.truncated && (
        <p>
          Only part of the evidence is displayed.
        </p>
      )}

      <div className="dc-ai-note">
        <ShieldCheck size={15} />
        Verified using Python and PostgreSQL.
        No AI model was used.
      </div>

      <p style={{ fontSize: "11px", color: "#9fb0c9" }}>
        References are temporary and pseudonymous.
      </p>
    </div>
  );
}

// =====================================================
// EVIDENCE-AWARE CHAT RESPONSE
// =====================================================

function VerifiedRuleAnswer({ result }) {
  return (
    <div className="dc-ai-bubble">
      <div className="dc-ai-bubble-title">
        <ShieldCheck size={16} />
        Verified SQL Evidence
      </div>

      <p>
        <strong>{result.rule_label}</strong>
      </p>

      <p>{result.finding}</p>

      <p>
        Verified findings:{" "}
        <strong>{result.verified_issue_count}</strong>
      </p>

      <EvidenceRows rows={result.rows} />

      {result.truncated && (
        <p>
          Only some affected rows are displayed.
        </p>
      )}

      <p>
        <strong>Recommended action:</strong>
        {" "}{result.recommendation}
      </p>

      <div className="dc-ai-note">
        <ShieldCheck size={15} />
        Source: PostgreSQL + Python.
        AI was not used to generate these findings.
      </div>

      <p style={{ fontSize: "11px", color: "#9fb0c9" }}>
        {result.limitations}
      </p>
    </div>
  );
}

// =====================================================
// N-TO-N RECONCILIATION — EXISTING BACKEND API
// Approved synthetic fixture only; no customer values.
// =====================================================

function ReconciliationPanel() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  async function runReconciliation() {
    if (loading) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const response = await fetch("/api/v1/reconciliation/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          table_name: "guardian_reconcile_fixture",
          limit: 20
        }),
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        // Deliberately do not display internal database error details.
        throw new Error(
          response.status === 503
            ? "Reconciliation unavailable. Check backend target database configuration."
            : `Reconciliation failed: HTTP ${response.status}`
        );
      }

      const data = await response.json();
      const countFields = [
        "source_sample_rows",
        "target_sample_rows",
        "missing_key_count",
        "extra_key_count",
        "duplicate_source_key_count",
        "duplicate_target_key_count",
        "field_mismatch_count"
      ];

      if (
        data.status !== "success" ||
        data.table !== "guardian_reconcile_fixture" ||
        data.read_only !== true ||
        data.ai_used !== false ||
        data.pii_included !== false ||
        data.sampling_complete !== true ||
        !countFields.every((field) =>
          Number.isInteger(data[field]) && data[field] >= 0
        )
      ) {
        throw new Error("Invalid or incomplete reconciliation response.");
      }

      if (!controller.signal.aborted) setResult(data);
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught.message || "Reconciliation unavailable.");
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }

  const metrics = result ? [
    ["Missing", result.missing_key_count],
    ["Extra", result.extra_key_count],
    ["Duplicates", result.duplicate_source_key_count + result.duplicate_target_key_count],
    ["Mismatches", result.field_mismatch_count]
  ] : [];

  return (
    <div style={{ borderTop: "1px solid #34415d", marginTop: 18, paddingTop: 16 }}>
      <div className="dc-section-heading">Source-to-Target Reconciliation</div>
      <p style={{
        fontSize: 12,
        color: "#9fb0c9",
        margin: "5px 0"
      }}>
        N-to-N Data Comparison
      </p>
      <p style={{ fontSize: 12, color: "#b1c3d9", margin: "8px 0 12px" }}>
        Synthetic fixture: customer_db → guardian_target_lab.
        This comparison is separate from the selected table.
      </p>
      <button
        type="button"
        className="dc-investigate-button"
        onClick={runReconciliation}
        disabled={loading}
      >
        <Play size={16} />
        {loading ? "Comparing..." : "Compare Source & Target"}
      </button>

      {error && <p className="dc-empty" role="alert">{error}</p>}
      {loading && <p className="dc-empty" role="status">Comparing read-only database samples...</p>}

      {result && !loading && (
        <div style={{ marginTop: 12 }} role="status">
          <p style={{ fontSize: 12, color: "#b1c3d9" }}>
            Source: {result.source_sample_rows} rows · Target: {result.target_sample_rows} rows
          </p>
          <div className="dc-result-grid">
            {metrics.map(([label, count]) => (
              <ValidationCard
                key={label}
                label={label}
                value={count}
                kind={label === "Mismatches" ? "invalid" : "missing"}
              />
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#9fb0c9", marginTop: 10 }}>
            Verified SQL comparison of the complete synthetic fixtures.
            Results contain counts and pseudonymous evidence only.
          </p>
        </div>
      )}
    </div>
  );
}

// =====================================================
// DATA CHECK
// =====================================================


// STEP 10.9.7 - CONTROLLED AGENTIC AI REVIEW

function AgenticReviewControls({
  selectedTable,
  validationReady
}) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(null);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  async function runReview(useAi) {
    if (
      busy ||
      !validationReady ||
      selectedTable !== "customers"
    ) return;

    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const data = await runAgenticQualityReview({
        useAi,
        signal: controller.signal
      });

      if (!controller.signal.aborted) {
        setResult(data);
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(
          caught.message || "Quality review unavailable."
        );
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  }

  if (selectedTable !== "customers") {
    return (
      <p className="dc-empty">
        Controlled Agentic review currently supports
        customers only.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button
        type="button"
        className="dc-investigate-button"
        disabled={!validationReady || busy}
        onClick={() => runReview(false)}
      >
        <ShieldCheck size={16} />
        {busy
          ? "Review running..."
          : "Run Deterministic Review"}
      </button>

      <button
        type="button"
        className="dc-investigate-button"
        disabled={!validationReady || busy}
        onClick={() => runReview(true)}
      >
        <Bot size={16} />
        {busy
          ? "Review running..."
          : "Investigate with AI"}
      </button>

      {error && (
        <p className="dc-ai-bubble" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="dc-ai-bubble" role="status">
          <div className="dc-ai-bubble-title">
            <ShieldCheck size={16} />
            Verified Quality Review
          </div>

          <p>
            Records: {result.total_records}
            {" | "}
            Quality score: {result.quality_score}%
          </p>

          {result.findings.map((finding) => (
            <div
              key={finding.rule}
              style={{ marginTop: 8 }}
            >
              <strong>
                {finding.label}:
                {" "}{finding.verified_issue_count}
              </strong>
              <p>{finding.recommendation}</p>
            </div>
          ))}

          <p>
            Priority: {result.priority_rule ||
              "No verified issues"}
          </p>

          {result.investigation && (
            <p>{result.investigation.finding}</p>
          )}

          {result.ai_guidance && (
            <div>
              <strong>
                AI hypotheses
                {" ("}{result.ai_guidance.model}{")"}
              </strong>

              <p style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere"
              }}>
                {formatGuardianText(result.ai_guidance.explanation)}
              </p>

              <p>
                {result.ai_guidance.disclaimer}
              </p>
            </div>
          )}

          <div className="dc-ai-note">
            <ShieldCheck size={15} />
            SQL-verified and read-only.
            No raw PII.
            AI calls: {result.ai_calls}.
          </div>

          <p>{result.limitations}</p>
        </div>
      )}
    </div>
  );
}

export default function DataCheck() {

  // PostgreSQL tables
  const [tables, setTables] = useState([]);
  const [databaseName, setDatabaseName] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [loadingTables, setLoadingTables] = useState(true);
  const [tableError, setTableError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // Masked preview
  const [preview, setPreview] = useState({
    columns: [],
    rows: []
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Validation
  const [validation, setValidation] = useState(null);
  const [validationLoading, setValidationLoading] =
    useState(false);
  const [validationError, setValidationError] =
    useState("");

  // SQL Editor
  const [sql, setSql] = useState("");
  const [sqlResult, setSqlResult] = useState(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlError, setSqlError] = useState("");
  const sqlControllerRef = useRef(null);

  // AI Guardian
  const [aiOpen, setAiOpen] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiInvestigation, setAiInvestigation] =
    useState(null);

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  const aiControllerRef = useRef(null);
  const aiRequestIdRef = useRef(0);

  // Verified Evidence
  const [evidence, setEvidence] = useState(null);
  const [evidenceLoading, setEvidenceLoading] =
    useState(false);
  const [evidenceError, setEvidenceError] =
    useState("");

  const evidenceControllerRef = useRef(null);
  const evidenceRequestIdRef = useRef(0);

  // Workspace
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("sql");
  const [notice, setNotice] = useState("");

  // ===================================================
  // LOAD TABLES
  // ===================================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadTables() {
      setLoadingTables(true);
      setTableError("");

      try {
        const response = await fetch(
          "/api/v1/database/tables",
          {
            signal: controller.signal,
            cache: "no-store"
          }
        );

        if (!response.ok) {
          throw new Error(
            `Table request failed: HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (
          data.status !== "success" ||
          !Array.isArray(data.tables)
        ) {
          throw new Error(
            "Invalid PostgreSQL table response."
          );
        }

        if (controller.signal.aborted) return;

        setTables(data.tables);
        setDatabaseName(
          data.database || "customer_db"
        );

        setSelectedTable((previous) => {
          if (data.tables.includes(previous)) {
            return previous;
          }

          if (data.tables.includes("customers")) {
            return "customers";
          }

          return data.tables[0] || "";
        });

      } catch (error) {
        if (controller.signal.aborted) return;

        setTableError(error.message);
        setTables([]);
        setSelectedTable("");
        setDatabaseName("");

      } finally {
        if (!controller.signal.aborted) {
          setLoadingTables(false);
        }
      }
    }

    loadTables();

    return () => controller.abort();
  }, [retryCount]);

  // ===================================================
  // LOAD MASKED PREVIEW
  // ===================================================

  useEffect(() => {
    const controller = new AbortController();

    setPreview({ columns: [], rows: [] });
    setPreviewError("");

    if (!selectedTable) {
      setPreviewLoading(false);
      return () => controller.abort();
    }

    async function loadPreview() {
      setPreviewLoading(true);

      try {
        const url =
          "/api/v1/database/tables/" +
          encodeURIComponent(selectedTable) +
          "/preview?limit=20";

        const response = await fetch(url, {
          signal: controller.signal,
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error(
            `Preview failed: HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (
          data.status !== "success" ||
          data.masked !== true ||
          data.table !== selectedTable ||
          !Array.isArray(data.columns) ||
          !Array.isArray(data.rows)
        ) {
          throw new Error(
            "Invalid masked preview response."
          );
        }

        if (controller.signal.aborted) return;

        setPreview({
          columns: data.columns,
          rows: data.rows
        });

      } catch (error) {
        if (!controller.signal.aborted) {
          setPreviewError(error.message);
        }

      } finally {
        if (!controller.signal.aborted) {
          setPreviewLoading(false);
        }
      }
    }

    loadPreview();

    return () => controller.abort();
  }, [selectedTable]);

  // ===================================================
  // LOAD VALIDATION
  // ===================================================

  useEffect(() => {
    const controller = new AbortController();

    setValidation(null);
    setValidationError("");

    if (!selectedTable) {
      setValidationLoading(false);
      return () => controller.abort();
    }

    async function loadValidation() {
      setValidationLoading(true);

      try {
        const url =
          "/api/v1/validation/tables/" +
          encodeURIComponent(selectedTable);

        const response = await fetch(url, {
          signal: controller.signal,
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error(
            `Validation failed: HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (
          data.table !== selectedTable ||
          !["completed", "no_data"].includes(
            data.status
          ) ||
          data.ai_used !== false
        ) {
          throw new Error(
            "Invalid validation response."
          );
        }

        if (
          data.status === "completed" &&
          (
            typeof data.quality_score !== "number" ||
            typeof data.missing !== "number" ||
            typeof data.duplicates !== "number" ||
            typeof data.invalid !== "number"
          )
        ) {
          throw new Error(
            "Incomplete validation metrics."
          );
        }

        if (controller.signal.aborted) return;

        setValidation(data);

      } catch (error) {
        if (!controller.signal.aborted) {
          setValidationError(error.message);
        }

      } finally {
        if (!controller.signal.aborted) {
          setValidationLoading(false);
        }
      }
    }

    loadValidation();

    return () => controller.abort();
  }, [selectedTable]);

  // ===================================================
  // RESET ON TABLE CHANGE
  // ===================================================

  useEffect(() => {
    setSql(exampleSQL(selectedTable));
    setSqlResult(null);
    setSqlError("");
    setSqlLoading(false);
    setActiveTab("sql");

    sqlControllerRef.current?.abort();
    sqlControllerRef.current = null;

    aiRequestIdRef.current += 1;
    aiControllerRef.current?.abort();
    aiControllerRef.current = null;

    setAiLoading(false);
    setChatLoading(false);
    setAiError("");
    setAiInvestigation(null);
    setQuestion("");
    setMessages([]);

    evidenceRequestIdRef.current += 1;
    evidenceControllerRef.current?.abort();
    evidenceControllerRef.current = null;

    setEvidence(null);
    setEvidenceLoading(false);
    setEvidenceError("");
    setNotice("");
  }, [selectedTable]);

  // ===================================================
  // CLEAN UP
  // ===================================================

  useEffect(() => {
    return () => {
      sqlControllerRef.current?.abort();
      aiControllerRef.current?.abort();
      evidenceControllerRef.current?.abort();

      aiRequestIdRef.current += 1;
      evidenceRequestIdRef.current += 1;
    };
  }, []);

  // ===================================================
  // SECURE SQL
  // ===================================================

  async function runSQL() {
    const query = sql.trim();

    if (!query) {
      setSqlResult(null);
      setSqlError("Please enter a SQL query.");
      setActiveTab("results");
      return;
    }

    sqlControllerRef.current?.abort();

    const controller = new AbortController();
    sqlControllerRef.current = controller;

    setSqlLoading(true);
    setSqlError("");
    setSqlResult(null);
    setActiveTab("results");

    try {
      const response = await fetch(
        "/api/v1/sql/execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ query }),
          signal: controller.signal
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `SQL execution failed: HTTP ${response.status}`
        );
      }

      if (
        data.status !== "success" ||
        data.read_only !== true ||
        data.masked !== true ||
        data.ai_used !== false ||
        !Array.isArray(data.columns) ||
        !Array.isArray(data.rows)
      ) {
        throw new Error(
          "Invalid secure SQL response."
        );
      }

      if (!controller.signal.aborted) {
        setSqlResult(data);
      }

    } catch (error) {
      if (!controller.signal.aborted) {
        setSqlError(
          error.message || "SQL execution unavailable."
        );
      }

    } finally {
      if (sqlControllerRef.current === controller) {
        sqlControllerRef.current = null;
        setSqlLoading(false);
      }
    }
  }

  // ===================================================
  // AI INVESTIGATION
  // ===================================================

  async function investigate() {
    if (!selectedTable || aiLoading || chatLoading) {
      return;
    }

    if (
      validationLoading ||
      validationError ||
      validation?.table !== selectedTable ||
      validation?.status !== "completed"
    ) {
      setNotice(
        "Complete PostgreSQL validation before " +
        "requesting AI investigation."
      );
      return;
    }

    setAiOpen(true);
    setAiError("");
    setNotice("");

    const controller = new AbortController();
    const requestId = ++aiRequestIdRef.current;

    aiControllerRef.current = controller;
    setAiLoading(true);
    setAiInvestigation(null);

    try {
      const result = await investigateTable(
        selectedTable,
        controller.signal
      );

      if (
        controller.signal.aborted ||
        aiRequestIdRef.current !== requestId
      ) {
        return;
      }

      setAiInvestigation(result);

    } catch (error) {
      if (
        !controller.signal.aborted &&
        aiRequestIdRef.current === requestId
      ) {
        setAiError(
          error.message || "AI investigation unavailable."
        );
      }

    } finally {
      if (
        aiControllerRef.current === controller &&
        aiRequestIdRef.current === requestId
      ) {
        aiControllerRef.current = null;
        setAiLoading(false);
      }
    }
  }

  // ===================================================
  // VERIFIED EVIDENCE BUTTON
  // ===================================================

  async function viewVerifiedEvidence() {
    if (
      selectedTable !== "customers" ||
      evidenceLoading
    ) {
      return;
    }

    if (
      validationLoading ||
      validationError ||
      validation?.status !== "completed"
    ) {
      setNotice(
        "Complete validation before loading evidence."
      );
      return;
    }

    setAiOpen(true);
    setEvidence(null);
    setEvidenceError("");

    evidenceControllerRef.current?.abort();

    const controller = new AbortController();
    const requestId = ++evidenceRequestIdRef.current;

    evidenceControllerRef.current = controller;
    setEvidenceLoading(true);

    try {
      const result = await getCustomerEvidence(
        controller.signal
      );

      if (
        controller.signal.aborted ||
        evidenceRequestIdRef.current !== requestId
      ) {
        return;
      }

      setEvidence(result);

    } catch (error) {
      if (
        !controller.signal.aborted &&
        evidenceRequestIdRef.current === requestId
      ) {
        setEvidenceError(
          error.message || "Evidence unavailable."
        );
      }

    } finally {
      if (
        evidenceControllerRef.current === controller &&
        evidenceRequestIdRef.current === requestId
      ) {
        evidenceControllerRef.current = null;
        setEvidenceLoading(false);
      }
    }
  }

  // ===================================================
  // NEW â€” PRIVACY-AWARE CHAT ROUTING
  // ===================================================

  async function sendQuestion(event) {
    event.preventDefault();

    const text = question.trim();

    if (!text || aiLoading || chatLoading) {
      return;
    }

    if (text.length > 500) {
      setNotice(
        "Question must be 500 characters or fewer."
      );
      return;
    }

    if (
      !selectedTable ||
      validationLoading ||
      validationError ||
      validation?.table !== selectedTable ||
      validation?.status !== "completed"
    ) {
      setNotice(
        "Select a table and complete validation first."
      );
      return;
    }

    // NEW:
    // Classify before making any request.
    const classification = classifyGuardianQuestion(
      selectedTable,
      text
    );

    const requestId = ++aiRequestIdRef.current;
    const currentTable = selectedTable;

    setAiOpen(true);
    setNotice("");
    setQuestion("");

    // Show question in the existing chat.
    setMessages((previous) => [
      ...previous,
      {
        id: `user-${requestId}`,
        role: "user",
        content: text
      }
    ]);

    // -------------------------------------------------
    // PATH 1: UNSUPPORTED / SENSITIVE REQUEST
    //
    // No request to FastAPI or Ollama.
    // -------------------------------------------------

    if (classification.type === "unsupported") {
      setMessages((previous) => [
        ...previous,
        {
          id: `notice-${requestId}`,
          role: "system_notice",
          content:
            classification.reason ||
            "This request is not supported."
        }
      ]);

      return;
    }

    // -------------------------------------------------
    // PATH 2: VERIFIED OR GENERAL REQUEST
    // -------------------------------------------------

    const controller = new AbortController();

    aiControllerRef.current = controller;
    setChatLoading(true);

    try {
      if (
        classification.type === "verified_evidence"
      ) {
        const result = await getVerifiedRuleEvidence(
          classification.rule,
          controller.signal
        );

        if (
          controller.signal.aborted ||
          aiRequestIdRef.current !== requestId
        ) {
          return;
        }

        setMessages((previous) => [
          ...previous,
          {
            id: `evidence-${requestId}`,
            role: "verified_evidence",
            result
          }
        ]);

        return;
      }

      if (classification.type !== "general") {
        throw new Error(
          "Unrecognized question classification."
        );
      }

      // General questions are answered by
      // the existing local Ollama service.
      // Never submit raw PII in questions.
      const result = await askGuardianQuestion(
        currentTable,
        text,
        controller.signal
      );

      if (
        controller.signal.aborted ||
        aiRequestIdRef.current !== requestId
      ) {
        return;
      }

      setMessages((previous) => [
        ...previous,
        {
          id: `answer-${requestId}`,
          role: "assistant",
          content: result.answer,
          model: result.model,
          summary: result.summary,
          disclaimer: result.disclaimer
        }
      ]);

    } catch (error) {
      if (
        !controller.signal.aborted &&
        aiRequestIdRef.current === requestId
      ) {
        setMessages((previous) => [
          ...previous,
          {
            id: `error-${requestId}`,
            role: "error",
            content:
              error.message ||
              "AI Guardian could not answer."
          }
        ]);
      }

    } finally {
      if (
        aiControllerRef.current === controller &&
        aiRequestIdRef.current === requestId
      ) {
        aiControllerRef.current = null;
        setChatLoading(false);
      }
    }
  }

  // ===================================================
  // DERIVED VALUES
  // ===================================================

  const filteredTables = tables.filter((table) =>
    table.toLowerCase().includes(
      search.toLowerCase()
    )
  );

  const validationReady =
    validation?.status === "completed" &&
    validation?.table === selectedTable &&
    !validationLoading &&
    !validationError;

  const qualityScore = validationReady
    ? validation.quality_score
    : null;

  const scoreText = qualityScore === null
    ? "â€”"
    : `${qualityScore}%`;

  const modelBusy = aiLoading || chatLoading;

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div className="dc-page">

      <div className="dc-intro">
        <div>
          <h1>Data Check</h1>
          <p>
            Validate data, run SQL, and investigate issues
          </p>
        </div>
      </div>

      <div className="dc-workspace">

        {/* LEFT â€” DATA SOURCE */}

        <section className="dc-panel dc-source-panel">

          <div className="dc-section-heading">
            Data Source
          </div>

          <select
            className="dc-source-select"
            aria-label="Database source"
            value={databaseName || "loading"}
            onChange={() => {}}
          >
            <option value={databaseName || "loading"}>
              {databaseName
                ? `PostgreSQL â€” ${databaseName}`
                : "PostgreSQL â€” Not loaded"}
            </option>
          </select>

          <div className="dc-section-divider" />

          <div className="dc-section-heading">
            Tables ({tables.length})
          </div>

          <div className="dc-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search tables..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          {loadingTables && (
            <p className="dc-empty">
              Loading PostgreSQL tables...
            </p>
          )}

          {tableError && (
            <div className="dc-empty" role="alert">
              <p>{tableError}</p>
              <button
                type="button"
                className="dc-run-button"
                onClick={() =>
                  setRetryCount((value) => value + 1)
                }
              >
                Retry
              </button>
            </div>
          )}

          {!loadingTables && !tableError && (
            <div className="dc-table-list">
              {filteredTables.map((table) => (
                <button
                  type="button"
                  key={table}
                  className={
                    selectedTable === table
                      ? "dc-table-item selected"
                      : "dc-table-item"
                  }
                  onClick={() =>
                    setSelectedTable(table)
                  }
                >
                  <Table2 size={16} />
                  {table}
                </button>
              ))}

              {filteredTables.length === 0 && (
                <p className="dc-empty">
                  No matching tables
                </p>
              )}
            </div>
          )}

        </section>

        {/* MIDDLE â€” SQL AND VALIDATION */}

        <section className="dc-middle-column">

          <div className="dc-panel dc-editor-panel">

            <div className="dc-editor-toolbar">

              <div className="dc-tabs">

                <button
                  type="button"
                  className={
                    activeTab === "sql" ? "active" : ""
                  }
                  onClick={() =>
                    setActiveTab("sql")
                  }
                >
                  SQL Editor
                </button>

                <button
                  type="button"
                  className={
                    activeTab === "preview"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setActiveTab("preview")
                  }
                >
                  Data Preview
                </button>

                {(sqlResult || sqlLoading || sqlError) && (
                  <button
                    type="button"
                    className={
                      activeTab === "results"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setActiveTab("results")
                    }
                  >
                    SQL Results
                  </button>
                )}

              </div>

              <button
                type="button"
                className="dc-run-button"
                onClick={runSQL}
                disabled={sqlLoading || !selectedTable}
              >
                <Play size={14} fill="currentColor" />
                {sqlLoading ? "Running..." : "Run"}
              </button>

            </div>

            {activeTab === "sql" && (
              <div className="dc-sql-content">
                <textarea
                  aria-label="SQL Editor"
                  spellCheck={false}
                  value={sql}
                  onChange={(event) =>
                    setSql(event.target.value)
                  }
                  placeholder="Select a PostgreSQL table..."
                />
              </div>
            )}

            {activeTab === "preview" && (
              <div className="dc-preview-content">

                <div className="dc-preview-info">
                  <FileSearch size={15} />
                  Real PostgreSQL data â€” PII masked
                </div>

                {previewLoading && (
                  <p className="dc-empty">
                    Loading masked preview...
                  </p>
                )}

                {previewError && (
                  <p className="dc-empty" role="alert">
                    {previewError}
                  </p>
                )}

                {!previewLoading && !previewError && (
                  <ResultTable
                    columns={preview.columns}
                    rows={preview.rows}
                  />
                )}

              </div>
            )}

            {activeTab === "results" && (
              <div className="dc-preview-content">

                {sqlLoading && (
                  <p className="dc-empty">
                    Executing secure read-only SQL...
                  </p>
                )}

                {sqlError && (
                  <p className="dc-empty" role="alert">
                    SQL execution failed: {sqlError}
                  </p>
                )}

                {sqlResult && !sqlLoading && (
                  <>
                    <div className="dc-preview-info">
                      <ShieldCheck size={15} />
                      SQL Results â€” Read-only,
                      PII masked,
                      {" "}{sqlResult.returned_rows} rows
                    </div>

                    <ResultTable
                      columns={sqlResult.columns}
                      rows={sqlResult.rows}
                    />
                  </>
                )}

              </div>
            )}

          </div>

          <div className="dc-panel dc-result-panel">

            <div className="dc-section-heading">
              Validation Result
            </div>

            {validationLoading && (
              <p className="dc-empty">
                Running deterministic validation...
              </p>
            )}

            {validationError && (
              <p className="dc-empty" role="alert">
                {validationError}
              </p>
            )}

            {validation?.status === "no_data" && (
              <p className="dc-empty">
                No records available to validate.
              </p>
            )}

            <div className="dc-result-grid">

              <div className="dc-quality-result">
                <div
                  className="dc-quality-ring"
                  style={{
                    background: `conic-gradient(
                      #49e2bf ${qualityScore ?? 0}%,
                      #34435b 0
                    )`
                  }}
                >
                  <div className="dc-quality-center">
                    <strong>{scoreText}</strong>
                    <span>Quality Score</span>
                  </div>
                </div>
              </div>

              <ValidationCard
                label="Missing"
                kind="missing"
                value={
                  validationReady
                    ? validation.missing
                    : null
                }
              />

              <ValidationCard
                label="Duplicates"
                kind="duplicates"
                value={
                  validationReady
                    ? validation.duplicates
                    : null
                }
              />

              <ValidationCard
                label="Invalid"
                kind="invalid"
                value={
                  validationReady
                    ? validation.invalid
                    : null
                }
              />

            </div>



            <ReconciliationPanel />

          </div>

        </section>

        {/* RIGHT â€” AI GUARDIAN */}

        {aiOpen ? (
          <section className="dc-panel dc-ai-panel">

            <div className="dc-ai-header">
              <Bot size={19} />

              <strong>
                AI Guardian (Shared)
              </strong>

              <button
                type="button"
                className="dc-ai-close"
                aria-label="Close AI panel"
                onClick={() => setAiOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="dc-ai-conversation">
              <AgenticReviewControls key={selectedTable} selectedTable={selectedTable} validationReady={validationReady} />

              <div className="dc-ai-bubble">

                <div className="dc-ai-bubble-title">
                  <Bot size={16} />
                  AI Guardian
                </div>

                <p>
                  Ask about quality metrics, investigate
                  verified rule failures, or request
                  AI-generated recommendations.
                </p>

                <div className="dc-ai-note">
                  <ShieldCheck size={15} />
                  Row evidence comes from SQL;
                  AI explanations are advisory.
                </div>

              </div>

              {/* FULL EVIDENCE BUTTON */}

              {selectedTable === "customers" && (
                <button
                  type="button"
                  className="dc-investigate-button"
                  onClick={viewVerifiedEvidence}
                  disabled={
                    !validationReady ||
                    evidenceLoading
                  }
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  <ShieldCheck size={17} />

                  {evidenceLoading
                    ? "Loading Evidence..."
                    : evidence
                      ? "Refresh Verified Evidence"
                      : "View Verified Evidence"}
                </button>
              )}

              {selectedTable !== "customers" && (
                <p className="dc-empty">
                  Row-level evidence is currently
                  available for customers only.
                </p>
              )}

              {evidenceError && (
                <div
                  className="dc-ai-bubble"
                  role="alert"
                >
                  <div className="dc-ai-bubble-title">
                    <AlertTriangle size={16} />
                    Evidence unavailable
                  </div>

                  <p>{evidenceError}</p>
                </div>
              )}

              {evidence && !evidenceLoading && (
                <EvidencePanel evidence={evidence} />
              )}

              {/* AI INVESTIGATION */}

              {aiLoading && (
                <div className="dc-ai-bubble" role="status">
                  <div className="dc-ai-bubble-title">
                    <Bot size={16} />
                    AI Guardian
                  </div>

                  <p>
                    Investigating {selectedTable}
                    using local Ollama...
                  </p>
                </div>
              )}

              {aiError && (
                <div
                  className="dc-ai-bubble"
                  role="alert"
                >
                  <div className="dc-ai-bubble-title">
                    <AlertTriangle size={16} />
                    Investigation unavailable
                  </div>

                  <p>{aiError}</p>
                </div>
              )}

              {aiInvestigation && !aiLoading && (
                <>
                  <div className="dc-user-bubble">
                    Investigate quality issues in{" "}
                    {aiInvestigation.table}.
                  </div>

                  <div className="dc-ai-bubble">

                    <div className="dc-ai-bubble-title">
                      <Bot size={16} />
                      AI Guardian â€”{" "}
                      {aiInvestigation.model}
                    </div>

                    {aiInvestigation.summary && (
                      <p>
                        <strong>Verified SQL summary:</strong>
                        {" "}
                        {aiInvestigation.summary.quality_score}%
                        {" "}quality,
                        {" "}
                        {aiInvestigation.summary.missing}
                        {" "}missing,
                        {" "}
                        {aiInvestigation.summary.duplicates}
                        {" "}duplicates,
                        {" "}
                        {aiInvestigation.summary.invalid}
                        {" "}invalid.
                      </p>
                    )}

                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere"
                      }}
                    >
                      {formatGuardianText(aiInvestigation.explanation)}
                    </div>

                    <div className="dc-ai-note">
                      <Info size={15} />
                      {aiInvestigation.disclaimer}
                    </div>

                  </div>
                </>
              )}

              {/* CHAT */}

              {messages.map((message) => {

                if (message.role === "user") {
                  return (
                    <div
                      key={message.id}
                      className="dc-user-bubble"
                    >
                      {formatGuardianText(message.content)}
                    </div>
                  );
                }

                if (message.role === "verified_evidence") {
                  return (
                    <VerifiedRuleAnswer
                      key={message.id}
                      result={message.result}
                    />
                  );
                }

                if (
                  message.role === "system_notice" ||
                  message.role === "error"
                ) {
                  return (
                    <div
                      key={message.id}
                      className="dc-ai-bubble"
                      role={
                        message.role === "error"
                          ? "alert"
                          : "status"
                      }
                    >
                      <div className="dc-ai-bubble-title">
                        {message.role === "error" ? (
                          <AlertTriangle size={16} />
                        ) : (
                          <Info size={16} />
                        )}

                        AI Guardian
                      </div>

                      <p>{formatGuardianText(message.content)}</p>
                    </div>
                  );
                }

                return (
                  <div
                    key={message.id}
                    className="dc-ai-bubble"
                  >
                    <div className="dc-ai-bubble-title">
                      <Bot size={16} />
                      AI Guardian â€” {message.model}
                    </div>

                    {message.summary && (
                      <p>
                        <strong>Verified SQL summary:</strong>
                        {" "}
                        {message.summary.quality_score}%
                        {" "}quality,
                        {" "}
                        {message.summary.missing}
                        {" "}missing,
                        {" "}
                        {message.summary.duplicates}
                        {" "}duplicates,
                        {" "}
                        {message.summary.invalid}
                        {" "}invalid.
                      </p>
                    )}

                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere"
                      }}
                    >
                      {formatGuardianText(message.content)}
                    </div>

                    <div className="dc-ai-note">
                      <Info size={15} />
                      {message.disclaimer}
                    </div>
                  </div>
                );
              })}

              {chatLoading && (
                <div
                  className="dc-ai-bubble"
                  role="status"
                >
                  <div className="dc-ai-bubble-title">
                    <Bot size={16} />
                    AI Guardian
                  </div>

                  <p>Retrieving your answer...</p>
                </div>
              )}

            </div>

            {/* CHAT INPUT */}

            <form
              className="dc-ai-input-area"
              onSubmit={sendQuestion}
            >
              <input
                aria-label="Ask AI Guardian"
                placeholder={
                  modelBusy
                    ? "AI Guardian is responding..."
                    : "Ask a question..."
                }
                value={question}
                maxLength={500}
                disabled={
                  modelBusy ||
                  !validationReady
                }
                onChange={(event) =>
                  setQuestion(event.target.value)
                }
              />

              <button
                type="submit"
                aria-label="Submit question"
                disabled={
                  modelBusy ||
                  !validationReady ||
                  !question.trim()
                }
              >
                <Send size={17} />
              </button>
            </form>

          </section>
        ) : (
          <button
            type="button"
            className="dc-reopen-ai"
            onClick={() => setAiOpen(true)}
          >
            <Bot size={18} />
            Open AI Guardian
          </button>
        )}

      </div>

      {notice && (
        <div className="dc-notice" role="status">
          <Info size={17} />
          <span>{notice}</span>

          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

    </div>
  );
}
