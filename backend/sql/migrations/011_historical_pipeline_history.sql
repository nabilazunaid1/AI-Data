BEGIN;

-- =====================================================
-- HISTORICAL PIPELINE EXECUTION HISTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS public.historical_pipeline_runs (
    run_id UUID PRIMARY KEY,

    connection_id VARCHAR(100) NOT NULL,
    dataset_type VARCHAR(50) NOT NULL,
    granularity VARCHAR(20) NOT NULL,
    timezone VARCHAR(100) NOT NULL,

    status VARCHAR(20) NOT NULL,
    assessment VARCHAR(100) NOT NULL,

    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    duration_ms DOUBLE PRECISION NOT NULL,

    period_count INTEGER NOT NULL,
    finding_count INTEGER NOT NULL,

    read_only BOOLEAN NOT NULL DEFAULT TRUE,
    raw_records_included BOOLEAN NOT NULL DEFAULT FALSE,
    ai_used BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT historical_runs_connection_check
        CHECK (connection_id = 'historical_source'),

    CONSTRAINT historical_runs_dataset_check
        CHECK (dataset_type = 'synthetic_demo'),

    CONSTRAINT historical_runs_granularity_check
        CHECK (granularity = 'month'),

    CONSTRAINT historical_runs_status_check
        CHECK (status IN ('completed', 'failed')),

    CONSTRAINT historical_runs_duration_check
        CHECK (duration_ms >= 0),

    CONSTRAINT historical_runs_period_check
        CHECK (period_count >= 0),

    CONSTRAINT historical_runs_finding_check
        CHECK (finding_count >= 0),

    CONSTRAINT historical_runs_time_check
        CHECK (completed_at >= started_at),

    CONSTRAINT historical_runs_privacy_check
        CHECK (
            read_only = TRUE
            AND raw_records_included = FALSE
            AND ai_used = FALSE
        )
);

-- =====================================================
-- HISTORICAL STATISTICAL FINDINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.historical_pipeline_findings (
    finding_id UUID PRIMARY KEY,

    run_id UUID NOT NULL,

    metric VARCHAR(100) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,

    actual DOUBLE PRECISION NOT NULL,
    baseline_median DOUBLE PRECISION NOT NULL,
    modified_z_score DOUBLE PRECISION NOT NULL,

    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT historical_findings_run_fk
        FOREIGN KEY (run_id)
        REFERENCES public.historical_pipeline_runs(run_id)
        ON DELETE RESTRICT,

    CONSTRAINT historical_findings_metric_check
        CHECK (length(trim(metric)) > 0),

    CONSTRAINT historical_findings_evidence_check
        CHECK (jsonb_typeof(evidence) = 'object'),

    CONSTRAINT historical_findings_unique
        UNIQUE (run_id, metric, period_start)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS
    ix_historical_pipeline_runs_started
ON public.historical_pipeline_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS
    ix_historical_pipeline_runs_status
ON public.historical_pipeline_runs (status);

CREATE INDEX IF NOT EXISTS
    ix_historical_pipeline_findings_run
ON public.historical_pipeline_findings (run_id);

CREATE INDEX IF NOT EXISTS
    ix_historical_pipeline_findings_metric
ON public.historical_pipeline_findings (metric, period_start);

-- =====================================================
-- LEAST-PRIVILEGE APPLICATION PERMISSIONS
-- =====================================================

REVOKE ALL PRIVILEGES
ON TABLE
    public.historical_pipeline_runs,
    public.historical_pipeline_findings
FROM PUBLIC,
     guardian_history_writer,
     guardian_history_reader;

-- Writer: INSERT only.
GRANT INSERT
ON TABLE
    public.historical_pipeline_runs,
    public.historical_pipeline_findings
TO guardian_history_writer;

-- Reader: SELECT only.
GRANT SELECT
ON TABLE
    public.historical_pipeline_runs,
    public.historical_pipeline_findings
TO guardian_history_reader;

COMMIT;
