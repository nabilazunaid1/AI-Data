# Verification results

Executed against the local working prototype on 18 November 2026 (Malaysia).

- Backend regression suite: **40 passed**, including the legacy privacy tests,
  exact seeded rule results, read-only SQL, bound row lookup, repeatable sampling,
  artifact hashes/masking, agent tool selection, failure behavior, route-policy
  coverage, anonymous rejection and reader/operator permissions.
- AI resilience tests verify that model failure leaves the saved score/report/CSV
  intact, evidence inspection does not re-extract source data, changed evidence is
  rejected, and the model action follows its constrained plan.
- Connected Data Check integration: live context and Standard review requests
  returned 200 for `customer_source/public.customers` (8 rows, 6 issues),
  `customer_source/public.products` (3 rows, 0 issues),
  `quality_source/quality_lab.quality_fixture` (100/150 rows, 10 issues).
  Each report identified the selected connection/schema/table. Tests also reject
  cross-connection tables and verify that customer selection ignores the fixture
  database URL. Standard execution makes no model calls.
- PostgreSQL live check: sample **100 / 150 rows**, **50 columns**, **10 rule
  failures**, **1 anomaly**, **1 output correction**. See
  `postgres-verification.json` for the saved run ID and independently asserted
  warehouse counts (1 missing email, 2 extra duplicate emails, 1 invalid phone).
- Live HTTP: run returned 200; saved CSV, JSON report, change log and manifest
  downloads returned 200. SQL row validation for record 5 returned an age failure.
- Frontend production build passed.
- Frontend tests: **18 passed**, covering recommendation gating, shared dataset
  filters, adoption of pending fresher results, PDF contents/pagination,
  before/after correction evidence and export filenames.
- Edge browser regression suite: **6 passed**, covering delayed cold startup,
  all four pages, actual PDF/CSV downloads, empty catalogues, unavailable registry
  and rendering-error recovery. The original blank screen was reproduced with
  an empty body and `Cannot read properties of undefined (reading 'dataset')`;
  the saved-run synchronization guard now checks dataset/report presence first.
- Backend availability recovery: port 8000 had no listener. The local backend
  was restarted and completed startup; direct health and Vite-proxied connection
  requests returned 200. Empty/non-JSON proxy responses now show a readable
  backend message, stop loading states, and recover through Refresh. Unit tests
  cover structured errors, malformed responses, network failure and cancellation;
  Edge reproduces the empty HTTP 500 response and successful retry. The earlier
  backend exit reason cannot be verified. See `backend-connection-recovery.md`.
- Responsive Home: action labels remain visible at widths 1440, 960, 700 and
  390 pixels. The two previously reported invalid artifacts were integrity-valid
  older reports without dataset metadata. They are preserved and shown in an
  expandable archive notice; actual verification failures still produce warnings.
  See `responsive-home-verification.json` for the live check.
- Live Edge + PostgreSQL: customer and 50-column quality-fixture reviews opened
  Home, Data Check, Pipeline and Reports without page errors. All six downloads
  succeeded; original evidence matched manifest hashes. New empty change logs
  have ordered CSV headers. See `report-download-verification.json` and
  `report-download-verification-fixture.json`. PDF rendering verified required
  sections, running headers and zero clipped text spans; selected pages were
  visually inspected. See [report exports](report-exports.md).
- Priority fixes: tests cover delayed AI lineage, five checksum-valid malformed
  report variants, pagination across 106 results, assessment-isolated trends,
  sanitized failed API/AI attempts, exact reference resolution, tamper rejection
  and masked row revalidation with the original saved policy. Live PostgreSQL
  API checks confirmed exact reference lookup, blocked private-file downloads,
  cursor pagination, cross-dataset cursor rejection and completed attempt
  persistence. See `priority-fixes-verification.json` and `priority-fixes.md`.
- Unified deployment: only `customer_source` and `quality_source` are active.
  Historical, reconciliation and legacy pipeline/history endpoints return 404.
  Data Check and Pipeline runs were both found in the same filtered catalogue;
  customer results scored 85% and product results 100% under the configured rules.
  See `unified-deployment-verification.json` for exact run IDs and route checks.
  A stale inherited Uvicorn worker was stopped so the running server matches disk.
- Real local Ollama evidence review: **HTTP 200**, five model-selected inspections
  completed. See `agent-verification.json` for the parent run, child run and actual
  plans/observations. The parent and child validation results matched exactly.
  The original failure was an invalid plan with contradictory independent action
  fields. The corrected provider derives the action from the first plan step.
  An unavailable/invalid model now leaves verified Standard results available.
- Docker was not available on PATH; container execution was not verified.
- Package audit during browser-tool setup reported five high-severity development
  dependency findings through `picomatch`/Vite. No package downgrade or forced
  tooling migration was performed as part of the rendering/report fix.

Run outputs are generated under `backend/artifacts/quality` and excluded from Git;
copy a complete run directory to share evidence. The synthetic fixture and its
expected labels are included source artifacts. This prototype does not claim
universal database compatibility or production-grade anonymization.
