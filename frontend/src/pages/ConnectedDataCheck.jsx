import { useCallback, useEffect, useState } from 'react';
import { useDataset } from '../context/DatasetContext.jsx';
import QualityReview from './QualityReview.jsx';
import CustomerDataCheck from './DataCheck.jsx';

export default function ConnectedDataCheck({ request }) {
  const {dataset,selectTable,refresh,refreshAccess,catalogue} = useDataset();
  const [view,setView] = useState('quality');
  const [fixRequest,setFixRequest] = useState(null);
  useEffect(() => { if(request) setView('quality'); },[request]);
  useEffect(() => {setView('quality');setFixRequest(null);},[dataset?.connection_id]);
  useEffect(() => {setFixRequest(null);},[dataset?.schema_name,dataset?.table_name]);
  const onTableChange = useCallback(name => {selectTable('public',name);setFixRequest(null);},[dataset?.connection_id]);
  return <div className="connected-data-check">
    <div className="qr-tabs"><button aria-selected={view==='quality'} onClick={() => setView('quality')}>Data quality checks</button>
      {dataset?.connection_id==='customer_source' && <button aria-selected={view==='browse'} onClick={() => setView('browse')}>SQL & evidence</button>}</div>
    <div hidden={view!=='quality'}><QualityReview key={dataset ? JSON.stringify([dataset.connection_id,dataset.schema_name,dataset.table_name]) : 'none'} dataset={dataset} request={request}
      onAccessChange={refreshAccess} onRunSaved={refresh} savedRun={catalogue?.latest} onOpenSql={dataset?.connection_id==='customer_source' ? action => {
        if(action.dataset.connection_id!==dataset.connection_id || action.dataset.schema!==dataset.schema_name || action.dataset.table!==dataset.table_name)return;
        setFixRequest({...action,navigationId:Date.now()});setView('browse');
      }:undefined}/></div>
    {dataset?.connection_id==='customer_source' && <div hidden={view!=='browse'}><CustomerDataCheck tableName={dataset.table_name} onTableChange={onTableChange} fixRequest={fixRequest}/></div>}
  </div>;
}
