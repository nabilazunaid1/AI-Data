# Checking a specific source row

The Data Check row validator explicitly distinguishes two lookup modes:

- **Row number** (UI default): a one-based position in the current source table,
  ordered by its configured key. For eight customer rows, valid positions are
  1–8. This is not the key value, a spreadsheet line number, or the position in
  the random sample. Positions can change when source records change.
- **Record key**: the exact value stored in the configured source key column,
  such as `customer_id`. A text ID is not interchangeable with a numeric position.

`POST /api/v1/quality/validate-row` accepts the selected connection/schema/table
and `{"key":"5","lookup_mode":"row_number"}`. SQL orders by the trusted key
and uses bound LIMIT/OFFSET parameters. Count and row retrieval share a read-only
snapshot. Invalid positions return an explanatory error with the current range.

`lookup_mode="key"` uses a parameterized WHERE lookup. API requests that omit
the mode keep the previous key-lookup behavior for compatibility. Wrong-format
keys produce a client error; missing keys explain how to choose Row number.

Results include the lookup mode, checked position/order where applicable,
single-row quality findings and a protected row preview. Source keys and PII
remain masked. Uniqueness checks still require sample or population context.

Verified against local PostgreSQL: customer row position 5 returns HTTP 200;
record key `5` returns a descriptive 404; position 999 reports the valid range
1–8. Fixture record key 5 also returns 200 with the expected invalid-age finding.
