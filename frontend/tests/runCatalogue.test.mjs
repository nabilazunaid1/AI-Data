import test from 'node:test';
import assert from 'node:assert/strict';
import { datasetKey,datasetParams,matchesDataset,selectedCatalogueReport,shouldAdoptSavedRun } from '../src/services/runCatalogue.js';
test('every page uses the same connection/schema/table filter contract',()=>{
  const selection={connection_id:'customer_source',schema_name:'public',table_name:'products'};
  assert.deepEqual(Object.fromEntries(datasetParams(selection)),selection);
  assert.equal(datasetKey({...selection}),datasetKey(selection));
  assert.notEqual(datasetKey({...selection,table_name:'customers'}),datasetKey(selection));
});
test('saved results must match all selected dataset identifiers',()=>{
  const selection={connection_id:'customer_source',schema_name:'public',table_name:'customers'};
  const report={dataset:{connection_id:'customer_source',schema:'public',table:'customers'}};
  assert.equal(matchesDataset(report,selection),true);
  for(const field of ['connection_id','schema_name','table_name'])assert.equal(matchesDataset(report,{...selection,[field]:'other'}),false);
});
test('Reports handles an empty catalogue and rejects detail retained from another dataset',()=>{
  assert.equal(selectedCatalogueReport(null,null,undefined,'products'),null);
  assert.equal(selectedCatalogueReport(null,{latest:null},undefined,'products'),null);
  const old={id:'old-run',key:'customers',report:{run_id:'old-run'}};
  assert.equal(selectedCatalogueReport(old,{latest:null},'old-run','products'),null);
  const current={run_id:'new-run'};
  assert.equal(selectedCatalogueReport(old,{latest:current},'new-run','products'),current);
});
test('a pending newer extraction is adopted after busy work finishes; stale AI cannot roll it back',()=>{
  const oldAI={run_id:'old-ai',root_run_id:'source-a',extracted_at:'2026-11-18T01:00:00+00:00',created_at:'2026-11-18T01:20:00+00:00',agent:{ai_used:true}};
  const fresh={run_id:'source-b',root_run_id:'source-b',extracted_at:'2026-11-18T01:10:00+00:00',created_at:'2026-11-18T01:10:01+00:00',agent:{ai_used:false}};
  assert.equal(shouldAdoptSavedRun(oldAI,fresh),true);
  assert.equal(shouldAdoptSavedRun(fresh,oldAI),false);
  const reviewed={...fresh,run_id:'new-ai',created_at:'2026-11-18T01:21:00+00:00',agent:{ai_used:true}};
  assert.equal(shouldAdoptSavedRun(fresh,reviewed),true);
  assert.equal(shouldAdoptSavedRun(reviewed,fresh),false);
  assert.equal(shouldAdoptSavedRun(reviewed,reviewed),false);
});
