
import { useEffect, useState } from "react";
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

export default function DataCheck() {
  // PostgreSQL table list
  const [tables, setTables] = useState([]);
  const [databaseName, setDatabaseName] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [loadingTables, setLoadingTables] = useState(true);
  const [tableError, setTableError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // Real masked preview
  const [preview, setPreview] = useState({
    columns: [],
    rows: []
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Real deterministic validation
  const [validation, setValidation] = useState(null);
  const [validationLoading, setValidationLoading] =
    useState(false);
  const [validationError, setValidationError] = useState("");

  // Existing interface
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("sql");
  const [sql, setSql] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [aiOpen, setAiOpen] = useState(true);
  const [notice, setNotice] = useState("");

  // 1. Load real PostgreSQL tables
  useEffect(() => {
    const controller = new AbortController();

    async function loadTables() {
      setLoadingTables(true);
      setTableError("");

      try {
        const response = await fetch(
          "/api/v1/database/tables",
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (
          data.status !== "success" ||
          !Array.isArray(data.tables)
        ) {
          throw new Error("Invalid table response");
        }

        if (controller.signal.aborted) return;

        setTables(data.tables);
        setDatabaseName(data.database || "customer_db");

        setSelectedTable((previous) =>
          data.tables.includes(previous)
            ? previous
            : data.tables.includes("customers")
              ? "customers"
              : data.tables[0] || ""
        );
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

  // 2. Load real masked preview
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
          `/api/v1/database/tables/` +
          `${encodeURIComponent(selectedTable)}/preview?limit=20`;

        const response = await fetch(url, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (
          data.status !== "success" ||
          data.masked !== true ||
          !Array.isArray(data.columns) ||
          !Array.isArray(data.rows)
        ) {
          throw new Error("Invalid masked preview response");
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

  // 3. Load real deterministic validation
  useEffect(() => {
    const controller = new AbortController();

    setValidation(null);
    setValidationError("");

    if (selectedTable !== "customers") {
      setValidationLoading(false);
      return () => controller.abort();
    }

    async function loadValidation() {
      setValidationLoading(true);

      try {
        const response = await fetch(
          "/api/v1/validation/customers",
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(
            `Validation API returned HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (
          data.table !== "customers" ||
          !["completed", "no_data"].includes(data.status) ||
          data.ai_used !== false
        ) {
          throw new Error("Invalid validation response");
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

  // 4. Update SQL text when changing tables
  useEffect(() => {
    setSql(exampleSQL(selectedTable));
  }, [selectedTable]);

  const filteredTables = tables.filter((table) =>
    table.toLowerCase().includes(search.toLowerCase())
  );

  const validationReady =
    selectedTable === "customers" &&
    validation?.status === "completed";

  const qualityScore = validationReady
    ? validation.quality_score
    : null;

  const scoreText =
    qualityScore === null ? "—" : `${qualityScore}%`;

  function showNotice(message) {
    setNotice(message);
  }

  function runSQL() {
    showNotice(
      "SQL execution is not enabled yet. " +
      "The secure read-only SQL engine will be added later."
    );
  }

  function investigate() {
    setAiOpen(true);

    showNotice(
      "Ollama + Qwen investigation is not connected yet. " +
      "Python and SQL perform the routine checks."
    );
  }

  function sendQuestion(event) {
    event.preventDefault();

    const text = question.trim();
    if (!text) return;

    setMessages((previous) => [
      ...previous,
      { role: "user", content: text }
    ]);

    setQuestion("");

    showNotice(
      "Question saved locally. No request was sent to AI."
    );
  }

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
        {/* LEFT: DATABASE TABLES */}
        <section className="dc-panel dc-source-panel">
          <div className="dc-section-heading">
            Data Source
          </div>

          <select
            className="dc-source-select"
            value={databaseName || "loading"}
            aria-label="Database source"
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
            <p className="dc-empty">Loading tables...</p>
          )}

          {tableError && (
            <div className="dc-empty" role="alert">
              <p>{tableError}</p>
              <button
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
                  key={table}
                  className={
                    selectedTable === table
                      ? "dc-table-item selected"
                      : "dc-table-item"
                  }
                  onClick={() => setSelectedTable(table)}
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

        {/* MIDDLE: SQL AND VALIDATION */}
        <section className="dc-middle-column">
          <div className="dc-panel dc-editor-panel">
            <div className="dc-editor-toolbar">
              <div className="dc-tabs">
                <button
                  className={
                    activeTab === "sql" ? "active" : ""
                  }
                  onClick={() => setActiveTab("sql")}
                >
                  SQL Editor
                </button>

                <button
                  className={
                    activeTab === "preview" ? "active" : ""
                  }
                  onClick={() => setActiveTab("preview")}
                >
                  Data Preview
                </button>
              </div>

              <button
                className="dc-run-button"
                onClick={runSQL}
              >
                <Play size={14} fill="currentColor" />
                Run
              </button>
            </div>

            {activeTab === "sql" ? (
              <div className="dc-sql-content">
                <textarea
                  aria-label="SQL Editor"
                  spellCheck={false}
                  value={sql}
                  onChange={(event) =>
                    setSql(event.target.value)
                  }
                  placeholder="Select a table..."
                />
              </div>
            ) : (
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
                  <div className="dc-preview-scroll">
                    <table className="dc-preview-table">
                      <thead>
                        <tr>
                          {preview.columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row, index) => (
                          <tr key={index}>
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

                    {preview.rows.length === 0 && (
                      <p className="dc-empty">
                        No records available.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* REAL VALIDATION RESULTS */}
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

            {selectedTable !== "customers" && (
              <p className="dc-empty">
                Validation rules for this table
                have not been configured yet.
              </p>
            )}

            {selectedTable === "customers" &&
              validation?.status === "no_data" && (
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
                value={
                  validationReady
                    ? validation.missing
                    : null
                }
                kind="missing"
              />

              <ValidationCard
                label="Duplicates"
                value={
                  validationReady
                    ? validation.duplicates
                    : null
                }
                kind="duplicates"
              />

              <ValidationCard
                label="Invalid"
                value={
                  validationReady
                    ? validation.invalid
                    : null
                }
                kind="invalid"
              />
            </div>

            <div className="dc-result-footer">
              <button
                className="dc-investigate-button"
                onClick={investigate}
              >
                <Bot size={19} />
                Investigate with AI
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT: SHARED AI GUARDIAN */}
        {aiOpen ? (
          <section className="dc-panel dc-ai-panel">
            <div className="dc-ai-header">
              <Bot size={19} />
              <strong>AI Guardian (Shared)</strong>
              <button
                className="dc-ai-close"
                aria-label="Close AI panel"
                onClick={() => setAiOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="dc-ai-conversation">
              <div className="dc-user-bubble">
                Read the customers data and
                summarize the issues.
              </div>

              <div className="dc-ai-bubble">
                <div className="dc-ai-bubble-title">
                  <Bot size={16} />
                  AI Guardian
                </div>

                <p>
                  PostgreSQL data discovery,
                  masked previews and customer
                  validation are connected.
                </p>

                <p>
                  AI investigation will be enabled
                  using the centralized local
                  Ollama + Qwen agent.
                </p>

                <div className="dc-ai-note">
                  <ShieldCheck size={15} />
                  Deterministic checks run without AI.
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