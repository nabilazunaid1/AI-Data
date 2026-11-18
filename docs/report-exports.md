# Startup fix and structured report exports

## Blank-screen cause and fix

The previous `QualityReview.jsx` saved-run effect compared an absent report's
optional connection ID with an absent dataset's connection ID. Both were
`undefined`, so the comparison passed and the next condition dereferenced
`savedRun.dataset`. The hidden Data Check panel mounts on Home, so this effect
crashed the whole application during cold startup.

Edge reproduced two `Cannot read properties of undefined (reading 'dataset')`
errors and an empty page body. The effect now uses
`runCatalogue.js::matchesDataset`, which requires both report and dataset.
`AppErrorBoundary.jsx`, mounted in `main.jsx`, provides a visible reload action
for unexpected future rendering failures. It does not replace normal source or
API error messages.

## Download formats

Every active review surface uses the same PDF generator and naming rules.
Example: `ai-data-guardian_quality_source_quality_lab-quality_fixture_20261118_c441c1e5_quality-report.pdf`.

| Download | Structure and purpose |
|---|---|
| PDF assessment report | A4 pages, branded running headers, navy/teal styling, summary metrics, dataset/run lineage, sample scope, assessment policy hash, complete finding tables, anomalies, privacy classifications, per-column profiles, before/after output corrections, tool evidence, warehouse summary when available, limitations and numbered footers. Long tables repeat headers. |
| Report JSON | Original pretty-printed machine-readable saved report. Downloading preserves its bytes and checksum. |
| Protected data CSV | UTF-8 with BOM for spreadsheet compatibility; one header row, protected row reference first, then masked source columns. Formula-like strings are escaped. |
| Correction log CSV | Fixed order: `row_ref,column,rule,before,after,applied_to`. Newly generated empty logs contain these headers and zero data rows. Corrections affect exported output only. |
| Execution trace JSON | Pretty-printed saved tool decisions, plans and observations. |
| Integrity manifest JSON | Original artifact filenames, SHA256 hashes and byte sizes. Presentation filenames differ; map them using the download type. |

Standard PDF reports do not show recommended next steps. Completed AI-reviewed
reports include the guidance attached to their verified findings. PDF generation
uses the displayed saved evidence and never re-extracts or corrects source data.
The PDF is a derived presentation and is not part of the original manifest.
Existing immutable artifacts are not rewritten; rerun an older review to obtain
new correction-log headers. Original JSON recommendations remain in their saved
machine-readable contract.

Backend filenames/media types are set in `app/lab/exports.py` and
`quality_lab_api.py::download`. Frontend names are defined in `exportNames.js`;
`cataloguePdf.js::buildCataloguePdf` implements the report. Data Check and
`CatalogueRunDetails` both call these shared exporters.

## Evidence

- Backend: **40 tests passed**; frontend: **13 tests passed**; build succeeded.
- Edge browser automation: **5 tests passed**, including a deliberately delayed
  connection registry, navigation, PDF/CSV downloads, empty/error states and
  a simulated render failure with a visible recovery action.
- Home action labels are checked at 1440, 960, 700 and 390 pixels. The responsive
  `font-size:0` rule was removed and intro actions wrap with readable labels.
  Older verified reports without connection/table metadata appear in an
  expandable informational archive notice, separately from integrity failures.
  Their files remain preserved. See [responsive verification](responsive-home-verification.json).
- Live customer review: eight rows and six columns; all four pages opened and
  six file downloads succeeded without page errors. The empty change log had
  headers; the original evidence matched manifest SHA256 values. See
  [customer verification](report-download-verification.json).
- Live quality-fixture review: 100 of 150 rows, 50 columns, saved corrections and
  warehouse evidence; all six downloads succeeded and their original hashes
  matched. See [fixture verification](report-download-verification-fixture.json).
- The rendered customer PDF had four pages and the fixture PDF six. The optional
  renderer found zero text spans outside page boundaries; required sections and
  running headers were present. Selected pages were visually inspected.

Reproduce from `frontend` with the backend running and local development
authentication disabled:

```text
npm test
npm run test:browser
npm run build
node scripts/verify-live-workspace.mjs
node scripts/verify-live-workspace.mjs --quality-fixture
```

Browser tests mock API responses for repeatability; the two live scripts use the
actual local PostgreSQL connection and create saved review artifacts. Neither
modifies source records. Downloaded samples/screenshots are excluded from Git
under `frontend/test-results/live`. Optional PDF visual inspection requires
`pymupdf` and can be run from the repo root with
`backend/.venv/Scripts/python.exe backend/scripts/inspect_exported_pdf.py`.
