# Integration gap review and resolution

**Update:** all six findings below have been addressed in the current working
tree. See [priority fixes and verification](priority-fixes.md) for the implemented
behavior, tests and remaining operational limits. The findings table preserves
the original audit evidence; it describes the code before these fixes.

Reviewed the current working prototype on 18 November 2026. This is a check of
the deployed APIs and source, plus isolated temporary-fixture reproductions;
it does not establish browser automation coverage.

## Verified working

- Connection registry exposes only `customer_source` and `quality_source`.
- Customer and product catalogue responses return only their selected table.
- Catalogue latest run IDs match report-detail responses; saved CSV downloads
  return HTTP 200 for those run IDs.
- Retired historical endpoint returns HTTP 404.
- All four active pages consume `DatasetContext` and the quality run catalogue.

## Findings

| Priority | Gap | Evidence and impact | Recommended change |
|---|---|---|---|
| High | A late AI review can replace fresher source results on Home | `app/lab/service.py::review_saved_run` assigns a new `created_at` to a review of old evidence; `catalogue.py::list_runs` sorts solely by that timestamp. Isolated reproduction: extraction A scored 99%, newer extraction B scored 90.83%; reviewing A afterwards made `latest` show 99%. | Track root extraction ID/time separately from review completion. Pick the freshest extraction, then its latest AI review. Keep other AI reviews visible in activity/history. |
| High | A recommended fix is not linked to a resolvable source record | `service.py::run_quality` replaces sample indexes with random `row_ref` values and does not save a server-side reference-to-source-key map. `QualityReview.jsx` only focuses a generic row input. The row endpoint accepts source keys or global row numbers, neither derived from the saved reference. | Store a protected server-side mapping scoped to the run; accept `run_id + row_ref` for authorized masked lookup/revalidation. Never expose raw identifiers in the browser. |
| Medium | A structurally incomplete saved report can break the catalogue | `catalogue.py::read_report` checks that `validation` is a dict, but not its required nested fields. `summary_record` dereferences `validation['score']` outside the per-file exception handler. A temporary report with a valid checksum and `validation={}` reproduced `KeyError: 'score'`. | Validate full report schemas before listing; isolate failures per entry; surface an integrity/schema warning while keeping good runs readable. |
| Medium | Failed execution/AI attempts are not integrated into run history | The API logs failures or returns `ai_review.status=unavailable`, but that failure metadata is not persisted as a catalogue record. The catalogue includes completed reports only. | Persist attempt records with queued/running/completed/failed states, origin, dataset, parent ID and sanitized error category. Keep artifacts optional for failed attempts. |
| Medium | Reports cannot browse beyond the newest 100 results | `list_runs(..., limit=100)` returns a truncated list; the API exposes no pagination parameter/cursor and `CatalogueReports.jsx` offers no pagination. Summary counts cover all matching results. | Add cursor pagination and UI navigation; query extraction-only history separately so many AI reviews cannot crowd source-extraction trend points out of the first page. |
| Medium | Scores have no rule/configuration version for comparable trends | The saved report records seed, counts and a fingerprint of sampled keys, but no rule-policy hash or configuration version. `CatalogueHome` plots extraction scores together for a table. A rule or threshold change can resemble a data-quality change. | Record a non-secret policy snapshot/hash and sample-selection version; distinguish or filter trend series when assessment criteria change. |

## Additional UI synchronization risk

`QualityReview.jsx` synchronizes `savedRun` only when `savedRun.run_id` changes,
and skips synchronization while a review is busy. If a newer shared result arrives
then, becoming idle does not trigger that effect again. This is a source-confirmed
code-path risk; the browser race was not reproduced. Reconcile pending catalogue
updates when the active review finishes, using extraction lineage/freshness rather
than blindly replacing local state.

## Reproduction scope

The delayed-AI and malformed-report checks used an isolated SQLite fixture and
injected model decisions; no connected PostgreSQL records were altered. The
99% and 90.83% figures above belong to those temporary test data, not the live
customer dataset. Live customer and product catalogue checks returned 85% and
100%, respectively, at audit time.

The original priorities were extraction lineage/freshness, protected row
resolution, and complete report-schema validation. The update also adds API
attempt history, cursor pagination, assessment versioning and pending UI result
reconciliation. Browser automation and production deployment remain unverified.
