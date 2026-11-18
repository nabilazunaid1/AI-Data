import { useState } from 'react';
import { ShieldCheck, House, Database, Workflow, ChartNoAxesCombined, Settings, Bot } from 'lucide-react';
import { DatasetProvider, useDataset } from './context/DatasetContext.jsx';
import DatasetSelector from './components/DatasetSelector.jsx';
import CatalogueHome from './pages/CatalogueHome.jsx';
import DataCheck from './pages/ConnectedDataCheck.jsx';
import CataloguePipeline from './pages/CataloguePipeline.jsx';
import CatalogueReports from './pages/CatalogueReports.jsx';
import './styles/home-extras.css';
import './styles/quality-review.css';
import './styles/catalogue.css';

const NAV = [{ name:'Home', icon:House }, { name:'Data Check', icon:Database },
  { name:'Pipeline', icon:Workflow }, { name:'Reports', icon:ChartNoAxesCombined }];
function Workspace() {
  const [page,setPage] = useState('Home');
  const [request,setRequest] = useState(null);
  const { dataset } = useDataset();
  function openReview(type) { setPage('Data Check'); setRequest({type,id:Date.now()}); }
  return <div className="application"><div className="window-bar"><span className="window-dot red"/><span className="window-dot yellow"/><span className="window-dot green"/></div><div className="app-layout">
    <aside className="sidebar"><div className="brand"><span className="brand-icon"><ShieldCheck size={27}/></span><div className="brand-text"><strong>AI Data</strong><strong>Guardian 3.0</strong></div></div>
      <nav className="navigation">{NAV.map(({name,icon:Icon}) => <button key={name} title={name} className={`nav-button ${page===name?'active':''}`} onClick={() => setPage(name)}><Icon size={19}/><span>{name}</span></button>)}</nav>
      <button title="Access settings" className="nav-button settings-button" onClick={() => openReview('access')}><Settings size={19}/><span>Settings</span></button></aside>
    <main className="main-area"><header className="page-header"><div className="page-heading"><h1>{page}</h1><p>{dataset ? `${dataset.connection_name} · ${dataset.schema_name}.${dataset.table_name}` : 'Select an approved dataset'}</p></div><button className="ai-button" onClick={() => openReview('ai')}><Bot size={18}/> AI Guardian</button></header>
      <div className="shared-dataset-container"><DatasetSelector/></div>
      {page==='Home' && <CatalogueHome onNavigate={setPage}/>}
      <div hidden={page!=='Data Check'}><DataCheck request={request}/></div>
      {page==='Pipeline' && <CataloguePipeline/>}
      {page==='Reports' && <CatalogueReports/>}
    </main></div></div>;
}
export default function WorkspaceApp() { return <DatasetProvider><Workspace/></DatasetProvider>; }
