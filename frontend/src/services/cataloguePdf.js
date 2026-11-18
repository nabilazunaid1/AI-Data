import { jsPDF } from 'jspdf';
import { exportFilename } from './exportNames.js';

const C={navy:'#15263E',teal:'#087F78',ink:'#24364B',muted:'#596B80',line:'#DCE4EC',light:'#F3F6FA',white:'#FFFFFF'};
const clean=value=>String(value??'Not recorded').replace(/[\u2010-\u2015]/g,'-').replace(/\u2026/g,'...')
  .replace(/\u2192/g,' -> ').replace(/[^\x20-\x7E\xA0-\xFF\n]/g,'?');
const human=value=>clean(value).replaceAll('_',' ');
const num=value=>value==null?'Not assessed':new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(value);
const stamp=value=>value?new Date(value).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC'):'Not recorded';

/** Build from the displayed saved run; never re-extract or change source data. */
export function buildCataloguePdf(report){
  const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});
  const left=18,width=174,bottom=277;let y=30;
  const dataset=report.dataset;
  const identity=`${dataset.schema}.${dataset.table}`;
  const ai=report.agent.ai_used===true;
  pdf.setProperties({title:`Data quality assessment | ${identity} | ${report.run_id}`,
    subject:`Saved ${ai?'AI-guided':'Standard'} sample assessment`,author:'AI Data Guardian',
    creator:'AI Data Guardian report exporter',keywords:'data quality, sample assessment, protected evidence'});
  function font(size=9,bold=false,color=C.ink){pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(color);}
  function header(){font(9,true,C.navy);pdf.text('AI DATA GUARDIAN',left,13);font(8,false,C.muted);pdf.text('DATA QUALITY ASSESSMENT',192,13,{align:'right'});pdf.setDrawColor(C.line);pdf.line(left,18,192,18);}
  function page(){pdf.addPage();header();y=30;}
  function room(height){if(y+height>bottom)page();}
  function paragraph(value,{size=9,color=C.ink,bold=false,gap=3}={}){
    font(size,bold,color);const lines=pdf.splitTextToSize(clean(value),width);
    const lineHeight=size*.43;
    for(const line of lines){room(lineHeight);font(size,bold,color);pdf.text(line,left,y);y+=lineHeight;}
    y+=gap;
  }
  function section(title,subtitle){room(30);y+=4;paragraph(title,{size:13,bold:true,color:C.navy,gap:4});
    if(subtitle)paragraph(subtitle,{size:8.5,color:C.muted,gap:4});}
  function table(headers,rows,widths){
    const size=7.7,lineHeight=3.6,pad=2.5;
    const wrap=values=>values.map((value,i)=>{font(size);return pdf.splitTextToSize(clean(value),widths[i]-2*pad);});
    const heading=wrap(headers);const headerHeight=Math.max(...heading.map(x=>x.length))*lineHeight+2*pad;
    function drawCells(cells,height,{heading=false,stripe=false}={}){
      pdf.setFillColor(heading?C.navy:stripe?C.light:C.white);pdf.rect(left,y,width,height,'F');
      let x=left;font(size,heading,heading?C.white:C.ink);
      cells.forEach((lines,i)=>{if(lines.length)pdf.text(lines,x+pad,y+pad+2.6);x+=widths[i];});
      pdf.setDrawColor(C.line);pdf.line(left,y+height,left+width,y+height);y+=height;
    }
    function next(){page();drawCells(heading,headerHeight,{heading:true});}
    room(headerHeight+11);drawCells(heading,headerHeight,{heading:true});
    rows.forEach((values,index)=>{
      const cells=wrap(values);const total=Math.max(1,...cells.map(x=>x.length));let offset=0;
      const fullHeight=total*lineHeight+2*pad;
      if(fullHeight<=bottom-30-headerHeight && y+fullHeight>bottom)next();
      while(offset<total){
        if(bottom-y<lineHeight+2*pad)next();
        const count=Math.min(total-offset,Math.floor((bottom-y-2*pad)/lineHeight));
        drawCells(cells.map(lines=>lines.slice(offset,offset+count)),count*lineHeight+2*pad,{stripe:index%2===1});
        offset+=count;if(offset<total)next();
      }
    });y+=7;
  }
  header();
  paragraph('SAVED QUALITY REVIEW',{size:8,bold:true,color:C.teal,gap:4});
  paragraph('Data quality assessment',{size:23,bold:true,color:C.navy,gap:5});
  paragraph(`${dataset.connection_name} | ${identity}`,{size:12,bold:true,gap:4});
  paragraph(`${ai?'AI-guided evidence review':'Standard rules assessment'} | Completed ${stamp(report.created_at)}`,{color:C.muted,gap:7});
  const metrics=[['SAMPLE SCORE',report.validation.score==null?'N/A':`${num(report.validation.score)}%`],
    ['RULE FAILURES',num(report.validation.issue_count)],['SENSITIVE COLUMNS',num(Object.keys(report.pii).length)],['ANOMALIES',num(report.anomalies.length)]];
  room(26);metrics.forEach(([label,value],i)=>{const x=left+i*44;
    pdf.setFillColor(C.light);pdf.roundedRect(x,y,42,23,2,2,'F');font(6.5,true,C.muted);pdf.text(label,x+3,y+6);
    font(18,true,i===0?C.teal:C.navy);pdf.text(value,x+3,y+17);});y+=32;
  const passed=report.validation.checks-report.validation.issue_count;
  paragraph(`${num(passed)} of ${num(report.validation.checks)} configured check executions passed across ${num(report.sample_count)} sampled rows (${num(report.population_count)} source rows, ${num(report.column_count)} columns).`,{size:10,gap:5});
  paragraph(report.validation.issue_count?'Rule failures require investigation. Counts represent issue occurrences; one record may have several issues.':'No configured rule failures were detected in this sample. Unchecked rules and unsampled records remain outside this assessment.',{color:C.muted,gap:5});
  table(['Assessment context','Saved value'],[
    ['Run ID',report.run_id],['Source extraction',report.root_run_id||report.parent_run_id||report.run_id],
    ['Extracted at',stamp(report.extracted_at||report.created_at)],['Origin / engine',`${human(report.origin||'data_check')} / ${report.source_engine||'Not recorded'}`],
    ['Sample seed / scope',`${report.sample_seed??'Not recorded'} / sample only`],
    ['Assessment version',report.assessment?`${report.assessment.engine_version} / ${report.assessment.sampling_version}`:'Legacy - unversioned'],
    ['Policy SHA256',report.assessment?.hash||'Not recorded'],
  ],[43,131]);
  paragraph('Reading this report',{size:10,bold:true,color:C.navy});
  paragraph('Score = passed configured checks / total check executions in the sample. It is not a population estimate or the percentage of clean records. AI inspects saved evidence; it does not recalculate scores. Corrections affect exported output only.',{size:8.5,color:C.muted});

  page();section('1. Validation findings','Protected references identify saved sample records. Source IDs and personal values are not included.');
  if(report.validation.issues.length)table(ai?['Column','Failed rule','Protected row reference','Recommended action']:['Column','Failed rule','Protected row reference'],
    report.validation.issues.map(i=>ai?[i.column,human(i.rule),i.row_ref,i.recommendation]:[i.column,human(i.rule),i.row_ref]),ai?[29,26,48,71]:[46,45,83]);
  else paragraph('No configured rule failures in this saved sample.');
  section('2. Unusual patterns','Anomalies are investigation signals. They are not proof of errors and are not automatically replaced.');
  if(report.anomalies.length)table(['Column','Method','Protected row reference'],report.anomalies.map(a=>[a.column,human(a.method),a.row_ref]),[46,45,83]);
  else paragraph('No anomalies detected by the configured methods.');
  if(ai){section('3. Recommended next steps','Guidance from the findings inspected in the completed AI review. Validate source corrections before rechecking.');
    if(report.recommendations.length)report.recommendations.forEach((r,i)=>paragraph(`${i+1}. ${r}`,{size:9}));
    else paragraph('No recommended corrective actions for this sample.');}

  section(`${ai?'4':'3'}. Privacy and column profile`,'PII classification is heuristic. All exported text is redacted; profile statistics do not expose raw records.');
  if(Object.keys(report.pii).length)table(['Sensitive column','Classification','Nonempty','Method'],Object.entries(report.pii).map(([name,p])=>[name,p.categories.map(human).join(', '),num(p.nonempty_count),human(p.method)]),[36,64,22,52]);
  else paragraph('No sensitive columns classified by the configured policy and patterns.');
  table(['Column','Missing','Distinct','Types','Sensitive','Numeric range / mean'],Object.entries(report.profiles).map(([name,p])=>[
    name,num(p.missing),num(p.distinct),p.types.join(', ')||'Empty',p.pii?'Yes':'No',p.pii?'Suppressed':p.min==null?'Not applicable':`${num(p.min)} to ${num(p.max)} / ${num(p.mean)}`]),[37,17,17,23,20,60]);

  section(`${ai?'5':'4'}. Output corrections`,'Before/after values belong to the exported sample. No source database records were modified.');
  table(['Measure','Before','After'],[['Sample score',report.validation.score==null?'N/A':`${num(report.validation.score)}%`,report.after_validation.score==null?'N/A':`${num(report.after_validation.score)}%`],
    ['Rule failures',num(report.validation.issue_count),num(report.after_validation.issue_count)],['Output corrections','-',num(report.changes.length)]],[78,48,48]);
  if(report.changes.length)table(['Column / rule','Protected row reference','Before','After','Applied to'],report.changes.map(c=>[
    `${c.column}\n${human(c.rule)}`,c.row_ref,c.before==null?'NULL':String(c.before),c.after==null?'NULL':String(c.after),human(c.applied_to)]),[34,48,32,32,28]);
  else paragraph('No output corrections were applied. There are no before/after records for this run.');

  section(`${ai?'6':'5'}. Execution and evidence`,ai?'Completed tool inspections of saved evidence. This review did not re-extract source records.':'Deterministic execution of configured quality tools. No AI inference was used.');
  table(['Step','Tool','Verified observation'],report.agent.trace.map(s=>[String(s.step),human(s.selected_tool),Object.entries(s.observation).map(([k,v])=>`${human(k)}: ${typeof v==='object'?JSON.stringify(v):v}`).join('; ')]),[14,52,108]);
  if(ai)report.agent.trace.filter(s=>s.plan?.length).forEach(s=>paragraph(`Step ${s.step} plan: ${s.plan.map(human).join(' -> ')}`,{size:8,color:C.muted}));
  if(report.sql_evidence)paragraph(`SQL evidence: ${human(report.sql_evidence.method)}. Match at run time: ${report.sql_evidence.matched?'confirmed':'not confirmed'}. Scope: ${human(report.sql_evidence.scope)}.`,{size:8.5});
  if(report.warehouse){paragraph('Warehouse summary from this saved run',{size:10,bold:true});table(['Metric','Saved value'],Object.entries(report.warehouse).map(([k,v])=>[human(k),typeof v==='object'?JSON.stringify(v):String(v)]),[65,109]);}
  section(`${ai?'7':'6'}. Scope, limitations and integrity`);
  report.limitations.forEach((item,i)=>paragraph(`${i+1}. ${item}`,{size:8.5,color:C.muted}));
  room(85);paragraph('Evidence files',{size:10,bold:true});
  table(['File','Purpose'],[['Quality report JSON','Complete machine-readable saved assessment.'],['Protected data CSV','Masked sample with output corrections and protected references.'],['Correction log CSV','Before/after output-only change log. Newly created logs retain headers when empty.'],['Execution trace JSON','Tool decisions, plans and observations.'],['Integrity manifest JSON','SHA256 and byte size of each original saved evidence file.']],[52,122]);
  paragraph('The PDF is a presentation of the selected saved report. It is not included in the saved artifact manifest. Original evidence downloads preserve their bytes and checksums. Exporting never re-extracts or modifies source data.',{size:8,color:C.muted});
  const pages=pdf.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    pdf.setPage(i);pdf.setDrawColor(C.line);pdf.line(left,283,192,283);font(7,false,C.muted);
    pdf.text(`PROTECTED SAMPLE EVIDENCE | ${report.run_id.slice(0,8)} | ${clean(identity)}`,left,288);
    pdf.text(`${i} / ${pages}`,192,288,{align:'right'});
  }
  return pdf;
}

export function downloadCataloguePdf(report){buildCataloguePdf(report).save(exportFilename(report,'pdf'));}
