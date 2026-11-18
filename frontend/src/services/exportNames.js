const slug=value=>String(value??'').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,72)||'dataset';
export function exportFilename(report,artifact,runId=report?.run_id){
  const labels={'pdf':'quality-report.pdf','report.json':'quality-report.json','masked.csv':'protected-data.csv',
    'changes.csv':'correction-log.csv','agent_trace.json':'execution-trace.json','manifest.json':'integrity-manifest.json'};
  const suffix=labels[artifact]||slug(artifact);
  const dataset=report?.dataset;
  const context=dataset?`${slug(dataset.connection_id)}_${slug(dataset.schema)}-${slug(dataset.table)}_`:'';
  const date=report?.created_at?.slice(0,10).replaceAll('-','')||'';
  return `ai-data-guardian_${context}${date?date+'_':''}${slug(runId).slice(0,8)}_${suffix}`;
}
