import assert from 'node:assert/strict';
import fs from 'node:fs';
const root='http://127.0.0.1:8000/api/v1/';
async function request(path,body){
  const response=await fetch(root+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));return data;
}
const registry=await request('connections');
const connections=registry.connections.map(c=>c.id);
console.log('ACTIVE_CONNECTIONS',connections);
assert.deepEqual(connections,['customer_source','quality_source']);
const evidence={connections,datasets:[],retired:[]};
for(const table of ['customers','products']){
  const dataset={connection_id:'customer_source',schema_name:'public',table_name:table};
  const check=await request('quality/runs',{...dataset,origin:'data_check',use_ai:false});
  const pipeline=await request('quality/runs',{...dataset,origin:'pipeline',use_ai:false});
  const catalogue=await request('quality/catalogue?'+new URLSearchParams(dataset));
  assert.ok(catalogue.runs.some(r=>r.run_id===check.run_id));
  assert.ok(catalogue.runs.some(r=>r.run_id===pipeline.run_id));
  assert.equal(catalogue.latest.run_id,pipeline.run_id);
  assert.ok(catalogue.runs.every(r=>r.dataset.table===table));
  const artifact=await fetch(root+'quality/runs/'+pipeline.run_id+'/masked.csv');
  assert.equal(artifact.status,200);
  evidence.datasets.push({dataset,data_check_run:check.run_id,pipeline_run:pipeline.run_id,
    latest_run:catalogue.latest.run_id,quality_score:catalogue.latest.validation.score,
    saved_results:catalogue.summary.saved_results});
  console.log('SHARED_CATALOGUE',JSON.stringify(evidence.datasets.at(-1)));
}
for(const [path,method] of [['historical/health','GET'],['reconciliation/run','POST'],['history/runs','GET'],['pipeline/run','POST']]){
  const response=await fetch(root+path,{method});assert.equal(response.status,404,path);
  evidence.retired.push({path,status:response.status});console.log('RETIRED',path,response.status);
}
fs.writeFileSync('docs/unified-deployment-verification.json',JSON.stringify(evidence,null,2));
