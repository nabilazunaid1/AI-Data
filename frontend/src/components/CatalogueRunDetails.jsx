import { useState } from 'react';
import { ArrowDownToLine, FileText } from 'lucide-react';
import { downloadArtifact } from '../services/runCatalogue.js';
export const number = value => value == null ? '—' : new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(value);
export const date = value => value ? new Date(value).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'}) : '—';
export function RunMetrics({ report }) {
  return <div className="qr-metrics">{[
    ['Quality score',report ? `${number(report.validation.score)}%`:'—','Passed configured sample checks'],
    ['Rule failures',number(report?.validation.issue_count),'Issue occurrences, not distinct rows'],
    ['Sample reviewed',report ? `${report.sample_count} / ${report.population_count}`:'—','Sample / source population at run time'],
    ['Sensitive columns',report ? Object.keys(report.pii).length:'—','Masked in protected output'],
  ].map(([label,value,note]) => <article className="qr-metric" key={label}><div className="qr-metric-label">{label}</div><strong>{value}</strong><small>{note}</small></article>)}</div>;
}
export default function CatalogueRunDetails({ report }) {
  const [error,setError] = useState('');
  const [downloading,setDownloading] = useState('');
  if(!report)return <div className="qr-empty"><FileText size={28}/><h3>No saved result for this dataset</h3><p>Run Data Check or Pipeline to create a report in the shared catalogue.</p></div>;
  async function download(name) {
    setError('');setDownloading(name);
    try{if(name==='pdf'){const {downloadCataloguePdf}=await import('../services/cataloguePdf.js');await downloadCataloguePdf(report);}else await downloadArtifact(report.run_id,name,report);}
    catch(error){setError(error.message);}finally{setDownloading('');}
  }
  return <div className="catalogue-run-details"><div className="qr-section-heading"><div><h3>Saved result · {report.run_id.slice(0,8)}</h3><p>{report.dataset.connection_name} · {report.dataset.schema}.{report.dataset.table} · {date(report.created_at)}</p></div><span className="qr-badge qr-badge-success">{report.agent.ai_used?'AI evidence review':'Standard checks'}</span></div>
    <RunMetrics report={report}/><p className="qr-tab-description">Source extracted: {date(report.extracted_at || report.created_at)} · Assessment: {report.assessment?.hash?.slice(0,12) || 'Legacy, unversioned'}</p><p className="qr-tab-description">Origin: {report.origin || (report.parent_run_id?'ai_review':'data_check')} · {report.column_count} columns · {report.anomalies.length} anomalies · {report.changes.length} output corrections.{report.parent_run_id ? ` Based on saved extraction ${report.parent_run_id.slice(0,8)}; no new source extraction.`:''}</p>
    <div className="qr-table-scroll"><table className="qr-table"><thead><tr><th>Column</th><th>Failed rule</th><th>Protected row reference</th></tr></thead><tbody>{report.validation.issues.map((issue,i)=><tr key={i}><td>{issue.column}</td><td>{issue.rule}</td><td><code>{issue.row_ref}</code></td></tr>)}{!report.validation.issues.length&&<tr><td colSpan={3}>No configured rule failures in this sample.</td></tr>}</tbody></table></div>
    <p className="qr-tab-description">Share the PDF assessment report, or download original evidence for analysis and integrity verification. Filenames include the dataset, completion date and run reference.</p>
    <div className="catalogue-downloads">{[['pdf','PDF assessment report'],['report.json','Report JSON'],['masked.csv','Protected data CSV'],['changes.csv','Correction log CSV'],['agent_trace.json','Execution trace JSON'],['manifest.json','Integrity manifest JSON']].map(([name,label])=><button className={`qr-button ${name==='pdf'?'qr-button-primary':''}`} key={name} disabled={!!downloading} onClick={()=>download(name)}><ArrowDownToLine size={14}/>{downloading===name?'Preparing…':label}</button>)}</div>
    {error&&<p className="qr-inline-error" role="alert">{error}</p>}
  </div>;
}
