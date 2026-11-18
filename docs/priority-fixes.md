# Priority integration fixes

Implemented and verified on 18 November 2026. The original findings are retained
in [integration-gap-review.md](integration-gap-review.md).

| Priority / finding | Implemented behavior | Code and regression evidence |
|---|---|---|
| High: delayed AI replaces fresher results | Reports retain extraction ID/time separately from AI completion. Home selects the newest extraction, then its newest matching AI review. Old reviews remain in activity history. | `backend/app/lab/service.py::review_saved_run`; `catalogue.py::list_runs`; `test_run_catalogue.py::test_delayed_ai_cannot_replace_a_newer_source_extraction` |
| High: issue reference cannot identify a source record | Each new extraction saves a signed private mapping of references to keyed source-key/row hashes. Authorized lookup finds the exact current row, executes a bound SQL lookup, revalidates saved rules and masks the response. Fix workflows have per-record verification buttons. | `row_references.py::reference_document/resolve_reference`; `source.py::lookup_hashed_key`; `quality_lab_api.py::validate_reference`; three `test_quality_lab.py::test_protected_*` tests |
| Medium: incomplete reports break listing | Reports must satisfy nested Pydantic contracts and consistent scores/counts. Invalid entries are excluded with a warning; good reports remain accessible. | `report_schema.py::SavedReport`; `catalogue.py::read_report/list_runs`; `test_nested_schema_failures_are_skipped_without_breaking_good_runs` |
| Medium: failures disappear from history | API attempts persist running/completed/failed status, origin, dataset, parent/result IDs and sanitized failure categories. Reports has an Execution attempts tab; Home shows counts. | `attempts.py::execution_attempt`; `quality_lab_api.py::run/tracked_ai_review`; `test_api_failed_attempt_is_persisted_without_sensitive_error_text`; `test_api_failed_ai_attempt_keeps_parent_and_records_lineage` |
| Medium: only 100 reports accessible | Dataset-scoped cursors paginate results and attempts. Reports provides Previous/Next controls, 20 entries per page. Summary/latest/trend are independent of page size. | `catalogue.py::paginate`; `CatalogueReports.jsx`; `test_cursor_pages_cover_more_than_100_results_without_duplicates` (106 results) |
| Medium: incomparable score trends | New reports store an engine version, sampling version and SHA256 hash of a non-secret policy snapshot. Home plots only extractions matching the latest assessment; Reports labels each version. | `assessment.py::assessment`; `report_schema.py::Assessment`; `catalogue.py::list_runs`; `test_assessment_hash_changes_only_with_assessment_criteria` |
| UI synchronization edge | Pending shared results are reconsidered after local work becomes idle. Extraction freshness prevents an older AI result from replacing a newer sample. | `QualityReview.jsx` savedRun effect; `runCatalogue.js::shouldAdoptSavedRun`; frontend freshness regression test |

Paths in the table are relative to `backend/app/lab`, `backend/tests`, or the
named frontend source directory as appropriate. API routes are in
`backend/app/api/quality_lab_api.py`.

## Verification

- Backend: **37 tests passed** using `python -m unittest discover -s tests -v`.
- Frontend: **9 tests passed** using `npm test`; `npm run build` succeeded.
- Live PostgreSQL HTTP checks: [priority-fixes-verification.json](priority-fixes-verification.json).
  The script creates a Standard customer review, verifies a saved issue reference,
  asserts identifiers are masked, rejects private mapping downloads, traverses a
  page cursor, rejects cross-dataset cursor reuse and finds the completed attempt.
- Run it from the repository root with backend available on port 8000:
  `node backend/scripts/verify_priority_fixes.mjs`. It assumes localhost development
  authentication is disabled and existing customer issues/history are present.
- Regression data changes use isolated temporary SQLite fixtures. Live checks
  read PostgreSQL data and create local artifacts; they do not correct source data.

## Demo checklist

1. Select a connection/table; run Standard review in Data Check. Confirm the same
   saved ID and scores on Home, Pipeline and Reports.
2. Complete an AI review, select a recommended fix, then verify an affected
   record using its protected reference. Inspect masked values and current issues.
3. Create a newer extraction, then AI-review an older saved run through the API.
   Home must retain the newer extraction; Reports must contain the older AI child.
   The regression test proves this deterministically without a live model.
4. Inspect Saved results pagination and Execution attempts. A model outage should
   record a failed AI attempt while the Standard report stays downloadable.
5. On an isolated fixture, change a quality rule and rerun. Reports should show a
   different assessment hash; Home should compare only the new assessment series.
6. Use the malformed-report and mapping-tamper tests to prove rejection safely;
   do not corrupt active deployment artifacts for a demo.

## Remaining limits

- Earlier extractions lack private reference mappings and assessment hashes.
  Run a new review to enable exact-reference verification; old scores are labelled
  `legacy-unversioned`. No identifiers or mappings are guessed retrospectively.
- Failed API attempts are recorded from this update onward. Direct CLI failures
  and older failures are not backfilled. There is no queued job service; a crash
  can leave a running attempt until operational reconciliation is added.
- Keep the artifact store and `.private/row-reference.key` together in backups.
  Losing that key prevents resolution of existing references. It is never exposed
  through report-download routes; Windows access uses inherited filesystem ACLs.
- Exact lookup scans a bounded set of source keys (maximum 10,000 rows), then uses
  bound SQL for the matched key. Larger warehouses need an indexed adapter.
  Deleted records or changed primary keys return an unavailable-record response.
  Single-row checks exclude uniqueness; rerun the sample review for that check.
- The policy hash records assessment criteria and a manually maintained engine
  version. Future rule-algorithm changes must bump that version. Older versions
  remain available in Reports. It is not a full environment lockfile.
- Catalogue storage remains local files with bounded scans, not a distributed
  job/catalogue service. Docker execution: **Not found / cannot verify**.
  Subsequent browser startup/navigation/download checks are documented in
  [report exports](report-exports.md). The pending-result race itself is covered
  by state-selection tests, not a reproduced automated browser race.
