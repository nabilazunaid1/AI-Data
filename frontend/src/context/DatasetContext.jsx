import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiJson, datasetKey, datasetParams } from '../services/runCatalogue.js';

const Context = createContext(null);
export function DatasetProvider({ children }) {
  const [connections, setConnections] = useState([]);
  const [selection, setSelection] = useState({ connection_id: 'customer_source', schema_name: 'public', table_name: 'customers' });
  const [registryError, setRegistryError] = useState('');
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryVersion, setRegistryVersion] = useState(0);
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState(null);
  const [sourceState, setSourceState] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setRegistryError(''); setRegistryLoading(true);
    apiJson('connections', { signal: controller.signal }).then(data => {
      if (!Array.isArray(data.connections)) throw new Error('Invalid connection registry.');
      setConnections(data.connections);
    }).catch(error => { if (!controller.signal.aborted) setRegistryError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setRegistryLoading(false); });
    return () => controller.abort();
  }, [registryVersion]);
  const connection = connections.find(c => c.id === selection.connection_id) || connections[0];
  const table = connection?.tables.find(t => t.schema === selection.schema_name && t.name === selection.table_name) || connection?.tables[0];
  const dataset = useMemo(() => connection && table ? { connection_id: connection.id,
    connection_name: connection.name, schema_name: table.schema, table_name: table.name } : null,
    [connection?.id, connection?.name, table?.schema, table?.name]);
  const key = datasetKey(dataset);
  useEffect(() => {
    if (!dataset) { setSourceLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setCatalogueError('');
    setSourceLoading(true);
    apiJson(`quality/catalogue?${datasetParams(dataset)}`, { signal: controller.signal }).then(data => {
      if (!Array.isArray(data.runs)) throw new Error('Invalid run catalogue.');
      setSaved({ key, data });
    }).catch(error => { if (!controller.signal.aborted) setCatalogueError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    apiJson(`quality/context?${datasetParams(dataset)}`, { signal: controller.signal })
      .then(data => setSourceState({ key, data, error: '' }))
      .catch(error => { if (!controller.signal.aborted) setSourceState({ key, data: null, error: error.message }); })
      .finally(() => { if (!controller.signal.aborted) setSourceLoading(false); });
    return () => controller.abort();
  }, [key, version, registryVersion]);
  function selectConnection(id) {
    const first = connections.find(c => c.id === id)?.tables[0];
    if (first) setSelection({ connection_id: id, schema_name: first.schema, table_name: first.name });
  }
  function selectTable(schema, name) {
    if (connection?.tables.some(t => t.schema === schema && t.name === name))
      setSelection({ connection_id: connection.id, schema_name: schema, table_name: name });
  }
  return <Context.Provider value={{ connections, connection, dataset, selectConnection, selectTable,
    catalogue: saved?.key === key ? saved.data : null,
    source: sourceState?.key === key ? sourceState.data : null,
    sourceError: sourceState?.key === key ? sourceState.error : '',
    registryError, registryLoading, sourceLoading, catalogueError, loading,
    refresh: () => setVersion(n => n + 1), refreshAccess: () => setRegistryVersion(n => n + 1) }}>
    {children}
  </Context.Provider>;
}
export function useDataset() { return useContext(Context); }
