import { Component } from 'react';
import { ShieldAlert } from 'lucide-react';

export default class AppErrorBoundary extends Component {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error,info){console.error('Application rendering failed',error,info.componentStack);}
  render(){
    if(!this.state.failed)return this.props.children;
    return <main className="app-recovery" role="alert"><ShieldAlert size={36}/>
      <p className="qr-eyebrow">AI DATA GUARDIAN</p><h1>The workspace could not be displayed</h1>
      <p>A page encountered an unexpected error. Reload the workspace to reconnect and retrieve your saved results.</p>
      <button className="qr-button qr-button-primary" onClick={()=>window.location.reload()}>Reload workspace</button>
    </main>;
  }
}
