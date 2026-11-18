# Recommended next steps in Data Check

- **Standard** shows verified scores, profiles, issues, anomalies and downloads.
  It does not display recommended next steps or issue recommendation text.
- **AI guided** displays next steps only after the saved evidence review succeeds.
  Selecting AI mode without a completed review, a pending review, or a failed
  review does not unlock recommendations.
- Switching back to Standard hides the recommendations and closes the fix view,
  even if the currently displayed run has a successful earlier AI review.

Each clickable step groups actual findings by column and rule. It opens **Fix
issue** with the original run ID, selected connection/table, affected protected
row references and resolution steps tailored to missing values, duplicates,
format/type/range issues, references, totals, dates, categories or outliers.

From the fix workspace:

1. **Open SQL & evidence**, available for customer-source tables, opens the existing
   editor with the correct table and a read-only projection of the affected column.
   The inspection query is prepared, not automatically executed.
2. **Verify a corrected row** opens the row-key check for the same selected dataset.
3. **Recheck after fixing** runs a fresh review to assess the source after the user
   applies verified corrections in their source system.

Navigation itself does not modify source records. Review results stay mounted
when moving to SQL/evidence, and old fix context is cleared when tables change.
Run `npm test` from `frontend` to verify mode gating, issue grouping, dataset
context, anomaly handling and absence of fabricated fixes for a clean sample.
