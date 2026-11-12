
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

// Temporary validation results.
// These will be replaced by Python validation APIs.
const demoResults = {
  customers: {
    score: 94,
    missing: 3,
    duplicates: 2,
    invalid: 4
  },
  transactions: {
    score: 97,
    missing: 1,
    duplicates: 1,
    invalid: 2
  },
  products: {
    score: 99,
    missing: 0,
    duplicates: 1,
    invalid: 0
  },
  dim_region: {
    score: 100,
    missing: 0,
    duplicates: 0,
    invalid: 0
  },
  etl_logs: {
    score: 96,
    missing: 2,
    duplicates: 0,
    invalid: 1
  }
};

const emptyResults = {
  score: 0,
  missing: 0,
  duplicates: 0,
  invalid: 0
};

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

      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function DataCheck() {
  // Real PostgreSQL table information
  const [tables, setTables] = useState([]);
  const [databaseName, setDatabaseName] = useState("");
  const [selectedTable, setSelectedTable] = useState("");

  const [loadingTables, setLoadingTables] = useState(true);
  const [tableError, setTableError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // Real masked Data Preview
  const [preview, setPreview] = useState({
    columns: [],
    rows: []
  });

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Existing UI state
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("sql");
  const [sql, setSql] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [aiOpen, setAiOpen] = useState(true);
  const [notice, setNotice] = useState("");

  // STEP 1: Retrieve real PostgreSQL tables.
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
          throw new Error(
            `Server returned HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (
          data.status !== "success" ||
          !Array.isArray(data.tables)
        ) {
          throw new Error(
            "Unable to retrieve PostgreSQL tables"
          );
        }

        setTables(data.tables);
        setDatabaseName(data.database || "customer_db");

        setSelectedTable((previous) => {
          return data.tables.includes(previous)
            ? previous
            : (data.tables[0] || "");
        });

      } catch (error) {
        if (error.name === "AbortError") return;

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

  // STEP 2: Retrieve real, masked records.
  useEffect(() => {
    if (!selectedTable) {
      setPreview({ columns: [], rows: [] });
      setPreviewError("");
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadPreview() {
      setPreviewLoading(true);
      setPreviewError("");
      setPreview({ columns: [], rows: [] });

      try {
        const url =
          `/api/v1/database/tables/` +
          `${encodeURIComponent(selectedTable)}/preview?limit=20`;

        const response = await fetch(url, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(
            `Preview request failed: HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (
          data.status !== "success" ||
          data.masked !== true ||
          !Array.isArray(data.columns) ||
          !Array.isArray(data.rows)
        ) {
          throw new Error(
            "Invalid or unmasked preview response"
          );
        }

        setPreview({
          columns: data.columns,
          rows: data.rows
        });

      } catch (error) {
        if (error.name === "AbortError") return;

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

  // Generate example SQL for the selected table.
  useEffect(() => {
    setSql(exampleSQL(selectedTable));
  }, [selectedTable]);

  const result = demoResults[selectedTable] || emptyResults;

  const filteredTables = tables.filter((table) =>
    table.toLowerCase().includes(search.toLowerCase())
  );

  const selectTable = (table) => {
    setSelectedTable(table);
    setNotice("");
  };

  const runSQL = () => {
    setNotice(
      "Read-only SQL execution will be added " +
      "after the validation engine is ready."
    );
  };

  const investigate = () => {
    setAiOpen(true);
    setNotice(
      "Shared Ollama + Qwen investigation will " +
      "be connected in the AI integration step."
    );
  };

  const sendQuestion = (event) => {
    event.preventDefault();

    if (!question.trim()) return;

    setMessages((previous) => [
      ...previous,
      { role: "user", content: question.trim() }
    ]);

    setQuestion("");

    setNotice(
      "Question saved locally. " +
      "No request was sent to Ollama."
    );
  };

  return (
    <div className="dc-page">

      <div className="dc-intro">
        <div>
          <h1>Data Check</h1>
          <p>
            Validate data, run SQL, and investigate issues
          </p>
        </div>

        <span className="dc-demo-indicator">
          <Info size={13} />
          Validation: Demo
        </span>
      </div>

      <div className="dc-workspace">

        {/* LEFT: POSTGRESQL TABLES */}
        <section className="dc-panel dc-source-panel">
          <div className="dc-section-heading">
            Data Source
          </div>

          <select
            className="dc-source-select"
            value={databaseName || "loading"}
            onChange={() => {}}
            aria-label="Database source"
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
              <p>Unable to load tables.</p>
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

        {/* MIDDLE: SQL EDITOR AND DATA PREVIEW */}
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
                  placeholder="Select a PostgreSQL table..."
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
                            <th key={column}>
                              {column}
                            </th>
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

          {/* VALIDATION: DEMO FOR NOW */}
          <div className="dc-panel dc-result-panel">
            <div className="dc-section-heading">
              Validation Result (Demo)
            </div>

            <div className="dc-result-grid">

              <div className="dc-quality-result">
                <div
                  className="dc-quality-ring"
                  style={{
                    background: `conic-gradient(
                      #49e2bf ${result.score}%,
                      #34435b 0
                    )`
                  }}
                >
                  <div className="dc-quality-center">
                    <strong>{result.score}%</strong>
                    <span>Demo Score</span>
                  </div>
                </div>
              </div>

              <ValidationCard
                label="Missing"
                value={result.missing}
                kind="missing"
              />

              <ValidationCard
                label="Duplicates"
                value={result.duplicates}
                kind="duplicates"
              />

              <ValidationCard
                label="Invalid"
                value={result.invalid}
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

        {/* RIGHT: SHARED OLLAMA AI GUARDIAN */}
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
                  PostgreSQL table discovery and
                  masked Data Preview are connected.
                </p>

                <p>
                  AI investigation will be enabled
                  when Ollama + Qwen is connected.
                </p>

                <div className="dc-ai-note">
                  <ShieldCheck size={15} />
                  One local agent. On-demand only.
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
