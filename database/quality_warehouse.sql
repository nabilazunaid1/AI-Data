-- Run only in the isolated quality demo database, after init-demo (default schema).
-- SQL computes actual quality findings from raw values, not pre-seeded counters.
CREATE SCHEMA IF NOT EXISTS quality_staging;
CREATE SCHEMA IF NOT EXISTS quality_mart;
CREATE OR REPLACE VIEW quality_staging.customer_quality AS
SELECT record_id,
       email IS NULL OR trim(email) = '' AS missing_email,
       phone IS NULL OR phone !~ '^[0-9]{10,11}$' AS invalid_phone,
       CASE WHEN email IS NOT NULL AND trim(email) <> ''
            THEN row_number() OVER (PARTITION BY lower(trim(email)) ORDER BY record_id) > 1
            ELSE false END AS duplicate_email
FROM quality_lab.quality_fixture;
CREATE OR REPLACE VIEW quality_mart.quality_summary AS
SELECT count(*) AS total_records,
       count(*) FILTER (WHERE missing_email) AS missing_email,
       count(*) FILTER (WHERE invalid_phone) AS invalid_phone,
       count(*) FILTER (WHERE duplicate_email) AS duplicate_email
FROM quality_staging.customer_quality;
