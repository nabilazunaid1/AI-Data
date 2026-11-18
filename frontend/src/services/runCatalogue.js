import { guardianFetch } from './apiClient.js';
import { exportFilename } from './exportNames.js';

export function datasetKey(dataset) {
  return dataset ? JSON.stringify([dataset.connection_id, dataset.schema_name, dataset.table_name]) : '';
}
export function datasetParams(dataset) {
  return new URLSearchParams({ connection_id: dataset.connection_id,
    schema_name: dataset.schema_name, table_name: dataset.table_name });
}
export function matchesDataset(report, dataset) {
  return !!report && !!dataset && report.dataset?.connection_id === dataset.connection_id &&
    report.dataset?.schema === dataset.schema_name && report.dataset?.table === dataset.table_name;
}
export function selectedCatalogueReport(detail, catalogue, runId, selectionKey) {
  if (!runId) return null;
  if (detail?.id === runId && detail.key === selectionKey) return detail.report;
  return catalogue?.latest?.run_id === runId ? catalogue.latest : null;
}
export function shouldAdoptSavedRun(current, incoming) {
  if (!incoming || current?.run_id === incoming.run_id) return false;
  if (!current) return true;
  const root = run => run.root_run_id || run.parent_run_id || run.run_id;
  const time = run => Date.parse(run.extracted_at || run.created_at);
  if (root(current) === root(incoming)) {
    if (current.agent?.ai_used && !incoming.agent?.ai_used) return false;
    return Date.parse(incoming.created_at) > Date.parse(current.created_at);
  }
  if (time(current) !== time(incoming)) return time(incoming) > time(current);
  return root(incoming) > root(current);
}
export async function apiJson(path, options = {}) {
  const response = await guardianFetch(`/api/v1/${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${response.status}).`);
  return data;
}
export async function downloadArtifact(runId, name, report) {
  const response = await guardianFetch(`/api/v1/quality/runs/${runId}/${name}`);
  if (!response.ok) throw new Error('Saved artifact is unavailable or failed verification.');
  const blob=await response.blob();
  if(!blob.size)throw new Error('The server returned an empty evidence file.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = exportFilename(report,name,runId);
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
