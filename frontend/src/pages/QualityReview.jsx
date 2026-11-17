import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ArrowDownToLine, ArrowRight, Bot, Check, CheckCircle2,
  ChevronRight, Database, FileCheck2, FileJson, FileSpreadsheet, KeyRound,
  LoaderCircle, LockKeyhole, Play, Search, ShieldCheck, SlidersHorizontal,
  Sparkles, Table2, Workflow } from "lucide-react";
import { guardianFetch, setAccessToken } from "../services/apiClient.js";
import "../styles/quality-review.css";

const TABS = ["Overview", "Columns", "Issues", "Changes", "Agent activity", "Downloads"];
const FILES = [
  ["report.json", "Quality report", "Scores, profiles, findings and recommendations", FileJson, "JSON"],
  ["masked.csv", "Protected dataset", "Masked sample with output corrections applied", FileSpreadsheet, "CSV"],
  ["changes.csv", "Correction log", "Before and after values with protected row references", FileSpreadsheet, "CSV"],
  ["agent_trace.json", "Execution trace", "Tool choices, plans and verified observations", Workflow, "JSON"],
  ["manifest.json", "Integrity manifest", "File sizes and SHA256 checksums", FileCheck2, "JSON"],
];
const LABELS = { profile: "Profile columns", validate: "Validate sample", detect_pii: "Detect sensitive fields",
  detect_anomalies: "Detect anomalies", verify_sql_row: "Verify SQL evidence", query_warehouse: "Query warehouse" };
const humanize = value => String(value).replaceAll("_", " ");
const number = value => value == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

function Badge({ children, tone = "neutral" }) { return <span className={`qr-badge qr-badge-${tone}`}>{children}</span>; }
function Empty({ icon: Icon = Database, title, children }) {
  return <div className="qr-empty"><span className="qr-empty-icon"><Icon size={26} /></span><h3>{title}</h3><p>{children}</p></div>;
}
function Metric({ icon: Icon, label, value, note, tone }) {
  return <article className={`qr-metric ${tone ? `qr-metric-${tone}` : ""}`}><div className="qr-metric-label"><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{note}</small></article>;
}
function IssueTable({ issues, anomalies = false }) {
  if (!issues.length) return <Empty icon={CheckCircle2} title="No findings in this sample">The configured checks did not return any {anomalies ? "anomalies" : "rule failures"}.</Empty>;
  return <div className="qr-table-scroll"><table className="qr-table"><thead><tr><th>Column</th><th>{anomalies ? "Detection method" : "Failed check"}</th><th>Row reference</th><th>Recommendation</th></tr></thead><tbody>{issues.map((issue,i) => <tr key={`${issue.row_ref}-${issue.column}-${i}`}><td className="qr-column">{issue.column === "*" ? "Entire record" : issue.column}</td><td><Badge tone="warning">{humanize(issue.rule || issue.method)}</Badge></td><td><code title={issue.row_ref}>{issue.row_ref?.slice(0,12)}…</code></td><td>{issue.recommendation}</td></tr>)}</tbody></table></div>;
}

export default function QualityReview({ request }) {
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ai, setAi] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [key, setKey] = useState("");
  const [row, setRow] = useState(null);
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState("");
  const [downloading, setDownloading] = useState("");
  const [notice, setNotice] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [token, setToken] = useState("");
  useEffect(() => {
    if (request?.type === "access") setAuthOpen(true);
    if (request?.type === "ai") setAi(true);
  }, [request]);
  const columns = useMemo(() => Object.entries(run?.profiles || {}).filter(([name,p]) =>
    name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "pii" ? p.pii : p.missing > 0))), [run,search,filter]);

  async function post(path, body) {
    const response = await guardianFetch(`/api/v1/quality/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? "An API token is required. Open Access settings and enter your token." : response.status === 403 ? "Your account does not have permission for this action." : typeof data.detail === "string" ? data.detail : "The request could not be completed.");
    return data;
  }
  async function start() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await post("runs", { use_ai: ai });
      if (!data.run_id || !data.validation || !data.profiles || !Array.isArray(data.agent?.trace)) throw new Error("The server returned an incomplete review.");
      setRun(data); setTab("Overview"); setSearch(""); setFilter("all");
      setNotice("Review completed. Your results and downloads are ready.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function download(name) {
    if (!run || downloading) return;
    setDownloading(name); setError(""); setNotice("");
    try {
      const response = await guardianFetch(`/api/v1/quality/runs/${run.run_id}/${name}`);
      if (!response.ok) throw new Error("The download is unavailable. Check your access and try again.");
      const blob = await response.blob();
      if (!blob.size) throw new Error("The server returned an empty file.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`${name} download started.`);
    } catch (e) { setError(e.message); }
    finally { setDownloading(""); }
  }
  async function lookup(event) {
    event.preventDefault();
    if (!key.trim() || rowBusy) return;
    setRowError(""); setRow(null); setRowBusy(true);
    try { setRow(await post("validate-row", { key: key.trim() })); }
    catch (e) { setRowError(e.message); }
    finally { setRowBusy(false); }
  }
  function saveToken() {
    setAccessToken(token); setAuthOpen(false);
    setNotice(token.trim() ? "API token applied for this browser session." : "API token cleared.");
  }

  return <div className="quality-review">
    <section className="qr-intro"><div><div className="qr-eyebrow"><ShieldCheck size={14} /> DATA QUALITY WORKSPACE</div><h2>Understand your data. Act on evidence.</h2><p>Review a database sample, investigate findings and export protected results.</p></div><button className="qr-button qr-button-quiet" onClick={() => setAuthOpen(!authOpen)} aria-expanded={authOpen}><KeyRound size={16} /> Access settings</button></section>
    {authOpen && <section className="qr-card qr-access"><div><h3>API access</h3><p>Use an operator or admin token when authentication is enabled. Tokens stay in memory until you reload.</p></div><label className="qr-field"><span>Access token</span><input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Enter API token" /></label><button className="qr-button" onClick={saveToken}>Apply token</button></section>}
    <section className="qr-card qr-setup"><div className="qr-section-heading"><div><h3><SlidersHorizontal size={17} /> Review configuration</h3><p>Run the approved dataset checks with your preferred review mode.</p></div><Badge tone="success"><LockKeyhole size={12} /> Source stays unchanged</Badge></div>
      <div className="qr-run-controls"><div className="qr-dataset"><span className="qr-dataset-icon"><Database size={22}/></span><div><small>Configured database sample</small><strong>{run ? humanize(run.source_engine) : "Approved data source"}</strong><span>{run ? `${number(run.sample_count)} sampled rows · ${number(run.column_count)} columns` : "Sample size and rules follow your dataset configuration"}</span></div></div>
        <fieldset className="qr-mode" disabled={busy}><legend>Review mode</legend><label className={!ai ? "selected" : ""}><input type="radio" name="review-mode" checked={!ai} onChange={() => setAi(false)} /><ShieldCheck size={16} /> Standard</label><label className={ai ? "selected" : ""}><input type="radio" name="review-mode" checked={ai} onChange={() => setAi(true)} /><Sparkles size={16} /> AI guided</label></fieldset>
        <button className="qr-button qr-button-primary" disabled={busy || !!downloading} onClick={start}>{busy ? <LoaderCircle className="qr-spin" size={17}/> : <Play size={17}/>} {busy ? "Review in progress" : run ? "Run again" : "Run review"}</button>
      </div><div className="qr-setup-note">{ai ? <><Bot size={14}/> Local AI plans and selects inspection tools. This may take a few minutes.</> : <><CheckCircle2 size={14}/> SQL and configured rules produce the findings. No AI inference is used.</>}</div>
    </section>
    {error && <div className="qr-alert qr-alert-error" role="alert"><AlertCircle size={18}/><div><strong>Unable to complete this action</strong><p>{error}</p>{run && <small>Your last completed review is still available below.</small>}</div><button className="qr-icon-button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    {notice && <div className="qr-alert qr-alert-success" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button className="qr-icon-button" onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}
    {busy && <div className="qr-progress" role="status"><LoaderCircle className="qr-spin" size={19}/><div><strong>Inspecting your sample</strong><p>Results appear once validation and privacy checks are complete.{run ? " Showing your previous completed review below." : ""}</p></div></div>}
    <div className="qr-metrics"><Metric icon={Activity} label="Quality score" value={run ? `${number(run.validation.score)}%` : "—"} note="Passed checks in this sample" tone="mint"/><Metric icon={AlertCircle} label="Rule failures" value={number(run?.validation.issue_count)} note="Across configured quality checks" tone="amber"/><Metric icon={LockKeyhole} label="Sensitive columns" value={run ? number(Object.keys(run.pii).length) : "—"} note="Classified and masked on export" tone="violet"/><Metric icon={Sparkles} label="Anomalies" value={run ? number(run.anomalies.length) : "—"} note="Unusual values for investigation" tone="blue"/></div>
    <div className="qr-workspace-grid"><section className="qr-card qr-results" aria-busy={busy}>
      <div className="qr-section-heading"><div><h3>Review results</h3><p>{run ? `${number(run.sample_count)} of ${number(run.population_count)} rows reviewed · ${new Date(run.created_at).toLocaleString()}` : "Your results will appear here after a review."}</p></div>{run && <Badge tone="success"><Check size={12}/> Completed</Badge>}</div>
      <div className="qr-tabs" role="tablist" aria-label="Review results">{TABS.map(name => <button id={`qr-tab-${TABS.indexOf(name)}`} aria-controls="qr-tabpanel" key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>{name}{name === "Issues" && run ? <span>{run.validation.issue_count}</span> : null}</button>)}</div>
      <div id="qr-tabpanel" role="tabpanel" aria-labelledby={`qr-tab-${TABS.indexOf(tab)}`}>
        {!run ? <Empty icon={FileCheck2} title="Ready for your first review">Run a sample review to see column profiles, quality findings and recommended next steps.</Empty> : <>
          {tab === "Overview" && <div className="qr-overview"><div className="qr-overview-summary"><span className="qr-summary-icon"><ShieldCheck size={24}/></span><div><h3>{run.validation.issue_count ? "Your sample has findings to review" : "Your sample passed the configured checks"}</h3><p>{number(run.validation.checks)} checks performed. Findings describe this sample, rather than the entire source.</p></div></div><h4>Recommended next steps</h4><div className="qr-recommendations">{run.recommendations.length ? run.recommendations.map((text,i) => <div key={text}><span>{String(i+1).padStart(2,"0")}</span><p>{text}</p><ArrowRight size={15}/></div>) : <p className="qr-muted">No corrective actions recommended by the configured checks.</p>}</div>{run.anomalies.length > 0 && <><h4>Unusual patterns</h4><IssueTable issues={run.anomalies} anomalies/></>}
            {run.warehouse && <div className="qr-warehouse"><Database size={18}/><div><h4>Warehouse cross-check</h4><p>{number(run.warehouse.total_records)} source records · {number(run.warehouse.finding_count)} SQL-derived issue occurrences across email and phone checks.</p></div></div>}
          </div>}
          {tab === "Columns" && <><div className="qr-table-toolbar"><label className="qr-search"><Search size={16}/><input aria-label="Search columns" placeholder="Search columns…" value={search} onChange={e => setSearch(e.target.value)}/></label><select aria-label="Filter columns" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All columns</option><option value="pii">Sensitive columns</option><option value="missing">With missing values</option></select><small>{columns.length} columns</small></div>{columns.length ? <div className="qr-table-scroll"><table className="qr-table"><thead><tr><th>Column</th><th>Missing</th><th>Distinct</th><th>Type</th><th>Classification</th><th>Min / Max</th></tr></thead><tbody>{columns.map(([col,p]) => <tr key={col}><td className="qr-column">{col}</td><td>{p.missing ? <Badge tone="warning">{p.missing}</Badge> : "0"}</td><td>{p.distinct}</td><td>{p.types.join(", ")}</td><td>{p.pii ? <Badge tone="violet"><LockKeyhole size={11}/> Sensitive</Badge> : <span className="qr-muted">Standard</span>}</td><td>{number(p.min)} / {number(p.max)}</td></tr>)}</tbody></table></div> : <Empty icon={Search} title="No matching columns">Try a different name or filter.</Empty>}</>}
          {tab === "Issues" && <IssueTable issues={run.validation.issues}/>}
          {tab === "Changes" && <><p className="qr-tab-description">Approved normalization applies to the exported sample. Source records remain unchanged.</p>{run.changes.length ? <div className="qr-table-scroll"><table className="qr-table"><thead><tr><th>Column</th><th>Before</th><th>After</th><th>Action</th></tr></thead><tbody>{run.changes.map((change,i) => <tr key={i}><td className="qr-column">{change.column}<small className="qr-row-ref">{change.row_ref.slice(0,12)}…</small></td><td><code className="qr-before">{JSON.stringify(change.before)}</code></td><td><code className="qr-after">{JSON.stringify(change.after)}</code></td><td><Badge tone="success">Output corrected</Badge></td></tr>)}</tbody></table></div> : <Empty icon={CheckCircle2} title="No output corrections needed">None of the sampled values required the configured normalization.</Empty>}</>}
          {tab === "Agent activity" && <div className="qr-agent"><p className="qr-tab-description">{run.agent.ai_used ? "Local AI planned and selected these tools. Each observation comes from an executed check." : "This review used a deterministic tool sequence. No AI inference was used."}</p><ol className="qr-timeline">{run.agent.trace.map(step => <li key={step.step}><span className="qr-step-number">{step.step}</span><div><h4>{LABELS[step.selected_tool] || humanize(step.selected_tool)}<CheckCircle2 size={14}/></h4><p>{step.observation.finding_count ?? 0} finding(s){step.observation.checks ? ` · ${number(step.observation.checks)} checks` : ""}</p>{step.plan && <details><summary>View planned sequence</summary><p>{step.plan.map(x => LABELS[x] || humanize(x)).join(" → ")}</p></details>}</div></li>)}</ol></div>}
          {tab === "Downloads" && <div className="qr-download-list">{FILES.map(([name,title,desc,Icon,format]) => <div className="qr-file" key={name}><span className="qr-file-icon"><Icon size={21}/></span><div><h4>{title} <Badge>{format}</Badge></h4><p>{desc}</p></div><button className="qr-icon-button" disabled={!!downloading} onClick={() => download(name)} aria-label={`Download ${title}`}>{downloading === name ? <LoaderCircle className="qr-spin" size={18}/> : <ArrowDownToLine size={18}/>}</button></div>)}</div>}
        </>}
      </div>
      {run && <footer className="qr-results-footer"><LockKeyhole size={12}/><span>Sample results · {run.agent.ai_used ? "AI guided" : "Standard review"}</span><code title={run.run_id}>Run {run.run_id.slice(0,8)}</code></footer>}
    </section><aside className="qr-side">
      <section className="qr-card"><div className="qr-section-heading"><div><h3><Search size={16}/> Check a specific row</h3><p>Validate a record directly against the source.</p></div></div><form className="qr-row-form" onSubmit={lookup}><label className="qr-field"><span>Record key</span><input required value={key} onChange={e => {setKey(e.target.value);setRow(null);setRowError("");}} placeholder="e.g. 5" maxLength={200}/></label><button className="qr-button" disabled={!key.trim() || rowBusy}>{rowBusy ? <LoaderCircle size={15} className="qr-spin"/> : <Search size={15}/>} {rowBusy ? "Checking…" : "Validate row"}</button></form>{rowError && <p className="qr-inline-error" role="alert">{rowError}</p>}{row && <div className="qr-row-result" role="status"><Badge tone={row.validation.issue_count ? "warning" : "success"}>{row.validation.issue_count} issue(s) found</Badge>{row.validation.issues.map((issue,i) => <p key={i}><strong>{issue.column}</strong><br/>{issue.recommendation}</p>)}<small>Single-row checks only. Duplicate checks need sample context.</small></div>}<p className="qr-helper"><LockKeyhole size={12}/> Personal values are masked.</p></section>
      <section className="qr-card qr-trust"><span className="qr-trust-icon"><ShieldCheck size={22}/></span><h3>Evidence you can trace</h3><p>Every completed review has a unique run ID. Downloads belong to that saved run.</p><ul><li><Check size={13}/> Source data stays unchanged</li><li><Check size={13}/> Sensitive exports are masked</li><li><Check size={13}/> Checksums verify file integrity</li></ul>{run && <button className="qr-text-button" onClick={() => setTab("Downloads")}>View downloads <ChevronRight size={14}/></button>}</section>
      {run && <details className="qr-card qr-limitations"><summary>Scope & limitations</summary>{run.limitations.map(text => <p key={text}>{text}</p>)}</details>}
    </aside></div>
  </div>;
}
