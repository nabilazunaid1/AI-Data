-- AI Data Guardian 3.0 | isolated PostgreSQL historical fixture
-- DEMONSTRATION ONLY: 50 columns, 150 deterministic synthetic rows.
-- Target: dedicated database guardian_historical_lab (create separately).
-- No CSV imports. No existing customer/reconciliation tables modified.
-- Rerunnable: inserts missing record IDs; does not overwrite existing rows.
-- All dates at or before 2026-11-17. Synthetic event dates cover 24 months.
-- August 2026 contains 6 deliberately anomalous demo rows.
-- IMPORTANT: anomaly_seed_label is test ground truth, not a detector feature.
BEGIN;
CREATE SCHEMA IF NOT EXISTS guardian_demo;
CREATE TABLE IF NOT EXISTS guardian_demo.historical_quality_fixture (
    record_id BIGINT PRIMARY KEY,
    event_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    source_system TEXT NOT NULL,
    target_system TEXT NOT NULL,
    pipeline_name TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    transaction_ref TEXT NOT NULL,
    customer_ref TEXT NOT NULL,
    region TEXT,
    country_code TEXT,
    business_unit TEXT,
    department TEXT,
    product_category TEXT,
    product_code TEXT,
    sales_channel TEXT,
    customer_segment TEXT,
    transaction_status TEXT,
    payment_method TEXT,
    currency_code TEXT,
    order_quantity INTEGER,
    unit_price NUMERIC(12,2),
    gross_amount NUMERIC(14,2),
    discount_amount NUMERIC(12,2),
    tax_amount NUMERIC(12,2),
    net_amount NUMERIC(14,2),
    refund_amount NUMERIC(12,2),
    cost_amount NUMERIC(14,2),
    profit_amount NUMERIC(14,2),
    exchange_rate NUMERIC(12,4),
    inventory_level INTEGER,
    fulfillment_days INTEGER,
    delivery_delay_days INTEGER,
    processing_time_ms INTEGER,
    queue_wait_ms INTEGER,
    api_latency_ms INTEGER,
    retry_count INTEGER,
    batch_size INTEGER,
    source_row_count INTEGER,
    target_row_count INTEGER,
    missing_value_count INTEGER,
    duplicate_count INTEGER,
    invalid_value_count INTEGER,
    schema_mismatch_count INTEGER,
    quality_score NUMERIC(5,2),
    validation_passed BOOLEAN,
    anomaly_seed_label TEXT,
    ingestion_timestamp TIMESTAMPTZ NOT NULL,
    record_version INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_historical_quality_fixture_event_ts
    ON guardian_demo.historical_quality_fixture (event_timestamp);

-- Deterministic timestamps: 2024-12 through 2026-11, 6-7 events/month.
-- Use integer seq to avoid random data and ensure reproducibility.
WITH seqs AS (
  SELECT n::integer AS seq FROM generate_series(0, 149) AS n
), dated AS (
  SELECT seq,
      ((date '2024-12-01' + (seq % 24) * interval '1 month')
        + ((seq / 24)::integer * interval '2 days')
        + ((seq * 7) % 24) * interval '1 hour'
        + ((seq * 11) % 60) * interval '1 minute'
      ) AT TIME ZONE 'Asia/Kuala_Lumpur' AS event_ts,
      (seq % 24 = 20) AS incident
  FROM seqs
)
INSERT INTO guardian_demo.historical_quality_fixture (
    record_id,
    event_timestamp,
    created_at,
    updated_at,
    source_system,
    target_system,
    pipeline_name,
    batch_id,
    transaction_ref,
    customer_ref,
    region,
    country_code,
    business_unit,
    department,
    product_category,
    product_code,
    sales_channel,
    customer_segment,
    transaction_status,
    payment_method,
    currency_code,
    order_quantity,
    unit_price,
    gross_amount,
    discount_amount,
    tax_amount,
    net_amount,
    refund_amount,
    cost_amount,
    profit_amount,
    exchange_rate,
    inventory_level,
    fulfillment_days,
    delivery_delay_days,
    processing_time_ms,
    queue_wait_ms,
    api_latency_ms,
    retry_count,
    batch_size,
    source_row_count,
    target_row_count,
    missing_value_count,
    duplicate_count,
    invalid_value_count,
    schema_mismatch_count,
    quality_score,
    validation_passed,
    anomaly_seed_label,
    ingestion_timestamp,
    record_version
)
SELECT
    seq + 1 AS record_id,
    event_ts AS event_timestamp,
    event_ts - interval '5 minutes' AS created_at,
    event_ts + interval '2 minutes' AS updated_at,
    'postgresql_demo' AS source_system,
    'warehouse_demo' AS target_system,
    'historical_quality_pipeline' AS pipeline_name,
    'BATCH-' || lpad((seq / 5 + 1)::text, 4, '0') AS batch_id,
    'TX-' || lpad((seq+1)::text, 6, '0') AS transaction_ref,
    'SYN-' || lpad(((seq % 80)+1)::text, 4, '0') AS customer_ref,
    (ARRAY['Central','North','South','East'])[seq % 4 + 1] AS region,
    'MY' AS country_code,
    (ARRAY['Retail','Operations','Digital'])[seq % 3 + 1] AS business_unit,
    (ARRAY['Sales','Support','Finance'])[seq % 3 + 1] AS department,
    (ARRAY['Electronics','Home','Office'])[seq % 3 + 1] AS product_category,
    'P-' || lpad((seq % 25 + 1)::text, 3, '0') AS product_code,
    (ARRAY['Web','Mobile','Store'])[seq % 3 + 1] AS sales_channel,
    (ARRAY['Standard','Premium'])[seq % 2 + 1] AS customer_segment,
    (ARRAY['Completed','Pending'])[seq % 2 + 1] AS transaction_status,
    (ARRAY['Card','Transfer','Cash'])[seq % 3 + 1] AS payment_method,
    'MYR' AS currency_code,
    (seq % 8 + 1)::integer AS order_quantity,
    ROUND((15 + (seq % 30) * 1.75)::numeric,2) AS unit_price,
    ROUND(((seq % 8 + 1) * (15 + (seq % 30) * 1.75))::numeric,2) AS gross_amount,
    ROUND(((seq % 4) * 1.50)::numeric,2) AS discount_amount,
    ROUND(((seq % 8 + 1) * (15 + (seq % 30) * 1.75) * 0.06)::numeric,2) AS tax_amount,
    ROUND((((seq % 8 + 1) * (15 + (seq % 30) * 1.75)) - ((seq % 4) * 1.50) + ((seq % 8 + 1) * (15 + (seq % 30) * 1.75) * 0.06))::numeric,2) AS net_amount,
    CASE WHEN seq % 17 = 0 THEN 5.00::numeric ELSE 0.00::numeric END AS refund_amount,
    ROUND(((seq % 8 + 1) * (15 + (seq % 30) * 1.75) * 0.62)::numeric,2) AS cost_amount,
    ROUND(((seq % 8 + 1) * (15 + (seq % 30) * 1.75) * 0.38)::numeric,2) AS profit_amount,
    1.0000::numeric AS exchange_rate,
    (20 + seq % 160)::integer AS inventory_level,
    (1 + seq % 5)::integer AS fulfillment_days,
    CASE WHEN incident THEN 4 ELSE seq % 2 END AS delivery_delay_days,
    CASE WHEN incident THEN 1500 + (seq % 5) * 100 ELSE 130 + (seq % 7) * 15 END AS processing_time_ms,
    CASE WHEN incident THEN 700 + (seq % 4) * 80 ELSE 20 + (seq % 5) * 8 END AS queue_wait_ms,
    CASE WHEN incident THEN 900 + (seq % 3) * 120 ELSE 65 + (seq % 6) * 10 END AS api_latency_ms,
    CASE WHEN incident THEN 7 ELSE seq % 2 END AS retry_count,
    (50 + seq % 30)::integer AS batch_size,
    (50 + seq % 30)::integer AS source_row_count,
    CASE WHEN incident THEN 39 + seq % 5 ELSE 50 + seq % 30 END AS target_row_count,
    CASE WHEN incident THEN 18 + seq % 4 ELSE seq % 3 END AS missing_value_count,
    CASE WHEN incident THEN 4 ELSE seq % 2 END AS duplicate_count,
    CASE WHEN incident THEN 7 + seq % 3 ELSE seq % 2 END AS invalid_value_count,
    CASE WHEN incident THEN 2 ELSE 0 END AS schema_mismatch_count,
    CASE WHEN incident THEN 58 + seq % 5 ELSE 92 + seq % 4 END AS quality_score,
    NOT incident AS validation_passed,
    CASE WHEN incident THEN 'KNOWN_SYNTHETIC_INCIDENT' ELSE 'BASELINE' END AS anomaly_seed_label,
    event_ts + interval '3 minutes' AS ingestion_timestamp,
    1 AS record_version
FROM dated
ON CONFLICT (record_id) DO NOTHING;
COMMIT;

-- Read-only verification (run after loading):
SELECT count(*) AS total_rows,
       min(event_timestamp) AS first_event,
       max(event_timestamp) AS last_event,
       count(DISTINCT date_trunc('month', event_timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')) AS covered_months,
       count(*) FILTER (WHERE anomaly_seed_label = 'KNOWN_SYNTHETIC_INCIDENT') AS incident_rows
FROM guardian_demo.historical_quality_fixture;
SELECT count(*) AS total_columns
FROM information_schema.columns
WHERE table_schema = 'guardian_demo'
  AND table_name = 'historical_quality_fixture';
