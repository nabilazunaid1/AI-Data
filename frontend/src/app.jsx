
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
  Info
} from "lucide-react";

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

export default function App() {
  const [notice, setNotice] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const showNotice = (message) => {
    setNotice(message);
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
                  name === "Home"
                    ? "nav-button active"
                    : "nav-button"
                }
                onClick={() => {
                  if (name !== "Home") {
                    showNotice(
                      `${name} will be built in its own step.`
                    );
                  } else {
                    setNotice("");
                  }
                }}
              >
                <Icon size={19} />
                <span>{name}</span>
              </button>
            ))}
          </nav>

          <button
            className="nav-button settings-button"
            onClick={() =>
              showNotice("Settings will be configured later.")
            }
          >
            <Settings size={19} />
            <span>Settings</span>
          </button>
        </aside>

        <main className="main-area">
          <header className="page-header">
            <div className="page-heading">
              <h1>Home</h1>
              <p>System Overview &amp; Data Health</p>
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
                  showNotice("No live notifications yet.")
                }
              >
                <Bell size={20} />
              </button>

              <div className="avatar">A</div>
            </div>
          </header>

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
                <strong className="last-run">Today, 10:24 AM</strong>
                <span className="metric-label">Last Run</span>
              </article>
            </section>

            <section className="dashboard-bottom">
              <article className="panel overview-panel">
                <h2>Data Quality Overview</h2>

                <div className="quality-list">
                  {quality.map((item) => (
                    <div className="quality-row" key={item.label}>
                      <span className="quality-name">
                        {item.label}
                      </span>

                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${item.value}%` }}
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
                      <div className="activity-row" key={index}>
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
          </div>
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
            onClick={(event) => event.stopPropagation()}
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
                AI Guardian will use one centralized local
                Ollama agent across all modules.
              </div>

              <p>
                AI investigation is not available yet.
                We will connect it after implementing
                the validation engines.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}