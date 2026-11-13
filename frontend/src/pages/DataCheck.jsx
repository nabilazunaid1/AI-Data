
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

import "../styles/data-check.css";

// =====================================================
// AI DATA GUARDIAN 3.0 — DATA CHECK
//
// Live features:
// - PostgreSQL table discovery
// - Masked database preview
// - Deterministic validation for five tables
// - Secure read-only SQL execution
// - Masked SQL query results
//
// Future feature:
// - Shared Ollama + Qwen AI investigation
// =====================================================

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

export default function DataCheck() {

  // ===================================================
  // POSTGRESQL DATA SOURCE
  // ===================================================

  const [tables, setTables] = useState([]);
  const [databaseName, setDatabaseName] = useState("");
  const [selectedTable, setSelectedTable] = useState("");

  const [loadingTables, setLoadingTables] = useState(true);
  const [tableError, setTableError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // ===================================================
  // MASKED DATA PREVIEW
  // ===================================================

  const [preview, setPreview] = useState({
    columns: [],
    rows: []
  });

  const [previewLoading, setPreviewLoading] =
    useState(false);

  const [previewError, setPreviewError] = useState("");

  // ===================================================
  // DETERMINISTIC VALIDATION
  // ===================================================

  const [validation, setValidation] = useState(null);

  const [validationLoading, setValidationLoading] =
    useState(false);

  const [validationError, setValidationError] =
    useState("");

  // ===================================================
  // SECURE SQL EXECUTION
  // ===================================================

  const [sql, setSql] = useState("");
  const [sqlResult, setSqlResult] = useState(null);

  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlError, setSqlError] = useState("");

  const sqlControllerRef = useRef(null);

  // ===================================================
  // UI STATE
  // ===================================================

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("sql");

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);

  const [aiOpen, setAiOpen] = useState(true);
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
            `Unable to retrieve tables: HTTP ${response.status}`
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
        setDatabaseName(data.database || "customer_db");

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
          !["completed", "no_data"].includes(data.status) ||
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
  // CHANGE THE SAMPLE SQL WHEN TABLE CHANGES
  // ===================================================

  useEffect(() => {
    setSql(exampleSQL(selectedTable));
    setSqlResult(null);
    setSqlError("");
    setActiveTab("sql");

    if (sqlControllerRef.current) {
      sqlControllerRef.current.abort();
      sqlControllerRef.current = null;
    }

    setSqlLoading(false);
  }, [selectedTable]);

  // Abort pending SQL requests on unmount.
  useEffect(() => {
    return () => {
      if (sqlControllerRef.current) {
        sqlControllerRef.current.abort();
      }
    };
  }, []);

  // ===================================================
  // EXECUTE SECURE SQL THROUGH FASTAPI
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
          body: JSON.stringify({
            query
          }),
          signal: controller.signal
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : `SQL execution failed: HTTP ${response.status}`;

        throw new Error(detail);
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
  // DERIVED VALUES
  // ===================================================

  const filteredTables = tables.filter((table) =>
    table.toLowerCase().includes(search.toLowerCase())
  );

  const validationReady =
    validation?.status === "completed" &&
    validation?.table === selectedTable &&
    !validationLoading &&
    !validationError;

  const qualityScore = validationReady
    ? validation.quality_score
    : null;

  const scoreText =
    qualityScore === null
      ? "—"
      : `${qualityScore}%`;

  // ===================================================
  // OTHER USER ACTIONS
  // ===================================================

  function selectTable(table) {
    setSelectedTable(table);
    setNotice("");
  }

  function investigate() {
    setAiOpen(true);

    setNotice(
      "AI investigation will be enabled when " +
      "the centralized Ollama + Qwen agent is connected."
    );
  }

  function sendQuestion(event) {
    event.preventDefault();

    const text = question.trim();

    if (!text) return;

    setMessages((previous) => [
      ...previous,
      {
        role: "user",
        content: text
      }
    ]);

    setQuestion("");

    setNotice(
      "Question saved locally. " +
      "No Ollama request has been sent."
    );
  }

  // ===================================================
  // DATA CHECK UI
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

        {/* ============================================
            LEFT COLUMN — DATA SOURCE
        ============================================ */}

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
              <p>Unable to retrieve tables.</p>
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
                  onClick={() => selectTable(table)}
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

        {/* ============================================
            MIDDLE COLUMN — SQL / PREVIEW / RESULTS
        ============================================ */}

        <section className="dc-middle-column">

          <div className="dc-panel dc-editor-panel">

            <div className="dc-editor-toolbar">

              <div className="dc-tabs">

                <button
                  type="button"
                  className={
                    activeTab === "sql" ? "active" : ""
                  }
                  onClick={() => setActiveTab("sql")}
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
                  onClick={() => setActiveTab("preview")}
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
                    onClick={() => setActiveTab("results")}
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

            {/* SQL EDITOR */}

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

            {/* MASKED POSTGRESQL PREVIEW */}

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

            {/* SECURE SQL RESULTS */}

            {activeTab === "results" && (
              <div className="dc-preview-content">

                {sqlLoading && (
                  <p className="dc-empty">
                    Executing secure read-only SQL...
                  </p>
                )}

                {sqlError && (
                  <div className="dc-empty" role="alert">
                    <p>SQL execution failed</p>
                    <p>{sqlError}</p>
                  </div>
                )}

                {sqlResult && !sqlLoading && (
                  <>
                    <div className="dc-preview-info">
                      <ShieldCheck size={15} />
                      SQL Results — Read-only,
                      PII masked, {sqlResult.returned_rows} rows
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

          {/* ==========================================
              VALIDATION RESULT
          ========================================== */}

          <div className="dc-panel dc-result-panel">

            <div className="dc-section-heading">
              Validation Result
            </div>

            {validationLoading && (
              <p className="dc-empty">
                Running deterministic SQL validation...
              </p>
            )}

            {validationError && (
              <p className="dc-empty" role="alert">
                Validation unavailable: {validationError}
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
              >
                <Bot size={19} />
                Investigate with AI
              </button>

            </div>
          </div>
        </section>

        {/* ============================================
            RIGHT COLUMN — SHARED AI GUARDIAN
        ============================================ */}

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

              <div className="dc-user-bubble">
                Read the selected table and summarize
                the data quality issues.
              </div>

              <div className="dc-ai-bubble">

                <div className="dc-ai-bubble-title">
                  <Bot size={16} />
                  AI Guardian
                </div>

                <p>
                  PostgreSQL table discovery,
                  masked previews, validation
                  and secure SQL execution are connected.
                </p>

                <p>
                  All five tables can be checked
                  using deterministic Python and SQL.
                </p>

                <p>
                  Ollama + Qwen investigation will
                  be enabled in a later step.
                </p>

                <div className="dc-ai-note">
                  <ShieldCheck size={15} />
                  Routine checks run without AI.
                </div>

              </div>

              {messages.map((message, index) => (
                <div
                  key={index}
                  className="dc-user-bubble"
                >
                  {message.content}
                </div>
              ))}

            </div>

            <form
              className="dc-ai-input-area"
              onSubmit={sendQuestion}
            >

              <input
                aria-label="Ask AI Guardian"
                placeholder="Ask a question..."
                value={question}
                onChange={(event) =>
                  setQuestion(event.target.value)
                }
              />

              <button
                type="submit"
                aria-label="Submit question"
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
