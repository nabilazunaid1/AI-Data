# Prototype requirement demonstration

Select a dataset in the shared workspace. Data Check and Pipeline now use the
same engine and catalogue; Home and Reports display those saved results.
Setup and commands are in the root README.

| # | Implementation evidence | What to demonstrate |
|---|---|---|
| 1 | `backend/app/lab/agent.py::execute_tools` | Enable AI; show repeated model-selected tools and actual observations in `agent_trace.json`. A deterministic run is not AI evidence. |
| 2 | `lab/service.py::run_quality` | Run connect → sample → checks → output corrections → privacy gate → saved report; display same run ID and downloads in dashboard. |
| 3 | `lab/source.py::Source.sample` | PostgreSQL engine, population 150, sample 100, fixed seed and fingerprint; score is calculated on the sample. |
| 4 | `database/quality_warehouse.sql`, `Source.warehouse_summary` | Show staging/mart views and SQL-derived full-table summary alongside sample results. |
| 5 | `Source.lookup`, `quality_lab_api.py::validate_row` | Submit key `5`; show SQL lookup and age-rule failure without raw PII. |
| 6 | `lab/engine.py::validate` | Full-fixture tests assert exact missing, duplicate, format, type, range, reference and business-rule findings. |
| 7 | `engine.py::classify`, `fixture.py` | Show name, IC, phone, email, address, account and card categories; explain heuristic limits. |
| 8 | `engine.py::anomalies` | Show the seeded amount outlier; no automatic outlier replacement. |
| 9 | `service.py`, `engine.py::corrections` | Download report and changes; show protected row reference, before/after, applied-to-output flag. |
| 10 | `engine.py::mask_rows` | Download CSV and prove synthetic PII values absent; match row_ref to changes. |
| 11 | `frontend/src/pages/QualityReview.jsx` | Show score, issues, 50 column profiles, recommendations, anomalies, corrections and execution trace. |
| 12 | `sample-data/quality_fixture.csv`, `expected.json` | Show 150 rows × 50 columns, actual faults and expected ground truth. |
| 13 | `config/quality.json`, `Source`, CLI, Dockerfile, compose | Run same engine against PostgreSQL and SQLite using config; show no client-supplied credentials/SQL. Other engines require adapters. |

## Scope and honest limitations

- Actual SQL nulls, duplicate emails/business rows, malformed values, synthetic PII
  and a numerical outlier are in this fixture. Quality counters are not substituted
  for checking the data.
- The 100-row sample intentionally omits some faults; test the full fixture with
  sample_size 150 to compare all expected labels. Full table has 13 configured rule
  failures, one amount outlier and one output normalization.
- Rule/column names and values are server-side configuration. Reference rules
  currently use allowed keys, not dynamic SQL foreign-key discovery.
- Source extraction is one repeatable-read snapshot. The SQL evidence tool is
  explicitly a subsequent fresh lookup, not the same snapshot.
- Corrections only normalize configured output labels; other invalid data needs
  review. No production source correction is claimed.
- Text redaction is deliberately conservative. Numeric fields and aggregates can
  still be identifying in some datasets; choose PII policies accordingly.
- PostgreSQL and SQLite adapters are implemented. “Any database with no work” is
  not claimed. Input is capped at 10000 rows and 8 agent tool steps.
- Authentication can be disabled explicitly for localhost development. The tests
  exercise enabled authentication, policy coverage and role enforcement.
- Mock-model unit tests verify agent control flow, not model inference. Only a
  successful real `--ai` run and saved trace establish that the local model ran.
- Docker availability, visual browser layout and fresh-machine installation need
  independent verification if not listed in the captured verification evidence.

## Re-run checks

From backend: `python -m unittest discover -s tests -v`.
`python -m scripts.verify_quality_postgres` initializes only isolated demo schemas,
asserts expected SQL warehouse counts and writes `docs/postgres-verification.json`.
`python -m app.lab.cli run --ai` generates real agent evidence if Ollama is ready.
From frontend: `npm run build`.

Every successful run includes an integrity manifest. Run directories are local
prototype artifacts, not durable audited storage; copy the whole run directory
when sharing evidence and verify its hashes.
