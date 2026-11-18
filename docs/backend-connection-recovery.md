# Backend connection recovery

The reported Vite error was `ECONNREFUSED 127.0.0.1:8000` for
`/api/v1/connections`. At inspection, Vite listened on 5173 and PostgreSQL on
5432, but no backend listened on 8000. The reason the previous backend stopped:
**Not found / cannot verify**.

The backend was restarted with `backend/scripts/restart_backend.ps1`.
Uvicorn completed application startup. Verification confirmed:

- `GET http://127.0.0.1:8000/api/v1/health`: HTTP 200, healthy.
- `GET http://127.0.0.1:5173/api/v1/connections`: HTTP 200, two active connections.
- Live Edge dashboard: source connected, saved customer results visible, zero
  page errors. The browser inspection used read-only requests.

The secondary UI error occurred because `apiJson` called `response.json()` on
Vite's empty proxy failure. Shared response handling in `apiClient.js` now maps
empty/plain-text server failures and network errors to a useful backend message.
Structured source errors remain intact. Cancelled requests remain cancellations.
Catalogue and Quality Review requests use the shared handler.

The selector now tracks registry and source loading separately. Failed requests
show **Connections unavailable**, not endless loading/testing labels. **Refresh**
retries the registry and dataset requests when the backend is available again.

Validation: 18 frontend tests, six Edge browser tests and the production build
passed. The new browser regression reproduces an empty proxy HTTP 500, checks
the message/status, then restores the mocked backend and verifies Refresh loads
the saved results. Existing backend code and source data were unchanged.

For future starts, run the backend in its own terminal from `backend`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Alternatively, use the restart script from the repository root. It starts the
workspace backend hidden and redirects logs to `backend/data`. The frontend
still runs separately through `npm run dev` in `frontend`.
