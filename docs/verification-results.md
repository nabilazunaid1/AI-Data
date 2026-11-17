# Verification results

Executed against the local working prototype on 18 November 2026 (Malaysia).

- Backend regression suite: **14 passed**, including the legacy privacy tests,
  exact seeded rule results, read-only SQL, bound row lookup, repeatable sampling,
  artifact hashes/masking, agent tool selection, failure behavior, route-policy
  coverage, anonymous rejection and reader/operator permissions.
- PostgreSQL live check: sample **100 / 150 rows**, **50 columns**, **10 rule
  failures**, **1 anomaly**, **1 output correction**. See
  `postgres-verification.json` for the saved run ID and independently asserted
  warehouse counts (1 missing email, 2 extra duplicate emails, 1 invalid phone).
- Live HTTP: run returned 200; saved CSV, JSON report, change log and manifest
  downloads returned 200. SQL row validation for record 5 returned an age failure.
- Frontend production build passed. Interactive browser rendering was not tested.
- Real local Ollama execution was attempted, but timed out. **Real-model agent
  inference cannot yet be verified.** The injected-decision test proves tool-loop
  behavior only. Start a responsive Ollama service and rerun `--ai` to capture
  actual model-selected execution evidence.
- Docker was not available on PATH; container execution was not verified.

Run outputs are generated under `backend/artifacts/quality` and excluded from Git;
copy a complete run directory to share evidence. The synthetic fixture and its
expected labels are included source artifacts. This prototype does not claim
universal database compatibility or production-grade anonymization.
