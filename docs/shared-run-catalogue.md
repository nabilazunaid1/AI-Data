# Shared dataset selection and run catalogue

The deployed application has two active connections: **Customer Database** and
**Quality Sample Database**. Historical monitoring and reconciliation connections
and routers are not registered. Their source modules and database objects are
preserved; legacy `public.pipeline_runs` is no longer the application's report
source. Archived historical results cannot be fetched through the active catalogue.

The Dataset workspace selector above every page is backed by one React context.
Changing connection or table applies to all four sections:

| Section | Shared behavior |
|---|---|
| Home | Freshest source extraction and its latest AI review, issue breakdown, API attempt counts and assessment-matched extraction trend |
| Data Check | Standard sample review, optional AI inspection, column profiles, fixes, SQL evidence and row verification |
| Pipeline | Executes the same review engine with origin `pipeline`; saves to the same catalogue |
| Reports | Paginates saved results and API attempts; opens reports and downloads the same CSV/JSON/PDF evidence |

Both writers call `POST /api/v1/quality/runs` with the selected approved dataset
and an origin (`data_check` or `pipeline`). No customer table name is hard-coded
by the active Pipeline page. Successful runs are published atomically as UUID
directories under `backend/artifacts/quality`. This local artifact store is the
prototype's canonical completed-run catalogue, not a new warehouse database.

`GET /api/v1/quality/catalogue` requires connection ID, schema and table filters.
It verifies saved report integrity and full nested schemas, isolates invalid
entries and excludes inactive datasets. Its summary
distinguishes saved results, source extractions and AI reviews. AI reviews are
child runs of saved evidence and do not count as another extraction or trend point.
`GET /api/v1/quality/catalogue/{run_id}` retrieves a verified report. Downloads
also check the saved artifact hash and never rerun extraction.

Quality scores on Home, Data Check, Pipeline and Reports are the same saved
sample score for the same run. Opening Home does not silently recalculate a
different full-table score. The source connection badge and current row count
are tested separately, so old reports stay readable when the source is down.
SQL & evidence remains a live inspection tool: its explicitly labelled full-table
SQL audit may use different rules/scope and does not replace the saved sample score.

All existing valid active-dataset quality artifact runs are discoverable. Old
PostgreSQL pipeline metadata is preserved but not merged into trends because
its full-table rules and sample scope differ. No synthetic migration or invented
historical scores are performed. Completed reports and API attempts are separate
views of the same selected dataset. `limit` and dataset-scoped `cursor` support
pagination; Reports displays 20 entries per page. Failed API executions are
persisted from this update onward, with sanitized error categories. Direct CLI
attempts and earlier failures are not reconstructed. Durable multi-user storage
and crash recovery remain prototype limitations.

Saved issue references can now resolve the exact source row through
`POST /api/v1/quality/runs/{run_id}/validate-reference`. A signed server-private
map contains keyed hashes, not plaintext record IDs. The endpoint returns masked
current values, rechecks the original assessment policy, and reports whether the
record changed. Older extractions need a fresh review to create that mapping.
See [priority fixes](priority-fixes.md) for policy versioning and demo steps.

Verification:

```text
cd backend
python -m unittest discover -s tests -v
cd ../frontend
npm test
npm run build
cd ..
node backend/scripts/verify_unified_deployment.mjs
```

The live verification creates one Data Check and one Pipeline result for customers
and products, checks filter isolation and saved downloads, and confirms that
retired routes return 404. It writes `docs/unified-deployment-verification.json`.
