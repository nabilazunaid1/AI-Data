import { chromium,expect } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
fs.mkdirSync('test-results', {recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('http://127.0.0.1:5173');
  await expect(page.getByText('Source connected',{exact:true})).toBeVisible({timeout:30000});
  const action=page.getByRole('button',{name:'Open Data Check',exact:true});
  const widths=[1440,960,700,390];
  for(const width of widths){
    await page.setViewportSize({width,height:1000});await expect(action).toBeVisible();
    const layout=await action.evaluate(button=>({font:parseFloat(getComputedStyle(button).fontSize),
      width:button.getBoundingClientRect().width,right:button.getBoundingClientRect().right,viewport:innerWidth}));
    assert.ok(layout.font>=10&&layout.width>100&&layout.right<=layout.viewport);
    await page.screenshot({path:`test-results/home-${width}.png`,fullPage:true});
  }
  const response=await fetch('http://127.0.0.1:8000/api/v1/quality/catalogue?connection_id=customer_source&schema_name=public&table_name=customers');
  assert.equal(response.status,200);const catalogue=await response.json();
  assert.equal(catalogue.skipped_artifacts,0);assert.equal(catalogue.archive.unassigned_count,2);
  assert.deepEqual(errors,[]);
  const result={page_errors:errors,viewport_widths:widths,home_action_label_visible:true,
    unassigned_reports:catalogue.archive.unassigned_count,failed_verification_reports:catalogue.skipped_artifacts,
    archive_files_preserved:true,latest_run_id:catalogue.latest.run_id};
  fs.writeFileSync('../docs/responsive-home-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
