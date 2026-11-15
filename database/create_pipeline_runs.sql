
-- =====================================================
-- AI DATA GUARDIAN 3.0
-- PIPELINE EXECUTION HISTORY
-- =====================================================
--
-- Purpose:
-- Store pipeline processing metadata without
-- storing raw customer records or personal data.
--
-- Run with an authorized PostgreSQL administrator.
-- Do not execute using guardian_reader.
--
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pipeline_runs (

    run_id UUID PRIMARY KEY,

    pipeline_name VARCHAR(100) NOT NULL,

    source_type VARCHAR(30) NOT NULL,

    table_name VARCHAR(100) NOT NULL,

    status VARCHAR(30) NOT NULL,

    started_at TIMESTAMPTZ NOT NULL,

    completed_at TIMESTAMPTZ NOT NULL,

    duration_ms DOUBLE PRECISION NOT NULL,

    sample_records INTEGER NOT NULL DEFAULT 0,

    source_records INTEGER NOT NULL DEFAULT 0,

    output_records INTEGER NOT NULL DEFAULT 0,

    quality_score NUMERIC(5, 2),

    missing_count INTEGER NOT NULL DEFAULT 0,

    duplicate_count INTEGER NOT NULL DEFAULT 0,

    invalid_count INTEGER NOT NULL DEFAULT 0,

    total_issues INTEGER NOT NULL DEFAULT 0,

    pii_masked BOOLEAN NOT NULL DEFAULT TRUE,

    ai_used BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pipeline_runs_status_check
        CHECK (
            status IN (
                'completed',
                'failed'
            )
        ),

    CONSTRAINT pipeline_runs_source_check
        CHECK (
            source_type = 'postgresql'
        ),

    CONSTRAINT pipeline_runs_nonnegative_check
        CHECK (
            duration_ms >= 0
            AND sample_records >= 0
            AND source_records >= 0
            AND output_records >= 0
            AND missing_count >= 0
            AND duplicate_count >= 0
            AND invalid_count >= 0
            AND total_issues >= 0
        ),

    CONSTRAINT pipeline_runs_quality_check
        CHECK (
            quality_score IS NULL
            OR (
                quality_score >= 0
                AND quality_score <= 100
            )
        ),

    CONSTRAINT pipeline_runs_issues_check
        CHECK (
            total_issues =
                missing_count
                + duplicate_count
                + invalid_count
        ),

    CONSTRAINT pipeline_runs_privacy_check
        CHECK (
            pii_masked = TRUE
            AND ai_used = FALSE
        )
);

-- =====================================================
-- INDEX FOR REPORTING
-- =====================================================

CREATE INDEX IF NOT EXISTS
    idx_pipeline_runs_started_at
ON public.pipeline_runs (
    started_at DESC
);

CREATE INDEX IF NOT EXISTS
    idx_pipeline_runs_status
ON public.pipeline_runs (
    status
);

-- =====================================================
-- IMPORTANT:
-- No customer names, emails, phone numbers,
-- raw identifiers, or extracted data rows
-- are stored in this table.
--
-- Database permissions will be configured
-- separately using a restricted writer role.
-- =====================================================
