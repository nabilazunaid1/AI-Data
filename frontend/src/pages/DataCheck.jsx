
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

import "../styles/data-check.css";

// =====================================================
// AI DATA GUARDIAN 3.0 — DATA CHECK
//
// LIVE FEATURES
// - PostgreSQL table discovery
// - Masked database preview
// - Deterministic validation for five tables
// - Secure read-only SQL execution
// - Masked SQL results
// - On-demand AI investigation
// - On-demand AI Guardian chat
//
// Local Ollama model: gemma3:1b
//
// Only aggregate validation context is supplied
// automatically to the AI model.
// Chat questions are sent as entered.
// =====================================================

function exampleSQL(table) {
  if (!table) return "";

  return `SELECT *
FROM ${table}
LIMIT 100;`;
}

// =====================================================
// VALIDATION CARD
// =====================================================

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

// =====================================================
// REUSABLE DATA TABLE
// =====================================================

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
                  {cell === null ? "NULL" : String(cell)}
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
// MAIN DATA CHECK COMPONENT
// =====================================================

export default function DataCheck() {

  // ---------------------------------------------------
  // POSTGRESQL DATA SOURCE
  // ---------------------------------------------------

  const [tables, setTables] = useState([]);
  const [databaseName, setDatabaseName] = useState("");
  const [selectedTable, setSelectedTable] = useState("");

  const [loadingTables, setLoadingTables] = useState(true);
  const [tableError, setTableError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // ---------------------------------------------------
  // MASKED PREVIEW
  // ---------------------------------------------------

  const [preview, setPreview] = useState({
    columns: [],
    rows: []
  });

  const [previewLoading, setPreviewLoading] =
    useState(false);

  const [previewError, setPreviewError] = useState("");

  // ---------------------------------------------------
  // DETERMINISTIC VALIDATION
  // ---------------------------------------------------

  const [validation, setValidation] = useState(null);

  const [validationLoading, setValidationLoading] =
    useState(false);

  const [validationError, setValidationError] =
    useState("");

  // ---------------------------------------------------
  // SQL EDITOR
  // ---------------------------------------------------

  const [sql, setSql] = useState("");
  const [sqlResult, setSqlResult] = useState(null);

  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlError, setSqlError] = useState("");

  const sqlControllerRef = useRef(null);

  // ---------------------------------------------------
  // AI GUARDIAN
  // ---------------------------------------------------

  const [aiOpen, setAiOpen] = useState(true);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const [aiInvestigation, setAiInvestigation] =
    useState(null);

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);

  const [chatLoading, setChatLoading] = useState(false);

  // One shared controller for investigation and chat.
  // Prevents overlapping model requests from React.
  const aiControllerRef = useRef(null);
  const aiRequestIdRef = useRef(0);

  // ---------------------------------------------------
  // OTHER UI STATE
  // ---------------------------------------------------

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("sql");
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
  // LOAD MASKED DATA PREVIEW
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
  // RESET WORKSPACE WHEN TABLE CHANGES
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

    // Invalidate an outstanding AI response.
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
    setNotice("");

  }, [selectedTable]);

  // ===================================================
  // CLEAN UP WHEN DATA CHECK UNMOUNTS
  // ===================================================

  useEffect(() => {
    return () => {
      if (sqlControllerRef.current) {
        sqlControllerRef.current.abort();
      }

      if (aiControllerRef.current) {
        aiControllerRef.current.abort();
      }

      aiRequestIdRef.current += 1;
    };
  }, []);

  // ===================================================
  // EXECUTE SECURE READ-ONLY SQL
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

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "SQL service returned an invalid response."
        );
      }

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
  // ON-DEMAND AI INVESTIGATION
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
        "Please complete PostgreSQL validation " +
        "before requesting AI investigation."
      );

      return;
    }

    setAiOpen(true);
    setAiError("");
    setNotice("");

    const controller = new AbortController();
    const requestId = ++aiRequestIdRef.current;

    aiControllerRef.current = controller;

    const tableToInvestigate = selectedTable;

    setAiLoading(true);
    setAiInvestigation(null);

    try {
      const result = await investigateTable(
        tableToInvestigate,
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
        "Local AI investigation is unavailable."
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
  // LIVE AI GUARDIAN CHAT
  // ===================================================

  async function sendQuestion(event) {
    event.preventDefault();

    const text = question.trim();

    if (!text) {
      setNotice("Please enter a question.");
      return;
    }

    if (text.length > 500) {
      setNotice(
        "Your question must be 500 characters or fewer."
      );
      return;
    }

    // One model request at a time to conserve RAM.
    if (chatLoading || aiLoading) return;

    if (
      !selectedTable ||
      !validation ||
      validation.table !== selectedTable ||
      validation.status !== "completed" ||
      validationLoading ||
      validationError
    ) {
      setNotice(
        "Please select a table and complete " +
        "data validation before asking AI Guardian."
      );
      return;
    }

    const tableForQuestion = selectedTable;

    const controller = new AbortController();
    const requestId = ++aiRequestIdRef.current;

    aiControllerRef.current = controller;

    setChatLoading(true);
    setAiOpen(true);
    setAiError("");
    setNotice("");
    setQuestion("");

    // Add the submitted question immediately.
    setMessages((previous) => [
      ...previous,
      {
        id: requestId,
        role: "user",
        content: text
      }
    ]);

    try {
      // One real FastAPI -> Ollama request.
      // No previous chat history is sent.
      const result = await askGuardianQuestion(
        tableForQuestion,
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
            "AI Guardian could not answer this question."
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

  const scoreText =
    qualityScore === null
      ? "—"
      : `${qualityScore}%`;

  const modelBusy = aiLoading || chatLoading;

  // ===================================================
  // USER ACTIONS
  // ===================================================

  function selectTable(table) {
    if (table === selectedTable) return;

    setSelectedTable(table);
  }

  // ===================================================
  // DATA CHECK UI — ORIGINAL DESIGN
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
            MIDDLE COLUMN — SQL WORKSPACE
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

            {/* MASKED DATA PREVIEW */}

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

            {/* SQL RESULTS */}

            {activeTab === "results" && (
              <div className="dc-preview-content">

                {sqlLoading && (
                  <p className="dc-empty">
                    Executing secure read-only SQL...
                  </p>
                )}

                {sqlError && (
                  <div
                    className="dc-empty"
                    role="alert"
                  >
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
                disabled={
                  modelBusy ||
                  !validationReady
                }
                aria-busy={modelBusy}
              >
                <Bot size={19} />

                {aiLoading
                  ? "Investigating..."
                  : "Investigate with AI"}
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

              {/* INITIAL INFORMATION */}

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
                  Select a PostgreSQL table, click
                  Investigate with AI, or ask a question
                  about its data quality results.
                </p>

                <div className="dc-ai-note">
                  <ShieldCheck size={15} />
                  AI runs only when you request it.
                </div>

              </div>

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

              {/* LIVE INVESTIGATION RESPONSE */}

              {aiInvestigation && !aiLoading && (
                <>
                  <div className="dc-user-bubble">
                    Investigate data quality issues in
                    {" "}{aiInvestigation.table}.
                  </div>

                  <div className="dc-ai-bubble">

                    <div className="dc-ai-bubble-title">
                      <Bot size={16} />
                      AI Guardian — {aiInvestigation.model}
                    </div>

                    {aiInvestigation.summary && (
                      <p>
                        <strong>Verified SQL summary:</strong>
                        {" "}
                        {aiInvestigation.summary.quality_score}%
                        {" "}quality score,
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
                      <ShieldCheck size={15} />
                      {aiInvestigation.disclaimer}
                    </div>

                  </div>
                </>
              )}

              {/* LIVE CHAT MESSAGES */}

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

                      <div className="dc-ai-note">
                        <Info size={15} />
                        PostgreSQL validation and SQL
                        execution remain available.
                      </div>
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
                        <strong>Verified SQL summary:</strong>
                        {" "}
                        {message.summary.quality_score}%
                        {" "}quality score,
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
                      <ShieldCheck size={15} />
                      {message.disclaimer}
                    </div>
                  </div>
                );

              })}

              {/* CHAT LOADING */}

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
                    Generating a response using
                    local Ollama...
                  </p>
                </div>
              )}

            </div>

            {/* EXISTING CHAT INPUT — NOW FUNCTIONAL */}

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

      {/* EXISTING NOTIFICATION */}

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
