import { Database, RefreshCw } from 'lucide-react';
import { useDataset } from '../context/DatasetContext.jsx';
export default function DatasetSelector() {
  const state = useDataset();
  const status = state.registryError ? 'Connections unavailable' : state.registryLoading ? 'Loading connections…' :
    !state.dataset ? 'Select a dataset' : state.sourceLoading ? 'Testing source…' : state.source ? 'Source connected' :
    state.sourceError ? 'Source unavailable' : 'Source not checked';
  return <section className="qr-card shared-dataset-selector">
    <div className="shared-dataset-heading"><Database size={19}/><div><h2>Dataset workspace</h2><p>One selection for Home, Data Check, Pipeline and Reports.</p></div>
      <button className="qr-button qr-button-quiet" onClick={() => {state.refresh();state.refreshAccess();}} disabled={state.loading || state.registryLoading}><RefreshCw size={14}/> Refresh</button></div>
    <div className="shared-dataset-fields"><label className="qr-field"><span>Database connection</span><select value={state.dataset?.connection_id || ''} onChange={e => state.selectConnection(e.target.value)} disabled={!state.connections.length}>
      {!state.connections.length && <option value="">{state.registryLoading ? 'Loading connections…' : state.registryError ? 'Connections unavailable' : 'No connections configured'}</option>}{state.connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select></label><label className="qr-field"><span>Table / warehouse dataset</span><select value={state.dataset ? JSON.stringify([state.dataset.schema_name,state.dataset.table_name]) : ''} onChange={e => state.selectTable(...JSON.parse(e.target.value))} disabled={!state.dataset}>
      {!state.dataset && <option value="">Select a connection</option>}{state.connection?.tables.map(t => <option key={`${t.schema}.${t.name}`} value={JSON.stringify([t.schema,t.name])}>{t.schema}.{t.name}</option>)}
    </select></label><div className="shared-source-status"><span className={`qr-badge ${status === 'Source connected' ? 'qr-badge-success' : 'qr-badge-warning'}`}>{status}</span><small>{state.source ? `${state.source.population_count} source rows · ${state.source.column_count} columns` : 'Saved reports remain separate from source availability.'}</small></div></div>
    {state.registryError && <p className="qr-inline-error" role="alert">{state.registryError}</p>}
    {state.sourceError && <p className="qr-inline-error" role="alert">{state.sourceError}</p>}
  </section>;
}
