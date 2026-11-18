# Connected Data Check workflow

Current deployment: see [Shared dataset selection and run catalogue](shared-run-catalogue.md).
Historical monitoring and reconciliation mentioned in the earlier workflow below
are archived and are no longer available in the active UI or API.

Data quality review is part of **Data Check**, with one connection/table selection.
The standalone Quality Review navigation item has been removed.

1. Open **Data Check**, select a registered connection and an approved table.
2. **Data quality checks** tests access to that exact source/table and shows its
   row count, column count and configured sample size. A configured connection
   alone is not displayed as a successful connection test.
3. Run **Standard** for database/rule checks without model inference. **AI guided**
   saves those verified results first, then lets local AI plan inspections of the
   saved evidence. Scores and downloads remain visible during model inference.
   An AI failure produces a separate warning; it does not discard quality results
   or imply that the database is disconnected. Retry AI against the saved run.
4. Review sample findings, recommendations and profiles, or validate a source key.
5. Download saved artifacts from the same run. `report.json.dataset` records the
   connection ID, schema and table. Switching datasets clears the previous view.
6. **SQL & evidence** retains the customer SQL editor/preview/investigation workflow
   and shares the selected table. Historical connections retain their separate
   SQL aggregate analysis tab. Reconciliation-only targets remain restricted.

**Quality Sample Database** explicitly selects the 50-column seeded fixture;
it is no longer an implicit substitute for the user's selected customer table.
Customer and historical connections use their own credentials/configuration.
The quality fixture URL is never used for a selected customer connection.

The API accepts only registered connection IDs and tables allowlisted for that
connection. Arbitrary schemas, tables, credentials and SQL are not accepted.
Review and row validation requests carry the same dataset identifiers.

Rules for existing registered tables are defined in `app/lab/datasets.py`;
fixture rules stay in `config/quality.json`. Warehouse cross-checks are enabled
only for the configured fixture with the corresponding installed warehouse views.
Other selected datasets are validated directly from their own table; their
checks do not depend on fixture warehouse objects.

AI evidence inspection publishes a child run with `parent_run_id` and
`agent.scope=saved_verified_evidence`. The masked CSV, change log, dataset and
validation results are preserved; source data is not re-extracted. Parent artifacts
are integrity-checked before use and never overwritten. The model's action is the
first step in its constrained plan, preventing contradictory tool/plan fields.
