
import { useState } from "react";
import {
  Database,
  Table2,
  Search,
  Play,
  Bot,
  Send,
  X,
  AlertTriangle,
  Info,
  ShieldCheck,
  FileSearch,
  CheckCircle2
} from "lucide-react";

import "../styles/data-check.css";

// Temporary examples for the frontend design.
// Actual tables and results will come from PostgreSQL.

const demoTables = [
  "customers",
  "transactions",
  "products",
  "dim_region",
  "etl_logs"
];

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

const demoPreview = {
  customers: {
    columns: ["customer_id", "name", "email", "status"],
    rows: [
      ["C001", "Customer A", "a***@example.com", "Active"],
      ["C002", "Customer B", "—", "Active"],
      ["C003", "Customer C", "c***@example.com", "Inactive"]
    ]
  },
  transactions: {
    columns: ["transaction_id", "customer_id", "amount", "status"],
    rows: [
      ["T001", "C001", "150.00", "Completed"],
      ["T002", "C002", "85.50", "Pending"]
    ]
  },
  products: {
    columns: ["product_id", "product_name", "category"],
    rows: [
      ["P001", "Product A", "Electronics"],
      ["P002", "Product B", "Accessories"]
    ]
  },
  dim_region: {
    columns: ["region_id", "region_name"],
    rows: [
      ["R001", "North"],
      ["R002", "South"]
    ]
  },
  etl_logs: {
    columns: ["run_id", "pipeline", "status"],
    rows: [
      ["RUN001", "Customer ETL", "Completed"],
      ["RUN002", "Transaction ETL", "Completed"]
    ]
  }
};

function getExampleSQL(table) {
  return `SELECT *
FROM ${table}
LIMIT 100;`;
}

function ValidationCard({ label, value, kind }) {
  return (
    <div className="dc-validation-card">
      <div className={`dc-validation-icon ${kind}`}>
        {kind === "missing" && <AlertTriangle size={18} />}
        {kind === "duplicates" && <AlertTriangle size={18} />}
        {kind === "invalid" && <Info size={18} />}
      </div>

      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function DataCheck() {
  const [selectedTable, setSelectedTable] =
    useState("customers");

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("sql");
  const [sql, setSql] = useState(getExampleSQL("customers"));
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [aiOpen, setAiOpen] = useState(true);
  const [notice, setNotice] = useState("");

  const result = demoResults[selectedTable];
  const preview = demoPreview[selectedTable];

  const filteredTables = demoTables.filter((table) =>
    table.toLowerCase().includes(search.toLowerCase())
  );

  const selectTable = (table) => {
    setSelectedTable(table);
    setSql(getExampleSQL(table));
    setNotice("");
  };

  const runSQL = () => {
    setNotice(
      "SQL execution is not available yet. " +
      "We will connect the read-only PostgreSQL " +
      "query service in Step 6.4."
    );
  };

  const investigate = () => {
    setAiOpen(true);
    setNotice(
      "AI investigation is not connected yet. " +
      "The shared Ollama + Qwen agent will be " +
      "integrated in Step 6.5."
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
      "Question saved in this preview. " +
      "No AI request was sent yet."
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
          Demo data
        </span>
      </div>

      <div className="dc-workspace">
        {/* LEFT COLUMN: DATA SOURCE */}
        <section className="dc-panel dc-source-panel">
          <div className="dc-section-heading">
            Data Source
          </div>

          <select
            className="dc-source-select"
            value="demo"
            onChange={() => {}}
            aria-label="Data source"
          >
            <option value="demo">
              PostgreSQL — customer_db (Demo)
            </option>
          </select>

          <div className="dc-section-divider" />

          <div className="dc-section-heading">
            Tables ({demoTables.length})
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
        </section>

        {/* MIDDLE COLUMN: SQL + RESULTS */}
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
                title="SQL execution will be connected later"
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
                />
              </div>
            ) : (
              <div className="dc-preview-content">
                <div className="dc-preview-info">
                  <FileSearch size={15} />
                  Masked sample data — demo
                </div>

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
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="dc-panel dc-result-panel">
            <h2>Validation Result</h2>

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
                    <span>Quality Score</span>
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

        {/* RIGHT COLUMN: SHARED AI AGENT */}
        {aiOpen && (
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
                  AI analysis will appear here
                  after Ollama + Qwen is connected.
                </p>

                <p>
                  The current validation numbers
                  are demonstration data.
                </p>

                <div className="dc-ai-note">
                  <ShieldCheck size={15} />
                  One shared local agent.
                  No automatic AI calls.
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
        )}

        {!aiOpen && (
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
