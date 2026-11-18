import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, ArrowDownToLine, ArrowRight, Bot, Check, CheckCircle2,
  ChevronRight, Database, FileCheck2, FileJson, FileSpreadsheet, KeyRound,
  LoaderCircle, LockKeyhole, Play, Search, ShieldCheck, SlidersHorizontal,
  Sparkles, Table2, Workflow } from "lucide-react";
import { setAccessToken } from "../services/apiClient.js";
import "../styles/quality-review.css";
import { recommendationActions } from '../services/reviewRecommendations.js';
import { protectedValue } from '../services/protectedValues.js';
import { apiJson, downloadArtifact, matchesDataset, shouldAdoptSavedRun } from '../services/runCatalogue.js';

const TABS = ["Overview", "Columns", "Issues", "Changes", "Agent activity", "Downloads"];
const FILES = [
  ["pdf", "Quality assessment report", "Executive summary, evidence tables, corrections and assessment scope", FileCheck2, "PDF"],
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
function IssueTable({ issues, anomalies = false, showGuidance = false }) {
  if (!issues.length) return <Empty icon={CheckCircle2} title="No findings in this sample">The configured checks did not return any {anomalies ? "anomalies" : "rule failures"}.</Empty>;
  return <div className="qr-table-scroll"><table className="qr-table"><thead><tr><th>Column</th><th>{anomalies ? "Detection method" : "Failed check"}</th><th>Row reference</th>{showGuidance && <th>Recommendation</th>}</tr></thead><tbody>{issues.map((issue,i) => <tr key={`${issue.row_ref}-${issue.column}-${i}`}><td className="qr-column">{issue.column === "*" ? "Entire record" : issue.column}</td><td><Badge tone="warning">{humanize(issue.rule || issue.method)}</Badge></td><td><code title={issue.row_ref}>{issue.row_ref?.slice(0,12)}…</code></td>{showGuidance && <td>{issue.recommendation}</td>}</tr>)}</tbody></table></div>;
}

export default function QualityReview({ request, dataset, onAccessChange, onOpenSql, onRunSaved, savedRun }) {
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiWarning, setAiWarning] = useState('');
  const [error, setError] = useState("");
  const [ai, setAi] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [activeFix, setActiveFix] = useState(null);
  const fixHeading = useRef(null);
  const rowKeyInput = useRef(null);
  const rowResult = useRef(null);
  const [key, setKey] = useState("");
  const [lookupMode, setLookupMode] = useState('row_number');
  const [row, setRow] = useState(null);
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState("");
  const [downloading, setDownloading] = useState("");
  const [notice, setNotice] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [token, setToken] = useState("");
  const [source, setSource] = useState(null);
  const [sourceError, setSourceError] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceRefresh, setSourceRefresh] = useState(0);
  const connectionId = dataset?.connection_id;
  const schemaName = dataset?.schema_name;
  const tableName = dataset?.table_name;
  useEffect(() => {
    if (!busy && !aiBusy && matchesDataset(savedRun,dataset) && shouldAdoptSavedRun(run,savedRun)) setRun(savedRun);
  }, [savedRun, busy, aiBusy, run, connectionId, schemaName, tableName]);
  useEffect(() => {
    const controller = new AbortController();
    setSource(null); setSourceError('');
    if (!connectionId || !tableName) return () => controller.abort();
    setSourceLoading(true);
    const params = new URLSearchParams({ connection_id: connectionId, schema_name: schemaName, table_name: tableName });
    apiJson(`quality/context?${params}`, { signal: controller.signal }).then(data => {
      if (data.connection_id !== connectionId || data.schema !== schemaName || data.table !== tableName) throw new Error('The source response does not match the selected dataset.');
      if (!controller.signal.aborted) setSource(data);
    }).catch(error => { if (!controller.signal.aborted) setSourceError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setSourceLoading(false); });
    return () => controller.abort();
  }, [connectionId, schemaName, tableName, sourceRefresh]);
  useEffect(() => {
    if (request?.type === "access") setAuthOpen(true);
    if (request?.type === "ai") setAi(true);
  }, [request]);
  const columns = useMemo(() => Object.entries(run?.profiles || {}).filter(([name,p]) =>
    name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "pii" ? p.pii : p.missing > 0))), [run,search,filter]);
  const canRecommend = ai && run?.agent?.ai_used === true && !busy && !aiBusy && !aiWarning;
  useEffect(()=>{setActiveFix(null);setRow(null);if(tab==='Fix issue')setTab('Overview');},[run?.run_id]);
  const actions = useMemo(() => recommendationActions(run, { aiMode: ai,
    pending: busy || aiBusy, failed: !!aiWarning }), [run, ai, busy, aiBusy, aiWarning]);
  const tabs = activeFix && canRecommend ? [...TABS, 'Fix issue'] : TABS;
  useEffect(() => {
    if (!canRecommend) { setActiveFix(null); if (tab === 'Fix issue') setTab('Overview'); }
  }, [canRecommend, tab]);
  useEffect(() => {
    if (tab === 'Fix issue' && activeFix) {
      fixHeading.current?.focus({ preventScroll: true });
      fixHeading.current?.scrollIntoView({ block: 'start' });
    }
  }, [tab, activeFix]);
  function openFix(action) {
    setActiveFix(action); setTab('Fix issue');
  }

  async function post(path, body) {
    return apiJson(`quality/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        connection_id: connectionId, schema_name: schemaName, table_name: tableName, ...body })
    });
  }
  async function start() {
    if (busy || aiBusy || !source) return;
    setBusy(true); setError(""); setNotice(""); setAiWarning('');
    try {
      // Publish verified results before any model call. AI inspects this saved run.
      const data = await post("runs", { use_ai: false });
      if (!data.run_id || !data.validation || !data.profiles || !Array.isArray(data.agent?.trace)) throw new Error("The server returned an incomplete review.");
      if (data.dataset?.connection_id !== connectionId || data.dataset?.schema !== schemaName || data.dataset?.table !== tableName) throw new Error('The review does not match the selected dataset. Results were not displayed.');
      setRun(data); setTab("Overview"); setSearch(""); setFilter("all");
      onRunSaved?.(data);
      setNotice("Review completed. Your results and downloads are ready.");
      if (ai) await reviewAI(data);
    } catch (e) { setError(e.message); onRunSaved?.(); }
    finally { setBusy(false); }
  }
  async function reviewAI(base = run) {
    if (!base || aiBusy) return;
    setAiBusy(true); setAiWarning('');
    try {
      const data = await post(`runs/${base.run_id}/ai-review`, {});
      if (data.parent_run_id !== base.run_id || data.agent?.ai_used !== true ||
          data.dataset?.connection_id !== connectionId || data.dataset?.schema !== schemaName || data.dataset?.table !== tableName) {
        throw new Error('AI review did not match the saved evidence. Verified data-quality results have been kept.');
      }
      setRun(data); onRunSaved?.(data); setNotice('Data checks and AI evidence review completed. Downloads are ready.');
    } catch (error) { setAiWarning(error.message); onRunSaved?.(); }
    finally { setAiBusy(false); }
  }
  async function download(name) {
    if (!run || downloading) return;
    setDownloading(name); setError(""); setNotice("");
    try {
      if(name==='pdf') {
        const {downloadCataloguePdf}=await import('../services/cataloguePdf.js');
        await downloadCataloguePdf(run);
      } else await downloadArtifact(run.run_id,name,run);
      setNotice(`${name==='pdf'?'Quality assessment report':name} download started.`);
    } catch (e) { setError(e.message); }
    finally { setDownloading(""); }
  }
  async function lookup(event) {
    event.preventDefault();
    if (!key.trim() || rowBusy || !source) return;
    setRowError(""); setRow(null); setRowBusy(true);
    try {
      if (lookupMode === 'row_number' && (!/^[0-9]+$/.test(key.trim()) || Number(key) < 1 || Number(key) > 10000)) {
        throw new Error('Enter a whole row number between 1 and 10000.');
      }
      setRow(await post("validate-row", { key: key.trim(), lookup_mode: lookupMode }));
    }
    catch (e) { setRowError(e.message); }
    finally { setRowBusy(false); }
  }
  async function verifyReference(rowRef) {
    if (!run || rowBusy) return;
    setRowBusy(true);setRow(null);setRowError('');
    rowKeyInput.current?.scrollIntoView({ block:'center' });
    try {
      const result = await post(`runs/${run.run_id}/validate-reference`, { row_ref:rowRef });
      if(result.row_ref!==rowRef || result.dataset?.connection_id!==connectionId || result.dataset?.schema!==schemaName || result.dataset?.table!==tableName) throw new Error('Row response did not match the selected evidence.');
      setRow(result);
    } catch(error) {setRowError(error.message);} finally {setRowBusy(false);}
  }
  useEffect(()=>{if(row?.row_ref){rowResult.current?.focus({preventScroll:true});rowResult.current?.scrollIntoView({block:'center'});}},[row]);
  function saveToken() {
    setAccessToken(token); setAuthOpen(false);
    setSourceRefresh(value => value + 1); onAccessChange?.();
    setNotice(token.trim() ? "API token applied for this browser session." : "API token cleared.");
  }

  return <div className="quality-review">
    <section className="qr-intro"><div><div className="qr-eyebrow"><ShieldCheck size={14} /> DATA CHECK · QUALITY REVIEW</div><h2>Check the data you selected.</h2><p>Validate the selected database table, investigate findings and export protected results.</p></div><button className="qr-button qr-button-quiet" onClick={() => setAuthOpen(!authOpen)} aria-expanded={authOpen}><KeyRound size={16} /> Access settings</button></section>
    {authOpen && <section className="qr-card qr-access"><div><h3>API access</h3><p>Use an operator or admin token when authentication is enabled. Tokens stay in memory until you reload.</p></div><label className="qr-field"><span>Access token</span><input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Enter API token" /></label><button className="qr-button" onClick={saveToken}>Apply token</button></section>}
    <section className="qr-card qr-setup"><div className="qr-section-heading"><div><h3><SlidersHorizontal size={17} /> Review configuration</h3><p>Run the approved dataset checks with your preferred review mode.</p></div><Badge tone="success"><LockKeyhole size={12} /> Source stays unchanged</Badge></div>
      <div className="qr-run-controls"><div className="qr-dataset"><span className="qr-dataset-icon"><Database size={22}/></span><div><small>{dataset?.connection_name || 'Select a database and table above'}</small><strong>{dataset ? `${dataset.schema_name}.${dataset.table_name}` : 'No dataset selected'}</strong><span>{sourceLoading ? 'Testing selected database/table…' : source ? `Connected · ${number(source.sample_size)} of ${number(source.population_count)} rows · ${number(source.column_count)} columns` : 'Connection has not been verified'}</span></div></div>
        <fieldset className="qr-mode" disabled={busy || aiBusy}><legend>Review mode</legend><label className={!ai ? "selected" : ""}><input type="radio" name="review-mode" checked={!ai} onChange={() => setAi(false)} /><ShieldCheck size={16} /> Standard</label><label className={ai ? "selected" : ""}><input type="radio" name="review-mode" checked={ai} onChange={() => setAi(true)} /><Sparkles size={16} /> AI guided</label></fieldset>
        <button className="qr-button qr-button-primary" disabled={busy || aiBusy || !!downloading || !source || sourceLoading} onClick={start}>{busy ? <LoaderCircle className="qr-spin" size={17}/> : <Play size={17}/>} {busy ? "Review in progress" : run ? "Run again" : "Run review"}</button>
      </div><div className="qr-setup-note">{ai ? <><Bot size={14}/> Data checks run first. Local AI then plans inspections of the saved evidence.</> : <><CheckCircle2 size={14}/> SQL and configured rules produce the findings. No AI inference is used.</>}</div>
    </section>
    {sourceError && <div className="qr-alert qr-alert-error" role="alert"><AlertCircle size={18}/><div><strong>Selected database/table is unavailable</strong><p>{sourceError}</p><button className="qr-text-button" onClick={() => setSourceRefresh(value => value + 1)}>Retry connection</button></div></div>}
    {error && <div className="qr-alert qr-alert-error" role="alert"><AlertCircle size={18}/><div><strong>Unable to complete this action</strong><p>{error}</p>{run && <small>Your last completed review is still available below.</small>}</div><button className="qr-icon-button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    {aiWarning && <div className="qr-alert qr-alert-warning" role="status"><AlertCircle size={18}/><div><strong>Data checks completed · AI review unavailable</strong><p>{aiWarning}</p><p>Your verified scores, findings and downloads remain available.</p><button className="qr-text-button" disabled={busy || aiBusy} onClick={() => reviewAI()}>Retry AI on saved results</button></div></div>}
    {notice && <div className="qr-alert qr-alert-success" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button className="qr-icon-button" onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}
    {(busy || aiBusy) && <div className="qr-progress" role="status"><LoaderCircle className="qr-spin" size={19}/><div><strong>{aiBusy ? 'AI is reviewing saved evidence' : 'Inspecting your sample'}</strong><p>{aiBusy ? 'Data-quality checks are complete. Scores and downloads are available while the optional AI review runs.' : 'Results appear once validation and privacy checks are complete.'}</p></div></div>}
    <div className="qr-metrics"><Metric icon={Activity} label="Quality score" value={run ? `${number(run.validation.score)}%` : "—"} note="Passed checks in this sample" tone="mint"/><Metric icon={AlertCircle} label="Rule failures" value={number(run?.validation.issue_count)} note="Across configured quality checks" tone="amber"/><Metric icon={LockKeyhole} label="Sensitive columns" value={run ? number(Object.keys(run.pii).length) : "—"} note="Classified and masked on export" tone="violet"/><Metric icon={Sparkles} label="Anomalies" value={run ? number(run.anomalies.length) : "—"} note="Unusual values for investigation" tone="blue"/></div>
    <div className="qr-workspace-grid"><section className="qr-card qr-results" aria-busy={busy}>
      <div className="qr-section-heading"><div><h3>Review results</h3><p>{run ? `${number(run.sample_count)} of ${number(run.population_count)} rows reviewed · ${new Date(run.created_at).toLocaleString()}` : "Your results will appear here after a review."}</p></div>{run && <Badge tone="success"><Check size={12}/> Completed</Badge>}</div>
      <div className="qr-tabs" role="tablist" aria-label="Review results">{tabs.map(name => <button id={`qr-tab-${tabs.indexOf(name)}`} aria-controls="qr-tabpanel" key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>{name}{name === "Issues" && run ? <span>{run.validation.issue_count}</span> : null}</button>)}</div>
      <div id="qr-tabpanel" role="tabpanel" aria-labelledby={`qr-tab-${tabs.indexOf(tab)}`}>
        {!run ? <Empty icon={FileCheck2} title="Ready for your first review">Run a sample review to see column profiles, quality findings and sample evidence.</Empty> : <>
          {tab === "Overview" && <div className="qr-overview"><div className="qr-overview-summary"><span className="qr-summary-icon"><ShieldCheck size={24}/></span><div><h3>{run.validation.issue_count ? "Your sample has findings to review" : "Your sample passed the configured checks"}</h3><p>{number(run.validation.checks)} checks performed. Findings describe this sample, rather than the entire source.</p></div></div>
            {canRecommend && <><h4 className="qr-guidance-heading">Recommended next steps</h4><div className="qr-recommendations">{actions.length ? actions.map((action,i) => <button type="button" key={action.id} onClick={() => openFix(action)} aria-label={`${action.title}: open fix workflow`}><span>{String(i+1).padStart(2,'0')}</span><div><strong>{action.title}</strong><p>{action.findings.length} finding(s) · Open fix workflow</p></div><ArrowRight size={16}/></button>) : <p className="qr-muted">No corrective actions are needed for the configured checks.</p>}</div></>}
            {run.anomalies.length > 0 && <><h4>Unusual patterns</h4><IssueTable issues={run.anomalies} anomalies showGuidance={canRecommend}/></>}
            {run.warehouse && <div className="qr-warehouse"><Database size={18}/><div><h4>Warehouse cross-check</h4><p>{number(run.warehouse.total_records)} source records · {number(run.warehouse.finding_count)} SQL-derived issue occurrences across email and phone checks.</p></div></div>}
          </div>}
          {tab === "Columns" && <><div className="qr-table-toolbar"><label className="qr-search"><Search size={16}/><input aria-label="Search columns" placeholder="Search columns…" value={search} onChange={e => setSearch(e.target.value)}/></label><select aria-label="Filter columns" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All columns</option><option value="pii">Sensitive columns</option><option value="missing">With missing values</option></select><small>{columns.length} columns</small></div>{columns.length ? <div className="qr-table-scroll"><table className="qr-table"><thead><tr><th>Column</th><th>Missing</th><th>Distinct</th><th>Type</th><th>Classification</th><th>Min / Max</th></tr></thead><tbody>{columns.map(([col,p]) => <tr key={col}><td className="qr-column">{col}</td><td>{p.missing ? <Badge tone="warning">{p.missing}</Badge> : "0"}</td><td>{p.distinct}</td><td>{p.types.join(", ")}</td><td>{p.pii ? <Badge tone="violet"><LockKeyhole size={11}/> Sensitive</Badge> : <span className="qr-muted">Standard</span>}</td><td>{number(p.min)} / {number(p.max)}</td></tr>)}</tbody></table></div> : <Empty icon={Search} title="No matching columns">Try a different name or filter.</Empty>}</>}
          {tab === "Issues" && <IssueTable issues={run.validation.issues} showGuidance={canRecommend}/>}
          {tab === 'Fix issue' && activeFix && canRecommend && <section className="qr-fix-workflow">
            <button className="qr-text-button" onClick={() => setTab('Overview')}>← Back to recommended steps</button>
            <h3 ref={fixHeading} tabIndex={-1}>{activeFix.title}</h3>
            <p className="qr-muted">{run.dataset.connection_name} · {run.dataset.schema}.{run.dataset.table}</p>
            <div className="qr-fix-summary"><Badge tone="warning">{activeFix.findings.length} affected finding(s)</Badge><span>Run {run.run_id.slice(0,8)}</span></div>
            <h4>Resolution steps</h4><ol className="qr-fix-steps">{activeFix.steps.map(step => <li key={step}>{step}</li>)}<li>Validate the corrected record, then rerun the sample review to check the outcome.</li></ol>
            <h4>Affected sample evidence</h4><IssueTable issues={activeFix.findings} anomalies={activeFix.rule === 'median_mad'}/>
            {run.row_reference_lookup ? <div className="qr-reference-actions"><h4>Verify an affected source record</h4><p className="qr-muted">Each button resolves the exact source record privately. No ID or row number is needed.</p>{[...new Set(activeFix.findings.map(f=>f.row_ref))].map(reference => <button key={reference} className="qr-button" disabled={rowBusy} onClick={()=>verifyReference(reference)}><Search size={14}/> Verify {reference.slice(0,12)}…</button>)}</div> : <p className="qr-inline-error">This older run has no protected row mapping. Run a fresh review to enable exact-record verification.</p>}
            <div className="qr-fix-actions">
              {onOpenSql && <button className="qr-button" onClick={() => onOpenSql(activeFix)}><Database size={15}/> Open SQL & evidence</button>}
              <button className="qr-button qr-button-primary" disabled={busy || aiBusy} onClick={start}><Play size={15}/> Recheck after fixing</button>
            </div><p className="qr-helper">Apply verified corrections in your source system. Opening this workflow does not modify source records.</p>
          </section>}
          {tab === "Changes" && <><p className="qr-tab-description">Approved normalization applies to the exported sample. Source records remain unchanged.</p>{run.changes.length ? <div className="qr-table-scroll"><table className="qr-table"><thead><tr><th>Column</th><th>Before</th><th>After</th><th>Action</th></tr></thead><tbody>{run.changes.map((change,i) => <tr key={i}><td className="qr-column">{change.column}<small className="qr-row-ref">{change.row_ref.slice(0,12)}…</small></td><td><code className="qr-before">{JSON.stringify(protectedValue(change.before))}</code></td><td><code className="qr-after">{JSON.stringify(protectedValue(change.after))}</code></td><td><Badge tone="success">Output corrected</Badge></td></tr>)}</tbody></table></div> : <Empty icon={CheckCircle2} title="No output corrections needed">None of the sampled values required the configured normalization.</Empty>}</>}
          {tab === "Agent activity" && <div className="qr-agent"><p className="qr-tab-description">{run.agent.ai_used ? "Local AI planned and selected these evidence inspections. Observations come from the saved, verified data-quality results." : "These results come from verified standard checks. A completed AI evidence review is recorded separately when available."}</p><ol className="qr-timeline">{run.agent.trace.map(step => <li key={step.step}><span className="qr-step-number">{step.step}</span><div><h4>{LABELS[step.selected_tool] || humanize(step.selected_tool)}<CheckCircle2 size={14}/></h4><p>{step.observation.finding_count ?? 0} finding(s){step.observation.checks ? ` · ${number(step.observation.checks)} checks` : ""}</p>{step.plan && <details><summary>View planned sequence</summary><p>{step.plan.map(x => LABELS[x] || humanize(x)).join(" → ")}</p></details>}</div></li>)}</ol></div>}
          {tab === "Downloads" && <div className="qr-download-list">{FILES.map(([name,title,desc,Icon,format]) => <div className="qr-file" key={name}><span className="qr-file-icon"><Icon size={21}/></span><div><h4>{title} <Badge>{format}</Badge></h4><p>{desc}</p></div><button className="qr-icon-button" disabled={!!downloading} onClick={() => download(name)} aria-label={`Download ${title}`}>{downloading === name ? <LoaderCircle className="qr-spin" size={18}/> : <ArrowDownToLine size={18}/>}</button></div>)}</div>}
        </>}
      </div>
      {run && <footer className="qr-results-footer"><LockKeyhole size={12}/><span>Sample results · {run.agent.ai_used ? "AI guided" : "Standard review"}</span><code title={run.run_id}>Run {run.run_id.slice(0,8)}</code></footer>}
    </section><aside className="qr-side">
      <section className="qr-card"><div className="qr-section-heading"><div><h3><Search size={16}/> Check a specific row</h3><p>Choose a row position or an exact source ID.</p></div></div>
        <form className="qr-row-form" onSubmit={lookup}>
          <label className="qr-field"><span>Find row by</span><select value={lookupMode} disabled={rowBusy} onChange={event => {setLookupMode(event.target.value);setKey('');setRow(null);setRowError('');}}>
            <option value="row_number">Row number</option><option value="key">Record key ({source?.key_column || 'source ID'})</option>
          </select></label>
          <label className="qr-field"><span>{lookupMode === 'row_number' ? 'Row number (starts at 1)' : source?.key_column || 'Record key'}</span><input ref={rowKeyInput} required disabled={rowBusy} value={key} inputMode={lookupMode === 'row_number' ? 'numeric' : 'text'}
            onChange={event => {setKey(event.target.value);setRow(null);setRowError('');}}
            placeholder={lookupMode === 'row_number' ? source ? `1–${Math.min(source.population_count,10000)}` : 'Enter row number' : 'Enter the exact source ID'} maxLength={200}/></label>
          <p className="qr-row-help">{lookupMode === 'row_number' ? `Source rows are ordered by ${source?.key_column || 'the configured key'}. This is not a position in the random sample.` : 'Use the actual ID stored in the database. A record key is not the row position.'}</p>
          <button className="qr-button" disabled={!key.trim() || rowBusy || !source}>{rowBusy ? <LoaderCircle size={15} className="qr-spin"/> : <Search size={15}/>} {rowBusy ? "Checking…" : "Validate row"}</button>
        </form>
        {rowError && <p className="qr-inline-error" role="alert">{rowError}</p>}
        {row && <div ref={rowResult} tabIndex={-1} className="qr-row-result" role="status">
          {row.row_ref && <p>Exact saved reference {row.row_ref.slice(0,12)}… · {row.changed_since_review ? 'Source record has changed since the review' : 'Source record matches the saved review'}</p>}
          {row.lookup?.mode === 'row_number' && <p>Source row {row.lookup.row_number} of {row.lookup.total_records} · ordered by {row.lookup.order_by}</p>}
          <Badge tone={row.validation.issue_count ? "warning" : "success"}>{row.validation.issue_count} issue(s) found</Badge>
          {!row.validation.issue_count && <p>No configured row-level issues found.</p>}
          {row.validation.issues.map((issue,i) => <p key={i}><strong>{issue.column}</strong><br/>{canRecommend ? issue.recommendation : `Failed ${humanize(issue.rule)} check`}</p>)}
          <details className="qr-protected-row"><summary>View protected row</summary><dl>{Object.entries(row.masked_row).map(([column,value]) => <div key={column}><dt>{column}</dt><dd>{value == null ? 'NULL' : String(protectedValue(value))}</dd></div>)}</dl></details>
          <small>Single-row checks only. Duplicate checks need sample context. Row positions may change when source records change.</small>
        </div>}<p className="qr-helper"><LockKeyhole size={12}/> Personal values are masked.</p>
      </section>
      <section className="qr-card qr-trust"><span className="qr-trust-icon"><ShieldCheck size={22}/></span><h3>Evidence you can trace</h3><p>Every completed review has a unique run ID. Downloads belong to that saved run.</p><ul><li><Check size={13}/> Source data stays unchanged</li><li><Check size={13}/> Sensitive exports are masked</li><li><Check size={13}/> Checksums verify file integrity</li></ul>{run && <button className="qr-text-button" onClick={() => setTab("Downloads")}>View downloads <ChevronRight size={14}/></button>}</section>
      {run && <details className="qr-card qr-limitations"><summary>Scope & limitations</summary>{run.limitations.map(text => <p key={text}>{text}</p>)}</details>}
    </aside></div>
  </div>;
}
