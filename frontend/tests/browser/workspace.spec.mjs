import { test,expect } from '@playwright/test';
import { sampleReport } from '../fixtures/report.mjs';

async function mockWorkspace(page,{empty=false,unavailable=false,archive=false}={}){
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const report=sampleReport();
    if(path.endsWith('/connections')){
      // Force the initial no-selection/no-saved-run render that previously crashed.
      await new Promise(resolve=>setTimeout(resolve,400));
      if(unavailable)return route.fulfill({status:503,json:{detail:'Connection registry temporarily unavailable'}});
      return route.fulfill({json:{connections:[{id:'customer_source',name:'Customer Database',tables:[{schema:'public',name:'customers'}]}]}});
    }
    if(path.endsWith('/quality/context'))return route.fulfill({json:{...report.dataset,sample_size:8,population_count:8,column_count:3,key_column:'customer_id'}});
    if(path.endsWith('/quality/catalogue'))return route.fulfill({json:{latest:empty?null:report,runs:[],trend:[],warnings:[],
      archive:{unassigned_count:archive?2:0,unassigned_reports:archive?[{run_id:'old-report-a'},{run_id:'old-report-b'}]:[]},
      summary:{saved_results:empty?0:1,source_extractions:empty?0:1,ai_reviews:0},attempt_summary:{completed:0,running:0,failed:0},page:{next_cursor:null}}});
    if(path.includes('/quality/catalogue/'))return route.fulfill({json:report});
    if(path.endsWith('/quality/attempts'))return route.fulfill({json:{attempts:[],page:{next_cursor:null}}});
    if(path.endsWith('/quality/runs'))return route.fulfill({json:report});
    if(path.endsWith('/masked.csv'))return route.fulfill({contentType:'text/csv',body:'row_ref,customer_id,email\r\n'+ 'a'.repeat(24)+',*****,*****\r\n'});
    if(path.endsWith('/report.json'))return route.fulfill({json:report});
    return route.fulfill({json:{tables:[],rows:[],status:'success'}});
  });
  return errors;
}

test('cold startup, every main page and PDF/CSV downloads work without runtime errors',async({page})=>{
  const errors=await mockWorkspace(page);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();
  await expect(page.getByText('97.5%',{exact:true}).first()).toBeVisible();
  for(const name of ['Data Check','Pipeline','Reports','Home']){
    await page.locator('nav').getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  }
  await page.locator('nav').getByRole('button',{name:'Reports',exact:true}).click();
  const reportDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'PDF assessment report',exact:true}).click();
  const pdf=await reportDownload;
  expect(pdf.suggestedFilename()).toBe('ai-data-guardian_customer_source_public-customers_20261118_12345678_quality-report.pdf');
  const path=test.info().outputPath(pdf.suggestedFilename());await pdf.saveAs(path);
  const {readFile}=await import('node:fs/promises');expect((await readFile(path)).subarray(0,5).toString()).toBe('%PDF-');
  const csvDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Protected data CSV',exact:true}).click();
  expect((await csvDownload).suggestedFilename()).toContain('public-customers_20261118_12345678_protected-data.csv');
  await page.locator('nav').getByRole('button',{name:'Data Check',exact:true}).click();
  await page.getByRole('tab',{name:'Downloads',exact:true}).click();
  const dataCheckPdf=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download Quality assessment report',exact:true}).click();
  expect((await dataCheckPdf).suggestedFilename()).toBe(pdf.suggestedFilename());
  expect(errors).toEqual([]);
});

test('no saved runs displays an actionable empty state',async({page})=>{
  const errors=await mockWorkspace(page,{empty:true});await page.goto('/');
  await expect(page.getByRole('heading',{name:'No saved extractions yet'})).toBeVisible();
  await page.locator('nav').getByRole('button',{name:'Reports',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No saved result for this dataset'})).toBeVisible();expect(errors).toEqual([]);
});

test('unavailable connection registry leaves navigation and a visible error',async({page})=>{
  const errors=await mockWorkspace(page,{unavailable:true});await page.goto('/');
  await expect(page.getByText('Connection registry temporarily unavailable')).toBeVisible();
  await expect(page.locator('nav').getByRole('button',{name:'Data Check',exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('empty proxy failure stops loading and Refresh recovers when the backend returns',async({page})=>{
  const errors=await mockWorkspace(page);let offline=true;
  await page.route('**/api/v1/connections',route=>offline?route.fulfill({status:500,body:''}):route.fallback());
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText('Cannot reach the application backend. Start the backend service, then select Refresh.');
  await expect(page.getByRole('combobox',{name:'Database connection',exact:true})).toContainText('Connections unavailable');
  await expect(page.getByText('Testing source…',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Loading connections…',{exact:true})).toHaveCount(0);
  const refresh=page.getByRole('button',{name:'Refresh',exact:true});await expect(refresh).toBeEnabled();
  offline=false;await refresh.click();
  await expect(page.getByText('Source connected',{exact:true})).toBeVisible();
  await expect(page.getByText('97.5%',{exact:true}).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);expect(errors).toEqual([]);
});

test('unexpected rendering failures display a recovery action instead of a blank screen',async({page})=>{
  await mockWorkspace(page);
  await page.route('**/src/pages/CatalogueHome.jsx*',route=>route.fulfill({contentType:'application/javascript',
    body:'export default function BrokenPage(){throw new Error("Simulated rendering failure");}'}));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'The workspace could not be displayed'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reload workspace'})).toBeVisible();
});

test('Home actions retain readable labels at desktop, screenshot and mobile widths; old reports are explained',async({page})=>{
  const errors=await mockWorkspace(page,{archive:true});await page.goto('/');
  await expect(page.getByText('97.5%',{exact:true}).first()).toBeVisible();
  for(const width of [1440,960,700,390]){
    await page.setViewportSize({width,height:1000});
    const action=page.getByRole('button',{name:'Open Data Check',exact:true});
    await expect(action).toBeVisible();
    const layout=await action.evaluate(button=>({font:parseFloat(getComputedStyle(button).fontSize),
      width:button.getBoundingClientRect().width,right:button.getBoundingClientRect().right,viewport:innerWidth}));
    expect(layout.font).toBeGreaterThanOrEqual(10);expect(layout.width).toBeGreaterThan(100);expect(layout.right).toBeLessThanOrEqual(layout.viewport);
    await expect(page.locator('.qr-alert-warning')).toHaveCount(0);
  }
  await page.getByText('2 older saved reports have no dataset link',{exact:true}).click();
  await expect(page.getByText(/Your current scores and source data are unaffected/)).toBeVisible();
  await expect(page.getByText('old-report-a',{exact:true})).toBeVisible();
  await page.setViewportSize({width:960,height:1000});
  await page.screenshot({path:test.info().outputPath('home-960.png'),fullPage:true});
  await page.getByRole('button',{name:'Open Data Check',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Data Check',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});
