import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCataloguePdf } from '../src/services/cataloguePdf.js';
import { exportFilename } from '../src/services/exportNames.js';
import { sampleReport } from './fixtures/report.mjs';
const commands=pdf=>pdf.internal.pages.slice(1).flat().join('\n');
test('report includes scope, before/after, column evidence and numbered pages without changing saved data',()=>{
  const report=sampleReport(),before=JSON.stringify(report),pdf=buildCataloguePdf(report),text=commands(pdf);
  for(const heading of ['Data quality assessment','Validation findings','Privacy and column profile','Output corrections','Execution and evidence','Scope, limitations and integrity','97.5%','Before','After'])assert.ok(text.includes(heading),heading);
  assert.ok(!text.includes('Recommended next steps'));assert.ok(!text.includes('enforce required rule at ingestion'));
  assert.equal(JSON.stringify(report),before);assert.ok(pdf.getNumberOfPages()>=2);
  for(let page=1;page<=pdf.getNumberOfPages();page++)assert.ok(pdf.internal.pages[page].join('\n').includes(`${page} / ${pdf.getNumberOfPages()}`));
  assert.equal(Buffer.from(pdf.output('arraybuffer')).subarray(0,5).toString(),'%PDF-');
});
test('large AI reports preserve final findings and repeat table headers over pages',()=>{
  const report=sampleReport();report.agent.ai_used=true;
  report.validation.issues=Array.from({length:200},(_,i)=>({...report.validation.issues[0],column:`field_${i}`,recommendation:'Review the original value before applying a verified correction. '.repeat(3)}));
  report.validation.issue_count=200;report.validation.checks=400;report.validation.score=50;
  const pdf=buildCataloguePdf(report),text=commands(pdf);
  assert.ok(text.includes('field_199'));assert.ok(text.includes('Recommended next steps'));
  assert.ok((text.match(/Protected row reference/g)||[]).length>3);assert.ok(pdf.getNumberOfPages()>5);
});
test('all filenames identify dataset, run, date and content and remove unsafe characters',()=>{
  const report=sampleReport();
  for(const artifact of ['pdf','report.json','masked.csv','changes.csv','agent_trace.json','manifest.json']){
    assert.match(exportFilename(report,artifact),/^ai-data-guardian_customer_source_public-customers_20261118_12345678_[a-z-]+\.(pdf|json|csv)$/);
  }
  report.dataset.table='../../unsafe/name';assert.ok(!exportFilename(report,'pdf').includes('/'));
});
test('output correction evidence includes protected references and exact saved before/after labels',()=>{
  const report=sampleReport();
  report.changes=[{row_ref:'b'.repeat(24),column:'region',rule:'normalize_label',before:' central ',after:'Central',applied_to:'output_only'}];
  const text=commands(buildCataloguePdf(report));
  for(const value of ['central','Central','b'.repeat(24),'output only','normalize label'])assert.ok(text.includes(value),value);
});
