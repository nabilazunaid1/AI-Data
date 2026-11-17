# AI Data Guardian prototype

FastAPI + React/Vite data-quality prototype. **Quality Review** demonstrates
sample-based PostgreSQL validation, profiling, PII classification/masking,
anomalies, output corrections, SQL warehouse views and saved run artifacts.
The older customer/historical screens remain available with their older scope;
use Evidence Lab to demonstrate the requirements together.

## Local setup

Use Python 3.11+ and Node 22.12+ (tested with Python 3.11.9 / Node 26.13).
From `backend`, create a venv and install `pip install -r requirements.txt`.
Copy `.env.example` to `.env` and supply local credentials. Never commit `.env`.
From `frontend`, run `npm ci`, then `npm run dev`.

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

Open `http://127.0.0.1:5173` and choose **Quality Review**. Run a sample review,
inspect profiles/recommendations and download artifacts. The default sample is
100 of 150 rows, selected with seed 42 from a repeatable-read source snapshot.
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
silently fall back or claim AI was used. Unchecked AI mode is deterministic.

## Evidence and outputs

Each successful run saves a UUID directory under `backend/artifacts/quality`:

- `report.json`: scope, scores, profiles, PII categories, issues, anomalies,
  recommendations, corrections and tool trace.
- `masked.csv`: corrected sample with conservative masking of all text.
- `changes.csv`: output-only before/after normalization log with protected row refs.
- `agent_trace.json`: deterministic or AI tool execution evidence.
- `manifest.json`: SHA256 hashes and sizes of the other four files.

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
Enter an operator/admin token in Evidence Lab; the shared API client holds it
in memory and adds it to trusted requests. Reloading clears it. Readers can
download artifacts; operators can run checks; SQL console requires admin.
Production/staging fail startup unless auth is enabled. New routes require
explicit entries in `security/policy.py`.

## Tests and container demo

```text
cd backend
python -m unittest discover -s tests -v
cd ../frontend
npm run build
```

Agent unit tests inject model decisions; they do not prove real inference.
See `docs/requirements-evidence.md` for demonstration steps and limitations.

Optional: set `QUALITY_DEMO_PASSWORD` to a URL-safe password and run
`docker compose up --build`. This starts a separate PostgreSQL on 5433 and backend
on 8000. Stop an existing backend first if that port is occupied; run the frontend
separately. Containers use one demo database account; use separate admin/reader
roles outside this local demo. Docker execution needs independent verification.
