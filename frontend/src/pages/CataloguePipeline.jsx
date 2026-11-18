import { useState } from 'react';
import { Database, ShieldCheck, Workflow, FileCheck2, LoaderCircle, Play } from 'lucide-react';
import { useDataset } from '../context/DatasetContext.jsx';
import { apiJson,matchesDataset } from '../services/runCatalogue.js';
import CatalogueRunDetails from '../components/CatalogueRunDetails.jsx';
export default function CataloguePipeline(){
  const {dataset,source,catalogue,refresh}=useDataset();
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function run(){if(!dataset||!source||busy)return;setBusy(true);setError('');
    try{const report=await apiJson('quality/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...dataset,use_ai:false,origin:'pipeline'})});
      if(!matchesDataset(report,dataset))throw new Error('Pipeline result did not match the selected dataset.');refresh();
    }catch(error){setError(error.message);refresh();}finally{setBusy(false);}}
  return <div className="quality-review catalogue-page"><section className="qr-card"><div className="qr-section-heading"><div><h3>Run the selected dataset pipeline</h3><p>Uses the same sample rules and catalogue as Data Check. Outputs are saved once and reused by every page.</p></div><button className="qr-button qr-button-primary" disabled={busy||!source} onClick={run}>{busy?<LoaderCircle size={16} className="qr-spin"/>:<Play size={16}/>} {busy?'Running pipeline…':'Run pipeline'}</button></div>
    <div className="catalogue-stages">{[[Database,'Connect & extract'],[ShieldCheck,'Profile & validate'],[Workflow,'Normalize & mask'],[FileCheck2,'Save report & artifacts']].map(([Icon,label])=><div key={label}><Icon size={20}/><span>{label}</span><small>{busy?'Processing':catalogue?.latest?'Latest result available':'Ready'}</small></div>)}</div></section>
    {error&&<p className="qr-inline-error" role="alert">{error}</p>}<section className="qr-card"><CatalogueRunDetails report={catalogue?.latest}/></section>
  </div>;
}
