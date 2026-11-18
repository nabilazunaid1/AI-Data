import { useEffect,useState } from 'react';
import { useDataset } from '../context/DatasetContext.jsx';
import { apiJson,datasetKey,matchesDataset,selectedCatalogueReport } from '../services/runCatalogue.js';
import CatalogueRunDetails,{date,number} from '../components/CatalogueRunDetails.jsx';
import CatalogueNotices from '../components/CatalogueNotices.jsx';
export default function CatalogueReports(){
  const {dataset,catalogue,catalogueError,loading}=useDataset();
  const [choice,setChoice]=useState(null);const [detail,setDetail]=useState(null);const [error,setError]=useState('');
  const [view,setView]=useState('results');
  const [navigation,setNavigation]=useState(null);
  const [page,setPage]=useState(null);
  const [pageLoading,setPageLoading]=useState(false);
  const key=datasetKey(dataset);
  const scope=key+'|'+view;
  const stack=navigation?.scope===scope?navigation.stack:[null];
  const cursor=stack[stack.length-1];
  const pageKey=scope+'|'+(cursor||'first');
  const currentPage=page?.key===pageKey?page.data:null;
  const rows=view==='results'?currentPage?.runs||[]:currentPage?.attempts||[];
  const refreshKey=JSON.stringify([catalogue?.summary,catalogue?.attempt_summary]);
  useEffect(()=>{
    if(!dataset)return;const controller=new AbortController();setPageLoading(true);setError('');
    const params=new URLSearchParams({connection_id:dataset.connection_id,schema_name:dataset.schema_name,table_name:dataset.table_name,limit:'20'});
    if(cursor)params.set('cursor',cursor);
    apiJson(`quality/${view==='results'?'catalogue':'attempts'}?${params}`,{signal:controller.signal}).then(data=>setPage({key:pageKey,data}))
      .catch(error=>{if(!controller.signal.aborted)setError(error.message);}).finally(()=>{if(!controller.signal.aborted)setPageLoading(false);});
    return()=>controller.abort();
  },[pageKey,refreshKey]);
  const selectedId=choice?.scope===pageKey?choice.id:view==='results'?(stack.length===1?catalogue?.latest?.run_id:rows[0]?.run_id):null;
  useEffect(()=>{if(!selectedId)return;const controller=new AbortController();setError('');
    apiJson(`quality/catalogue/${selectedId}`,{signal:controller.signal}).then(report=>{
      if(!matchesDataset(report,dataset))throw new Error('Selected report belongs to a different dataset.');
      setDetail({id:selectedId,key,report});
    }).catch(error=>{if(!controller.signal.aborted)setError(error.message);});return()=>controller.abort();
  },[selectedId,key]);
  const report=selectedCatalogueReport(detail,catalogue,selectedId,key);
  return <div className="quality-review catalogue-page"><section className="qr-intro"><div><div className="qr-eyebrow">SHARED RUN CATALOGUE</div><h2>Reports for the selected dataset</h2><p>Includes Data Check, Pipeline and AI evidence reviews. Downloads retrieve saved artifacts without rerunning extraction.</p></div></section>
    {(error||catalogueError)&&<p className="qr-inline-error" role="alert">{error||catalogueError}</p>}{(loading||pageLoading)&&<p role="status">Refreshing reports…</p>}
    <CatalogueNotices catalogue={catalogue}/>
    <div className="qr-tabs"><button aria-selected={view==='results'} onClick={()=>setView('results')}>Saved results</button><button aria-selected={view==='attempts'} onClick={()=>setView('attempts')}>Execution attempts {catalogue?.attempt_summary?.failed?`· ${catalogue.attempt_summary.failed} failed`:''}</button></div>
    <section className="qr-card"><div className="qr-table-scroll">{view==='results'?<table className="qr-table"><thead><tr><th>Run</th><th>Origin</th><th>Rows sampled</th><th>Score</th><th>Issues</th><th>Assessment</th><th>Completed</th><th>Action</th></tr></thead><tbody>{rows.map(r=><tr key={r.run_id} className={selectedId===r.run_id?'catalogue-selected-row':''}><td><code>{r.run_id.slice(0,8)}</code></td><td>{r.origin}</td><td>{r.sample_count} / {r.population_count}</td><td>{number(r.quality_score)}%</td><td>{r.issue_count}</td><td title={r.assessment_hash}>{r.assessment_hash==='legacy-unversioned'?'Legacy':r.assessment_hash?.slice(0,8)}</td><td>{date(r.created_at)}</td><td><button className="qr-text-button" onClick={()=>setChoice({scope:pageKey,id:r.run_id})}>View report</button></td></tr>)}</tbody></table>:<table className="qr-table"><thead><tr><th>Attempt</th><th>Origin</th><th>Status</th><th>Started</th><th>Updated</th><th>Outcome</th></tr></thead><tbody>{rows.map(r=><tr key={r.attempt_id}><td><code>{r.attempt_id.slice(0,8)}</code></td><td>{r.origin}</td><td><span className={`qr-badge ${r.status==='failed'?'qr-badge-warning':r.status==='completed'?'qr-badge-success':''}`}>{r.status}</span></td><td>{date(r.created_at)}</td><td>{date(r.updated_at)}</td><td>{r.run_id?<button className="qr-text-button" onClick={()=>setChoice({scope:pageKey,id:r.run_id})}>View saved result</button>:r.error_code||'In progress'}</td></tr>)}</tbody></table>}</div>
      {!rows.length&&!pageLoading&&<p className="qr-tab-description">No {view==='results'?'saved results':'API execution attempts'} for this dataset.</p>}
      <div className="catalogue-pagination"><button className="qr-button" disabled={pageLoading||stack.length===1} onClick={()=>setNavigation({scope,stack:stack.slice(0,-1)})}>Previous</button><span>Page {stack.length} · {rows.length} result(s)</span><button className="qr-button" disabled={pageLoading||!currentPage?.page?.next_cursor} onClick={()=>setNavigation({scope,stack:[...stack,currentPage.page.next_cursor]})}>Next</button></div>
      {view==='attempts'&&<p className="qr-tab-description">API attempts are recorded from this update onward. CLI and older failures are not reconstructed. A running entry can remain after an interrupted server process.</p>}
    </section>
    <section className="qr-card"><CatalogueRunDetails report={report}/></section>
  </div>;
}
