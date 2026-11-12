
import { useState } from "react";

import {
  ShieldCheck,
  House,
  Database,
  Workflow,
  ChartNoAxesCombined,
  Settings,
  Bot,
  Bell,
  AlertTriangle,
  Clock3,
  CheckCircle2,
  RefreshCw,
  FileText,
  X,
  Info,
  Activity
} from "lucide-react";

import DataCheck from "./pages/DataCheck.jsx";
import "./styles/home-extras.css";

// DEMO DATA FOR HOME
const quality = [
  { label: "Completeness", value: 97 },
  { label: "Uniqueness", value: 98 },
  { label: "Validity", value: 94 },
  { label: "Consistency", value: 93 }
];

const activity = [
  {
    icon: CheckCircle2,
    type: "success",
    label: "Data check completed",
    time: "10:24 AM"
  },
  {
    icon: AlertTriangle,
    type: "warning",
    label: "3 issues detected (customers)",
    time: "10:24 AM"
  },
  {
    icon: RefreshCw,
    type: "cyan",
    label: "Pipeline run (N2N) completed",
    time: "09:50 AM"
  },
  {
    icon: FileText,
    type: "plain",
    label: "Report generated",
    time: "09:45 AM"
  }
];

const navigation = [
  { name: "Home", icon: House },
  { name: "Data Check", icon: Database },
  { name: "Pipeline", icon: Workflow },
  { name: "Reports", icon: ChartNoAxesCombined }
];

const services = [
  "PostgreSQL",
  "Python Backend",
  "Express Middleware",
  "Ollama"
];

const issues = [
  { label: "Missing Values", count: 1, color: "red" },
  { label: "Duplicates", count: 1, color: "yellow" },
  { label: "Invalid Data", count: 1, color: "blue" }
];

const trend7 = [88, 89, 88, 91, 92, 93, 94];

const trend30 = [
  82, 83, 82, 84, 85, 84, 86, 87, 86, 88,
  87, 88, 89, 88, 90, 89, 90, 91, 90, 91,
  92, 91, 92, 93, 92, 93, 93, 94, 93, 94
];

const pageDescriptions = {
  Home: "System Overview & Data Health",
  "Data Check": "Validate data, run SQL, and investigate issues",
  Pipeline: "End-to-end (N2N) data validation and change detection",
  Reports: "View, download, and manage data quality reports"
};

// ORIGINAL HOME: DATA QUALITY TREND
function QualityTrend() {
  const [period, setPeriod] = useState(7);
  const values = period === 7 ? trend7 : trend30;

  const width = 600;
  const height = 115;
  const top = 12;
  const bottom = 18;
  const min = 80;
  const max = 100;

  const coordinates = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y =
      top +
      ((max - value) / (max - min)) *
      (height - top - bottom);

    return { x, y, value };
  });

  const path = coordinates
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
    )
    .join(" ");

  const area = `${path} L ${width} ${height} L 0 ${height} Z`;

  const labels =
    period === 7
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : [
          "Day 1",
          "Day 5",
          "Day 10",
          "Day 15",
          "Day 20",
          "Day 25",
          "Day 30"
        ];

  return (
    <article className="panel trend-panel">
      <div className="extra-panel-heading">
        <div>
          <h2>Data Quality Trend</h2>
          <span className="extra-subtitle">
            Historical quality score (demo)
          </span>
        </div>

        <div className="trend-controls">
          <button
            className={period === 7 ? "selected" : ""}
            onClick={() => setPeriod(7)}
          >
            7 Days
          </button>

          <button
            className={period === 30 ? "selected" : ""}
            onClick={() => setPeriod(30)}
          >
            30 Days
          </button>
        </div>
      </div>

      <div
        className="trend-chart"
        role="img"
        aria-label={`Demo data quality trend over ${period} days`}
      >
        <div className="trend-y-axis">
          <span>100%</span>
          <span>90%</span>
          <span>80%</span>
        </div>

        <div className="trend-graph">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="qualityGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#4be3c3"
                  stopOpacity="0.23"
                />
                <stop
                  offset="100%"
                  stopColor="#4be3c3"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>

            {[80, 90, 100].map((score) => {
              const y =
                top +
                ((max - score) / (max - min)) *
                (height - top - bottom);

              return (
                <line
                  key={score}
                  x1="0"
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke="#34425b"
                  strokeDasharray="4 5"
                />
              );
            })}

            <path d={area} fill="url(#qualityGradient)" />

            <path
              d={path}
              fill="none"
              stroke="#4be3c3"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {coordinates
              .filter((_, index) =>
                period === 7 ||
                index % 5 === 0 ||
                index === coordinates.length - 1
              )
              .map((point, index) => (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill="#4be3c3"
                  stroke="#152035"
                  strokeWidth="1.5"
                />
              ))}
          </svg>

          <div className="trend-x-axis">
            {labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="trend-footer">
        <span>Latest Quality Score</span>
        <strong>94%</strong>
      </div>
    </article>
  );
}

// ORIGINAL HOME: SYSTEM HEALTH
function SystemHealth() {
  return (
    <article className="panel system-health-panel">
      <div className="extra-panel-heading">
        <h2>
          <Activity
            size={18}
            className="health-title-icon"
          />
          System Health
        </h2>

        <span className="extra-subtitle">
          Service status
        </span>
      </div>

      <div className="service-list">
        {services.map((service) => (
          <div className="service-row" key={service}>
            <span className="service-name">
              {service}
            </span>

            <span className="service-status">
              <span className="service-status-dot" />
              Not checked
            </span>
          </div>
        ))}
      </div>

      <div className="extra-footnote">
        Live health checks will be enabled during API integration.
      </div>
    </article>
  );
}

// ORIGINAL HOME: ISSUES BREAKDOWN
function IssuesBreakdown() {
  const total = issues.reduce(
    (sum, item) => sum + item.count,
    0
  );

  return (
    <article className="panel issues-panel">
      <div className="extra-panel-heading">
        <h2>
          <AlertTriangle
            size={18}
            className="issues-title-icon"
          />
          Issues Breakdown
        </h2>

        <span className="extra-subtitle">
          Latest check (demo)
        </span>
      </div>

      <div className="issues-total">
        <strong>{total}</strong>
        <span>Total detected issues</span>
      </div>

      <div className="issue-breakdown-list">
        {issues.map((issue) => (
          <div
            className="issue-breakdown-row"
            key={issue.label}
          >
            <div className="issue-breakdown-label">
              <span
                className={`issue-color-dot ${issue.color}`}
              />
              {issue.label}
            </div>

            <strong>{issue.count}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

// HOME PAGE: ALL PREVIOUS FEATURES PRESERVED
function Home() {
  return (
    <div className="dashboard">
      <div className="demo-label">
        <Info size={14} />
        Demo data — live services will be connected later
      </div>

      <section className="metrics-grid">
        <article className="metric-card score-card">
          <div className="score-circle">
            <div className="score-center">
              <strong>94%</strong>
            </div>
          </div>

          <div className="score-description">
            <strong>Data Quality</strong>
            <span>Score</span>
          </div>
        </article>

        <article className="metric-card">
          <AlertTriangle
            className="metric-icon issues-icon"
            size={27}
          />
          <strong className="metric-value">3</strong>
          <span className="metric-label">Issues</span>
        </article>

        <article className="metric-card">
          <Database
            className="metric-icon database-icon"
            size={27}
          />
          <strong className="metric-value">2</strong>
          <span className="metric-label">Data Sources</span>
        </article>

        <article className="metric-card">
          <Clock3
            className="metric-icon clock-icon"
            size={27}
          />
          <strong className="last-run">
            Today, 10:24 AM
          </strong>
          <span className="metric-label">Last Run</span>
        </article>
      </section>

      <section className="dashboard-bottom">
        <article className="panel overview-panel">
          <h2>Data Quality Overview</h2>

          <div className="quality-list">
            {quality.map((item) => (
              <div
                className="quality-row"
                key={item.label}
              >
                <span className="quality-name">
                  {item.label}
                </span>

                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${item.value}%`
                    }}
                  />
                </div>

                <strong className="quality-percentage">
                  {item.value}%
                </strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel activity-panel">
          <h2>Recent Activity</h2>

          <div className="activity-list">
            {activity.map((item, index) => {
              const Icon = item.icon;

              return (
                <div
                  className="activity-row"
                  key={index}
                >
                  <Icon
                    size={18}
                    className={`activity-icon ${item.type}`}
                  />

                  <span className="activity-label">
                    {item.label}
                  </span>

                  <time>{item.time}</time>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="home-extras-grid">
        <SystemHealth />
        <IssuesBreakdown />
      </section>

      <section className="home-trend-section">
        <QualityTrend />
      </section>
    </div>
  );
}

// MAIN APPLICATION: SHARED SIDEBAR + HEADER
export default function App() {
  const [activePage, setActivePage] = useState("Home");
  const [notice, setNotice] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const navigate = (page) => {
    if (page === "Pipeline" || page === "Reports") {
      setNotice(
        `${page} will be built in the next module.`
      );
      return;
    }

    setActivePage(page);
    setNotice("");
  };

  return (
    <div className="application">
      <div className="window-bar">
        <span className="window-dot red" />
        <span className="window-dot yellow" />
        <span className="window-dot green" />
      </div>

      <div className="app-layout">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-icon">
              <ShieldCheck size={27} />
            </div>

            <div className="brand-text">
              <strong>AI Data</strong>
              <strong>Guardian 3.0</strong>
            </div>
          </div>

          <nav className="navigation">
            {navigation.map(({ name, icon: Icon }) => (
              <button
                key={name}
                className={
                  activePage === name
                    ? "nav-button active"
                    : "nav-button"
                }
                onClick={() => navigate(name)}
              >
                <Icon size={19} />
                <span>{name}</span>
              </button>
            ))}
          </nav>

          <button
            className="nav-button settings-button"
            onClick={() =>
              setNotice(
                "Settings will be configured later."
              )
            }
          >
            <Settings size={19} />
            <span>Settings</span>
          </button>
        </aside>

        <main className="main-area">
          <header className="page-header">
            <div className="page-heading">
              <h1>{activePage}</h1>
              <p>{pageDescriptions[activePage]}</p>
            </div>

            <div className="header-actions">
              <div className="connection-status">
                <span className="status-dot offline" />
                PostgreSQL: Not connected
              </div>

              <button
                className="ai-button"
                onClick={() => setAiOpen(true)}
              >
                <Bot size={20} />
                AI Guardian
              </button>

              <button
                className="icon-button"
                aria-label="Notifications"
                onClick={() =>
                  setNotice(
                    "No live notifications yet."
                  )
                }
              >
                <Bell size={20} />
              </button>

              <div className="avatar">A</div>
            </div>
          </header>

          {activePage === "Home" && <Home />}

          {activePage === "Data Check" && (
            <div className="dc-embedded">
              <DataCheck />
            </div>
          )}
        </main>
      </div>

      {notice && (
        <div className="toast" role="status">
          <Info size={18} />
          <span>{notice}</span>

          <button
            aria-label="Close notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {aiOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setAiOpen(false)}
        >
          <section
            className="ai-modal"
            role="dialog"
            aria-modal="true"
            aria-label="AI Guardian"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="ai-modal-header">
              <Bot size={23} />
              <strong>AI Guardian (Shared)</strong>

              <button
                aria-label="Close AI Guardian"
                onClick={() => setAiOpen(false)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="ai-modal-body">
              <div className="ai-message">
                AI Guardian uses one centralized
                local Ollama agent with the Qwen model.
              </div>

              <p>
                The AI service is not connected yet.
                We will enable it after implementing
                the deterministic validation engines.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
