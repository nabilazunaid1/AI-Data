export default function CatalogueNotices({catalogue}){
  const archive=catalogue?.archive;
  return <>
    {catalogue?.warnings?.map(message=><p key={message} className="qr-alert qr-alert-warning" role="status">{message}</p>)}
    {archive?.unassigned_count>0&&<details className="catalogue-archive-notice">
      <summary>{archive.unassigned_count} older saved {archive.unassigned_count===1?'report has':'reports have'} no dataset link</summary>
      <p>These files have no recorded connection or table, so they cannot be matched safely to your selection. They are preserved and excluded from the catalogue. Your current scores and source data are unaffected.</p>
      <p>Run a new review for a report linked to the selected dataset.</p>
      <ul>{archive.unassigned_reports.map(report=><li key={report.run_id}><code>{report.run_id}</code> · Dataset not recorded</li>)}</ul>
    </details>}
  </>;
}
