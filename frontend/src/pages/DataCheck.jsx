
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
  askGuardianQuestion
} from "../services/aiGuardian.js";

import {
  getCustomerEvidence
} from "../services/evidence.js";

import "../styles/data-check.css";

// =====================================================
// AI DATA GUARDIAN 3.0 — DATA CHECK
//
// Working features:
// - PostgreSQL table discovery
// - Masked Data Preview
// - Deterministic validation
// - Secure SQL Editor
// - Masked SQL Results
// - On-demand AI Investigation
// - On-demand AI Guardian Chat
// - Verified Row-Level Evidence
//
// Only aggregate validation summaries go to Ollama.
// Evidence is displayed directly from FastAPI.
// =====================================================

function exampleSQL(table) {
  if (!table) return "";

  return `SELECT *
FROM ${table}
LIMIT 100;`;
}

const RULE_LABELS = {
  missing_email: "Missing email",
  duplicate_email: "Duplicate email",
  invalid_phone: "Invalid phone"
};

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

      <strong>{value ?? "—"}</strong>
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
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>
                  {cell === null
                    ? "NULL"
                    : String(cell)}
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
// VERIFIED EVIDENCE DISPLAY
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
        {" "}affected rows ·{" "}
        <strong>
          {evidence.total_issue_occurrences}
        </strong>
        {" "}failed validation checks
      </p>

      <p>
        Missing: {evidence.issue_counts.missing}
        {" · "}
        Duplicates: {evidence.issue_counts.duplicates}
        {" · "}
        Invalid: {evidence.issue_counts.invalid}
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          marginTop: "12px"
        }}
      >
        {evidence.evidence.map((item) => (
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
                color: "#adbed6",
                overflowWrap: "anywhere",
                marginBottom: "6px"
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
                .map((rule) =>
                  RULE_LABELS[rule] || rule
                )
                .join(" · ")}
            </div>

            <div
              style={{
                fontSize: "11px",
                color: "#91a6c1",
                marginTop: "5px"
              }}
            >
              {item.issue_count} failed{" "}
              {item.issue_count === 1
                ? "check"
                : "checks"}
            </div>
          </div>
        ))}
      </div>

      {evidence.evidence.length === 0 && (
        <p>No affected rows found.</p>
      )}

      {evidence.truncated && (
        <p>
          Only part of the evidence is displayed.
          Additional affected rows exist.
        </p>
      )}

      <div className="dc-ai-note">
        <ShieldCheck size={15} />
        Verified using Python and SQL.
        No AI model was used to generate these results.
      </div>

      <p
        style={{
          fontSize: "11px",
          color: "#9fb0c9"
        }}
      >
        References are temporary and pseudonymous.
        They may change when the backend restarts.
      </p>

    </div>
  );
}

// =====================================================
// MAIN DATA CHECK
// =====================================================

export default function DataCheck() {

  // PostgreSQL source
  const [tables, setTables] = useState([]);
  const [databaseName, setDatabaseName] =
    useState("");
  const [selectedTable, setSelectedTable] =
    useState("");

  const [loadingTables, setLoadingTables] =
    useState(true);
  const [tableError, setTableError] =
    useState("");
  const [retryCount, setRetryCount] =
    useState(0);

  // Masked data preview
  const [preview, setPreview] = useState({
    columns: [],
    rows: []
  });
  const [previewLoading, setPreviewLoading] =
    useState(false);
  const [previewError, setPreviewError] =
    useState("");

  // Deterministic validation
  const [validation, setValidation] =
    useState(null);
  const [validationLoading, setValidationLoading] =
    useState(false);
  const [validationError, setValidationError] =
    useState("");

  // Secure SQL
  const [sql, setSql] = useState("");
  const [sqlResult, setSqlResult] =
    useState(null);
  const [sqlLoading, setSqlLoading] =
    useState(false);
  const [sqlError, setSqlError] =
    useState("");
  const sqlControllerRef = useRef(null);

  // AI Guardian
  const [aiOpen, setAiOpen] = useState(true);
  const [aiLoading, setAiLoading] =
    useState(false);
  const [aiError, setAiError] =
    useState("");
  const [aiInvestigation, setAiInvestigation] =
    useState(null);

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] =
    useState(false);

  const aiControllerRef = useRef(null);
  const aiRequestIdRef = useRef(0);

  // Verified evidence
  const [evidence, setEvidence] =
    useState(null);
  const [evidenceLoading, setEvidenceLoading] =
    useState(false);
  const [evidenceError, setEvidenceError] =
    useState("");

  const evidenceControllerRef = useRef(null);
  const evidenceRequestIdRef = useRef(0);

  // UI
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] =
    useState("sql");
  const [notice, setNotice] = useState("");

  // ===================================================
  // LOAD POSTGRESQL TABLES
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
            "Invalid PostgreSQL table response"
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

    setPreview({
      columns: [],
      rows: []
    });
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
            "Invalid masked preview response"
          );
        }

        if (controller.signal.aborted) return;

        setPreview({
          columns: data.columns,
          rows: data.rows
        });

      } catch (error) {
        if (controller.signal.aborted) return;
        setPreviewError(error.message);

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
  // LOAD DETERMINISTIC VALIDATION
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
            "Invalid validation response"
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
            "Incomplete validation metrics"
          );
        }

        if (controller.signal.aborted) return;

        setValidation(data);

      } catch (error) {
        if (controller.signal.aborted) return;
        setValidationError(error.message);

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
  // RESET WHEN SELECTED TABLE CHANGES
  // ===================================================

  useEffect(() => {
    setSql(exampleSQL(selectedTable));
    setSqlResult(null);
    setSqlError("");
    setSqlLoading(false);
    setActiveTab("sql");

    if (sqlControllerRef.current) {
      sqlControllerRef.current.abort();
      sqlControllerRef.current = null;
    }

    aiRequestIdRef.current += 1;

    if (aiControllerRef.current) {
      aiControllerRef.current.abort();
      aiControllerRef.current = null;
    }

    setAiLoading(false);
    setChatLoading(false);
    setAiError("");
    setAiInvestigation(null);
    setQuestion("");
    setMessages([]);

    evidenceRequestIdRef.current += 1;

    if (evidenceControllerRef.current) {
      evidenceControllerRef.current.abort();
      evidenceControllerRef.current = null;
    }

    setEvidence(null);
    setEvidenceLoading(false);
    setEvidenceError("");
    setNotice("");

  }, [selectedTable]);

  // ===================================================
  // CLEAN UP ON UNMOUNT
  // ===================================================

  useEffect(() => {
    return () => {
      if (sqlControllerRef.current) {
        sqlControllerRef.current.abort();
      }

      if (aiControllerRef.current) {
        aiControllerRef.current.abort();
      }

      if (evidenceControllerRef.current) {
        evidenceControllerRef.current.abort();
      }

      aiRequestIdRef.current += 1;
      evidenceRequestIdRef.current += 1;
    };
  }, []);

  // ===================================================
  // SECURE SQL EXECUTION
  // ===================================================

  async function runSQL() {
    const query = sql.trim();

    if (!query) {
      setSqlError("Please enter a SQL query.");
      setSqlResult(null);
      setActiveTab("results");
      return;
    }

    if (sqlControllerRef.current) {
      sqlControllerRef.current.abort();
    }

    const controller = new AbortController();
    sqlControllerRef.current = controller;

    setSqlLoading(true);
    setSqlError("");
    setSqlResult(null);
    setActiveTab("results");
    setNotice("");

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
          "Invalid secure SQL response"
        );
      }

      if (controller.signal.aborted) return;

      setSqlResult(data);

    } catch (error) {
      if (controller.signal.aborted) return;
      setSqlError(
        error.message || "SQL execution unavailable"
      );

    } finally {
      if (sqlControllerRef.current === controller) {
        sqlControllerRef.current = null;
        setSqlLoading(false);
      }
    }
  }

  // ===================================================
  // EXISTING ON-DEMAND AI INVESTIGATION
  // ===================================================

  async function investigate() {
    if (
      !selectedTable ||
      aiLoading ||
      chatLoading
    ) {
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
        controller.signal.aborted ||
        aiRequestIdRef.current !== requestId
      ) {
        return;
      }

      setAiError(
        error.message ||
        "AI investigation unavailable"
      );

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
  // EXISTING AI CHAT
  // ===================================================

  async function sendQuestion(event) {
    event.preventDefault();

    const text = question.trim();

    if (!text || aiLoading || chatLoading) return;

    if (text.length > 500) {
      setNotice(
        "Question must be 500 characters or fewer."
      );
      return;
    }

    if (
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

    const controller = new AbortController();
    const requestId = ++aiRequestIdRef.current;

    aiControllerRef.current = controller;

    setChatLoading(true);
    setAiOpen(true);
    setNotice("");
    setQuestion("");

    setMessages((previous) => [
      ...previous,
      {
        id: requestId,
        role: "user",
        content: text
      }
    ]);

    try {
      const result = await askGuardianQuestion(
        selectedTable,
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
          id: `${requestId}-answer`,
          role: "assistant",
          content: result.answer,
          model: result.model,
          disclaimer: result.disclaimer,
          summary: result.summary
        }
      ]);

    } catch (error) {
      if (
        controller.signal.aborted ||
        aiRequestIdRef.current !== requestId
      ) {
        return;
      }

      setMessages((previous) => [
        ...previous,
        {
          id: `${requestId}-error`,
          role: "error",
          content:
            error.message ||
            "AI Guardian could not answer."
        }
      ]);

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
  // NEW — RETRIEVE VERIFIED ROW-LEVEL EVIDENCE
  // ===================================================

  async function viewVerifiedEvidence() {
    if (selectedTable !== "customers") {
      setEvidenceError(
        "Row-level evidence is currently " +
        "available for customers only."
      );
      return;
    }

    if (evidenceLoading) return;

    setAiOpen(true);
    setEvidenceError("");
    setEvidence(null);
    setNotice("");

    if (evidenceControllerRef.current) {
      evidenceControllerRef.current.abort();
    }

    const controller = new AbortController();
    const requestId = ++evidenceRequestIdRef.current;

    evidenceControllerRef.current = controller;
    setEvidenceLoading(true);

    try {
      // This calls FastAPI only.
      // It does NOT invoke Ollama.
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
        controller.signal.aborted ||
        evidenceRequestIdRef.current !== requestId
      ) {
        return;
      }

      setEvidenceError(
        error.message ||
        "Unable to retrieve verified evidence."
      );

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
    ? "—"
    : `${qualityScore}%`;

  const modelBusy = aiLoading || chatLoading;

  const customerEvidenceAvailable =
    selectedTable === "customers" &&
    validationReady;

  // ===================================================
  // UI — ORIGINAL THREE-COLUMN LAYOUT
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

        {/* LEFT — DATA SOURCE */}

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
                ? `PostgreSQL — ${databaseName}`
                : "PostgreSQL — Not loaded"}
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

        {/* MIDDLE — SQL AND VALIDATION */}

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
                disabled={
                  sqlLoading ||
                  !selectedTable
                }
              >
                <Play size={14} fill="currentColor" />
                {sqlLoading
                  ? "Running..."
                  : "Run"}
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
                  Real PostgreSQL data — PII masked
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
                      SQL Results — Read-only,
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

            <div className="dc-result-footer">
              <button
                type="button"
                className="dc-investigate-button"
                onClick={investigate}
                disabled={
                  modelBusy ||
                  !validationReady
                }
              >
                <Bot size={19} />
                {aiLoading
                  ? "Investigating..."
                  : "Investigate with AI"}
              </button>
            </div>

          </div>
        </section>

        {/* RIGHT — SHARED AI GUARDIAN */}

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
                onClick={() =>
                  setAiOpen(false)
                }
              >
                <X size={17} />
              </button>
            </div>

            <div className="dc-ai-conversation">

              <div className="dc-ai-bubble">
                <div className="dc-ai-bubble-title">
                  <Bot size={16} />
                  AI Guardian
                </div>

                <p>
                  Ask about the selected table,
                  investigate its quality score,
                  or view verified row-level evidence.
                </p>

                <div className="dc-ai-note">
                  <ShieldCheck size={15} />
                  SQL evidence and AI explanations
                  are separate.
                </div>
              </div>

              {/* VERIFIED EVIDENCE ACTION */}

              {selectedTable === "customers" && (
                <button
                  type="button"
                  className="dc-investigate-button"
                  onClick={viewVerifiedEvidence}
                  disabled={
                    !customerEvidenceAvailable ||
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

              {/* EVIDENCE ERRORS */}

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

              {/* VERIFIED SQL EVIDENCE */}

              {selectedTable === "customers" &&
                evidence &&
                !evidenceLoading && (
                  <EvidencePanel evidence={evidence} />
                )}

              {/* INVESTIGATION LOADING */}

              {aiLoading && (
                <div
                  className="dc-ai-bubble"
                  role="status"
                >
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

              {/* INVESTIGATION ERROR */}

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

              {/* AI INVESTIGATION ANSWER */}

              {aiInvestigation && !aiLoading && (
                <>
                  <div className="dc-user-bubble">
                    Investigate quality issues in
                    {" "}{aiInvestigation.table}.
                  </div>

                  <div className="dc-ai-bubble">
                    <div className="dc-ai-bubble-title">
                      <Bot size={16} />
                      AI Guardian —{" "}
                      {aiInvestigation.model}
                    </div>

                    {aiInvestigation.summary && (
                      <p>
                        <strong>
                          Verified SQL summary:
                        </strong>
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
                      {aiInvestigation.explanation}
                    </div>

                    <div className="dc-ai-note">
                      <Info size={15} />
                      {aiInvestigation.disclaimer}
                    </div>
                  </div>
                </>
              )}

              {/* EXISTING INTERACTIVE CHAT */}

              {messages.map((message) => {

                if (message.role === "user") {
                  return (
                    <div
                      key={message.id}
                      className="dc-user-bubble"
                    >
                      {message.content}
                    </div>
                  );
                }

                if (message.role === "error") {
                  return (
                    <div
                      key={message.id}
                      className="dc-ai-bubble"
                      role="alert"
                    >
                      <div className="dc-ai-bubble-title">
                        <AlertTriangle size={16} />
                        AI Guardian
                      </div>

                      <p>{message.content}</p>
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
                      AI Guardian — {message.model}
                    </div>

                    {message.summary && (
                      <p>
                        <strong>
                          Verified SQL summary:
                        </strong>
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
                      {message.content}
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

                  <p>
                    Generating an answer using Ollama...
                  </p>
                </div>
              )}

            </div>

            {/* EXISTING CHAT INPUT */}

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

      {/* NOTIFICATION */}

      {notice && (
        <div className="dc-notice" role="status">
          <Info size={17} />
          <span>{notice}</span>

          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() =>
              setNotice("")
            }
          >
            <X size={16} />
          </button>
        </div>
      )}

    </div>
  );
}
