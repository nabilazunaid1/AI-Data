import assert from 'node:assert/strict';
import fs from 'node:fs';
const root='http://127.0.0.1:8000/api/v1/quality/';
async function request(path,body,expected=200){
  const response=await fetch(root+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;
}
const dataset={connection_id:'customer_source',schema_name:'public',table_name:'customers'};
const report=await request('runs',{...dataset,use_ai:false});
assert.equal(report.root_run_id,report.run_id);assert.ok(report.assessment.hash);assert.equal(report.row_reference_lookup,true);
const reference=report.validation.issues[0].row_ref;
const row=await request(`runs/${report.run_id}/validate-reference`,{row_ref:reference});
assert.equal(row.row_ref,reference);assert.equal(row.dataset.table,'customers');
assert.equal(row.changed_since_review,false);assert.equal(row.masked_row.customer_id,'*****');
await request(`runs/${report.run_id}/.row-references.json`,null,404);
const first=await request('catalogue?'+new URLSearchParams({...dataset,limit:'1'}));
assert.equal(first.latest.root_run_id,report.run_id);assert.ok(first.page.next_cursor);
const next=await request('catalogue?'+new URLSearchParams({...dataset,limit:'1',cursor:first.page.next_cursor}));
assert.notEqual(first.runs[0].run_id,next.runs[0].run_id);
await request('catalogue?'+new URLSearchParams({...dataset,table_name:'products',cursor:first.page.next_cursor}),null,400);
const attempts=await request('attempts?'+new URLSearchParams({...dataset,limit:'20'}));
assert.ok(attempts.attempts.some(a=>a.run_id===report.run_id&&a.status==='completed'));
const evidence={run_id:report.run_id,root_run_id:report.root_run_id,assessment_hash:report.assessment.hash,
  exact_row_resolved:true,source_keys_masked:true,private_mapping_download_status:404,
  cursor_pagination:true,cross_dataset_cursor_rejected:true,completed_attempt_recorded:true};
fs.writeFileSync('docs/priority-fixes-verification.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
