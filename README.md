# AI Data Guardian prototype

FastAPI + React/Vite data-quality prototype. **Data Check → Data quality checks** demonstrates
sample-based PostgreSQL validation, profiling, PII classification/masking,
anomalies, output corrections, SQL warehouse views and saved run artifacts.
Choose a connection and table in the **Dataset workspace** above any page. Home,
Data Check, Pipeline and Reports share that selection and one saved-run catalogue.
Data Check creates verified sample results; Pipeline uses the same engine; Home
shows the latest saved result; Reports lists and downloads those same runs.
**SQL & evidence** retains live read-only inspection for customer-source tables.
Historical Database and Reconciliation Target are removed from active deployment.
Their existing schemas, old metadata and source modules are preserved as archives.
See [the shared catalogue workflow](docs/shared-run-catalogue.md).
Home selects by source extraction time, so reviewing old evidence cannot replace
a newer sample. Reports provides paginated saved results and API execution
attempts. Saved assessments include rule-policy hashes, and Home compares trend
points only within the latest assessment version. Recommended issue workflows
can verify the exact source record through a protected saved reference. See
[priority fixes and proof](docs/priority-fixes.md) for details and limitations.

## Local setup

Use Python 3.11+ and Node 22.12+ (tested with Python 3.11.9 / Node 26.13).
From `backend`, create a venv and install `pip install -r requirements.txt`.
Copy `.env.example` to `.env` and supply local credentials. Never commit `.env`.
From `frontend`, run `npm ci`, then `npm run dev`.

The frontend and backend are separate processes. Keep the backend running on
port 8000 while using Vite on port 5173. If Vite reports
`ECONNREFUSED 127.0.0.1:8000`, restart the local backend from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\restart_backend.ps1
```

Then select **Refresh** in Dataset workspace. Backend logs are saved under
`backend/data/backend.err.log` and `backend/data/backend.out.log`. See
[connection recovery](docs/backend-connection-recovery.md) for verification.

For PostgreSQL, use an isolated demo database or the three dedicated schemas
`quality_lab`, `quality_staging`, `quality_mart`. This explicit setup creates
those objects, inserts synthetic records and grants the configured reader
SELECT/USAGE on them. Existing customer tables are not modified.
Existing fixture IDs are not overwritten; use a fresh demo database to restore
the exact expected fixture after manual edits.

```text
cd backend
python -m scripts.verify_quality_postgres
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Setup uses `QUALITY_ADMIN_DATABASE_URL`, or local `DB_*` admin settings.
Runtime uses `QUALITY_DATABASE_URL`, or `READER_DB_*` + `DB_HOST/PORT/NAME`.
Verification writes `docs/postgres-verification.json`.
Remove admin credentials from deployed runtime after setup.

Open `http://127.0.0.1:5173`, select a dataset above the page and choose
**Data Check → Data quality checks**. Run a review, then open Home, Pipeline or
Reports to see the same saved result. The Quality Sample Database uses a default
sample of 100 of 150 rows with seed 42; smaller tables use all available rows.
The prototype reads a bounded population (max 10000) before sampling; add a
server-side sampling adapter for very large warehouses.

Without PostgreSQL, set `QUALITY_ADAPTER=sqlite` in your environment, then:

```text
python -m app.lab.cli init-demo
python -m app.lab.cli run
```

SQLite proves the engine and artifacts, not PostgreSQL connectivity.
Configure table/key, rules, PII policy, normalization and sampling in
`backend/config/quality.json`. `QUALITY_CONFIG` selects a trusted server-side
configuration. Set `warehouse_enabled=false` for datasets without the demo views.
Add engines by implementing the `Source` adapter contract. PostgreSQL and SQLite
are implemented; arbitrary database engines are not automatically supported.

## AI agent demonstration

Run Ollama separately and pull `OLLAMA_MODEL` (default `gemma3:1b`). Select
**Let local AI choose and execute inspection tools**, or run
`python -m app.lab.cli run --ai`.

Each model call chooses an available tool using previous observations. The app
executes it, returns an observation and requests the next decision. Unknown tools,
repetition and exceeding eight steps abort the run. Raw data and generated SQL
never enter the loop. `agent_trace.json` records choices and actual observations.
The final report consolidates verified tool results. Model failure does not
claim a successful AI review when the model fails. Unchecked AI mode is deterministic.
In Data Check, verified Standard results are saved and shown first. Optional AI
then inspects that saved evidence and publishes a child run, preserving the
original scores, dataset and masked output. Model failure shows a separate warning;
retry uses saved results without re-extraction. See `docs/agent-verification.json`
for a verified real-model execution trace.

## Evidence and outputs

Each successful run saves a UUID directory under `backend/artifacts/quality`:

- `report.json`: scope, scores, profiles, PII categories, issues, anomalies,
  recommendations, corrections and tool trace.
- `masked.csv`: corrected sample with conservative masking of all text.
- `changes.csv`: output-only before/after normalization log with protected row refs.
- `agent_trace.json`: deterministic or AI tool execution evidence.
- `manifest.json`: SHA256 hashes and sizes of the other four files.

Data Check, Pipeline and Reports also export a formatted **PDF assessment report**
with an executive summary, findings, profiles, privacy classifications,
before/after output corrections and execution evidence. Recommended next steps
appear only for completed AI-guided reviews. All download names identify the
dataset, completion date and run. Newly generated correction logs keep their
ordered headers even when no corrections occurred. See
[report formats and browser verification](docs/report-exports.md).

Downloads retrieve saved artifacts without rerunning extraction. Invalid values
are reported, not invented or silently repaired. Source records stay unchanged.
Scores mean passed configured checks / total checks on the sample, not population
estimates or percentage of clean records. Duplicates are sample-scoped. Reference
rules use configured allowed-key sets. Heuristic PII classification does not
establish legal anonymization; all text output is redacted to limit exposure.

`POST /api/v1/quality/validate-row` accepts `{"key":"5"}` and executes a bound
SQL WHERE lookup. Returns masked values and single-row failures, excluding
uniqueness checks. A run also performs a fresh SQL lookup and aborts if that
checked row differs from its sample. This is a fresh read outside the extraction
snapshot and does not prove the entire source stayed unchanged afterwards.

## Authorization

Local development permits explicit `GUARDIAN_AUTH_ENABLED=false` on localhost.
For enabled auth set it to `true` and configure SHA256 bearer-token hashes.
Enter an operator/admin token through Settings or Data Check's Access settings; the shared API client holds it
in memory and adds it to trusted requests. Reloading clears it. Readers can
download artifacts; operators can run checks; SQL console requires admin.
Production/staging fail startup unless auth is enabled. New routes require
explicit entries in `security/policy.py`.

## Tests and container demo

```text
cd backend
python -m unittest discover -s tests -v
cd ../frontend
npm test
npm run test:browser
npm run build
```

Agent unit tests inject model decisions; they do not prove real inference.
Browser tests use installed Microsoft Edge (`channel: msedge`); configure another
installed Playwright browser if Edge is unavailable.
See `docs/requirements-evidence.md` for demonstration steps and limitations.

Optional: set `QUALITY_DEMO_PASSWORD` to a URL-safe password and run
`docker compose up --build`. This starts a separate PostgreSQL on 5433 and backend
on 8000. Stop an existing backend first if that port is occupied; run the frontend
separately. Containers use one demo database account; use separate admin/reader
roles outside this local demo. Docker execution needs independent verification.
