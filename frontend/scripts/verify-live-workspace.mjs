import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium,expect } from '@playwright/test';

const fixture=process.argv.includes('--quality-fixture');
const selected=fixture?{connection_id:'quality_source',schema_name:'quality_lab',table_name:'quality_fixture'}:
  {connection_id:'customer_source',schema_name:'public',table_name:'customers'};
const destination=path.resolve('test-results/live');await fs.mkdir(destination,{recursive:true});
const api='http://127.0.0.1:8000/api/v1/quality/';
const response=await fetch(api+'runs',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({...selected,use_ai:false}),signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200);const report=await response.json();
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('http://127.0.0.1:5173');
  await expect(page.getByRole('combobox',{name:'Database connection',exact:true})).toBeEnabled();
  await page.getByRole('combobox',{name:'Database connection',exact:true}).selectOption(selected.connection_id);
  await expect(page.getByText('Source connected',{exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByText(`${report.validation.score}%`,{exact:true}).first()).toBeVisible({timeout:30000});
  await page.screenshot({path:path.join(destination,`${selected.connection_id}-home.png`),fullPage:true});
  for(const name of ['Data Check','Pipeline','Reports']){
    await page.locator('nav').getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  }
  await expect(page.getByRole('heading',{name:`Saved result · ${report.run_id.slice(0,8)}`})).toBeVisible({timeout:30000});
  await page.screenshot({path:path.join(destination,`${selected.connection_id}-reports.png`),fullPage:true});
  const files={};
  for(const [artifact,label] of [['pdf','PDF assessment report'],['report.json','Report JSON'],['masked.csv','Protected data CSV'],
    ['changes.csv','Correction log CSV'],['agent_trace.json','Execution trace JSON'],['manifest.json','Integrity manifest JSON']]){
    const waiting=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();
    const download=await waiting;const filename=download.suggestedFilename();
    assert.ok(filename.includes(report.run_id.slice(0,8)));await download.saveAs(path.join(destination,filename));
    files[artifact]={filename,bytes:await fs.readFile(path.join(destination,filename))};
  }
  assert.equal(files.pdf.bytes.subarray(0,5).toString(),'%PDF-');
  const manifest=JSON.parse(files['manifest.json'].bytes.toString());
  for(const artifact of ['report.json','masked.csv','changes.csv','agent_trace.json']){
    assert.equal(crypto.createHash('sha256').update(files[artifact].bytes).digest('hex'),manifest[artifact].sha256);
  }
  assert.ok(files['changes.csv'].bytes.toString('utf8').includes('row_ref,column,rule,before,after,applied_to'));
  assert.deepEqual(errors,[]);
  const evidence={run_id:report.run_id,dataset:report.dataset,sample_count:report.sample_count,column_count:report.column_count,
    page_errors:errors,source_connected:true,pages_verified:['Home','Data Check','Pipeline','Reports'],
    downloads:Object.entries(files).map(([artifact,f])=>({artifact,filename:f.filename,bytes:f.bytes.length})),original_evidence_checksums_match:true,empty_correction_log_has_headers:true};
  evidence.correction_log_has_headers=true;delete evidence.empty_correction_log_has_headers;
  await fs.writeFile(`../docs/report-download-verification${fixture?'-fixture':''}.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
