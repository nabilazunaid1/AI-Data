
"""
AI Data Guardian 3.0
Pipeline Execution API

Endpoint:
POST /api/v1/pipeline/run

Purpose:
- Start approved ETL pipelines on demand
- Enforce table and record-limit restrictions
- Execute the existing three-stage engine
- Verify masked processing results
- Automatically save execution metadata
- Return Pipeline results and History Run ID
- Keep PostgreSQL source records unchanged

Stages:
1. Extract
2. Validate
3. Transform and Mask

Security:
- Restricted PostgreSQL reader
- Restricted PostgreSQL history writer
- No raw customer data stored in history
- No automatic Ollama calls

LOCAL DEVELOPMENT ONLY:
Authentication, authorization, rate limits,
and production-grade audit controls must
be added before production deployment.
"""

import logging
import math

import psycopg

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.etl.pipeline_service import PIPELINE_NAME


# =====================================================
# CONFIGURATION
# =====================================================

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/pipeline",
    tags=["ETL Pipeline"]
)

ALLOWED_TABLES = {"customers"}

EXPECTED_STAGES = [
    "extract",
    "validate",
    "transform_and_mask"
]

MAX_RECORD_LIMIT = 100


# =====================================================
# REQUEST MODEL
# =====================================================

class PipelineRunRequest(BaseModel):
    """
    Accept only approved pipeline parameters.
    """

    table_name: str = Field(
        default="customers",
        min_length=1,
        max_length=50
    )

    limit: int = Field(
        default=20,
        ge=1,
        le=MAX_RECORD_LIMIT,
        strict=True
    )


# =====================================================
# VERIFY EXECUTION RESULT
# =====================================================

def verify_pipeline_response(result):
    """
    Validate pipeline response structure.

    Only approved masked customer records
    are returned through FastAPI.
    """

    if not isinstance(result, dict):
        raise ValueError(
            "Invalid pipeline response."
        )

    if (
        result.get("status") != "completed"
        or result.get("pipeline_name")
        != PIPELINE_NAME
        or result.get("table") != "customers"
        or result.get("read_only") is not True
        or result.get("pii_masked") is not True
        or result.get("ai_used") is not False
        or result.get("stage_count") != 3
    ):
        raise ValueError(
            "Unexpected pipeline execution result."
        )

    stages = result.get("stages")

    if (
        not isinstance(stages, list)
        or len(stages) != 3
    ):
        raise ValueError(
            "Invalid pipeline stages."
        )

    for index, stage in enumerate(stages):
        if (
            not isinstance(stage, dict)
            or stage.get("stage")
            != EXPECTED_STAGES[index]
            or stage.get("status") != "completed"
        ):
            raise ValueError(
                "Pipeline stage verification failed."
            )

    validation = result.get("validation")
    extraction = result.get("extraction")
    transformation = result.get("transformation")
    output = result.get("output")

    if not all(
        isinstance(section, dict)
        for section in (
            validation,
            extraction,
            transformation,
            output
        )
    ):
        raise ValueError(
            "Incomplete pipeline result."
        )

    if (
        validation.get("table") != "customers"
        or validation.get("scope") != "full_table"
        or validation.get("ai_used") is not False
    ):
        raise ValueError(
            "Invalid validation summary."
        )

    if (
        transformation.get("status") != "success"
        or output.get("type")
        != "masked_customer_sample"
        or output.get("file_generated") is not False
    ):
        raise ValueError(
            "Invalid transformed output."
        )

    rows = output.get("rows")
    columns = output.get("columns")

    approved_columns = [
        "customer_id",
        "name",
        "email",
        "phone",
        "region",
        "updated_at"
    ]

    if (
        not isinstance(rows, list)
        or columns != approved_columns
        or output.get("record_count") != len(rows)
        or extraction.get("extracted_records")
        != len(rows)
        or transformation.get("output_records")
        != len(rows)
        or len(rows) > MAX_RECORD_LIMIT
    ):
        raise ValueError(
            "Pipeline output verification failed."
        )

    approved_masks = {
        "customer_id": "[MASKED_ID]",
        "name": "[MASKED_NAME]",
        "email": "[MASKED_EMAIL]",
        "phone": "[MASKED_PHONE]"
    }

    for row in rows:
        if (
            not isinstance(row, dict)
            or set(row.keys()) != set(approved_columns)
        ):
            raise ValueError(
                "Unexpected output row."
            )

        for field, placeholder in (
            approved_masks.items()
        ):
            if row[field] not in (
                placeholder,
                None,
                ""
            ):
                raise ValueError(
                    "Unmasked value detected."
                )

    score = validation.get("quality_score")

    if score is not None and (
        type(score) not in (int, float)
        or not math.isfinite(score)
        or not 0 <= score <= 100
    ):
        raise ValueError(
            "Invalid pipeline quality score."
        )

    # Return only explicitly approved result keys.
    return {
        "status": "completed",
        "pipeline_name": result["pipeline_name"],
        "pipeline_version": result["pipeline_version"],
        "table": "customers",
        "source": "postgresql",
        "started_at": result["started_at"],
        "completed_at": result["completed_at"],
        "duration_ms": result["duration_ms"],
        "read_only": True,
        "pii_masked": True,
        "ai_used": False,
        "stage_count": 3,
        "stages": stages,
        "extraction": {
            "scope": "limited_sample",
            "limit": extraction["limit"],
            "extracted_records": (
                extraction["extracted_records"]
            ),
            "columns": approved_columns
        },
        "validation": validation,
        "transformation": {
            "status": "success",
            "input_records": (
                transformation["input_records"]
            ),
            "output_records": len(rows),
            "normalized_regions": (
                transformation["normalized_regions"]
            ),
            "redacted_regions": (
                transformation["redacted_regions"]
            )
        },
        "output": {
            "type": "masked_customer_sample",
            "format": "json",
            "file_generated": False,
            "columns": approved_columns,
            "record_count": len(rows),
            "rows": rows
        },
        "limitations": result["limitations"]
    }


# =====================================================
# RUN PIPELINE + AUTOMATIC HISTORY
# =====================================================

@router.post("/run")
def execute_pipeline(
    request: PipelineRunRequest
):
    """
    Execute the approved three-stage pipeline.

    Automatically record execution history
    after successful pipeline verification.

    No automatic AI calls.

    The endpoint reports success only when
    history persistence has been confirmed.
    """

    # =========================================
    # STEP 1 — VALIDATE REQUEST
    # =========================================

    if request.table_name not in ALLOWED_TABLES:
        raise HTTPException(
            status_code=404,
            detail=(
                "Pipeline currently supports "
                "the customers table only."
            )
        )

    try:

        # =====================================
        # STEP 2 — IMPORT ORCHESTRATION SERVICE
        # =====================================

        # Import inside the function to avoid
        # circular imports with this API module.

        from app.history.recorded_pipeline import (
            run_recorded_pipeline
        )

        # =====================================
        # STEP 3 — EXECUTE AND SAVE HISTORY
        # =====================================

        result = run_recorded_pipeline(
            table_name=request.table_name,
            limit=request.limit
        )

        # =====================================
        # STEP 4 — VERIFY HISTORY CONFIRMATION
        # =====================================

        history = result.get("history")

        if (
            not isinstance(history, dict)
            or history.get("status") != "saved"
            or not history.get("run_id")
            or history.get("pii_stored") is not False
        ):
            raise RuntimeError(
                "Pipeline history was not confirmed."
            )

        # =====================================
        # STEP 5 — RETURN VERIFIED RESULTS
        # =====================================

        return result

    except (
        psycopg.Error,
        ValueError,
        KeyError,
        TypeError,
        RuntimeError
    ) as error:

        # Record only the exception type.
        # Never log SQL values or credentials.

        logger.warning(
            "Pipeline execution or history "
            "persistence failed: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Pipeline execution or history "
                "persistence is unavailable."
            )
        ) from error


# HISTORICAL_PIPELINE_11_6F_7D
# Approved, read-only historical analysis operation.
# This endpoint does not yet persist an execution-history record.

from datetime import datetime as _historical_datetime
from datetime import timezone as _historical_timezone
from time import perf_counter as _historical_perf_counter

from app.connectors.historical_postgres import (
    historical_trend as _historical_trend,
)
from app.anomaly.historical_detector import (
    detect_monthly_outliers as _detect_monthly_outliers,
)

from app.history.historical_history_service import (
    save_historical_pipeline_history as _save_historical_history,
)


@router.post("/historical/run")
def execute_historical_pipeline():
    """Execute approved PostgreSQL historical quality analysis.

    The source connection is read-only.
    Only aggregated statistics and findings are returned.
    No AI inference or source-table modification occurs.
    """

    started = _historical_datetime.now(
        _historical_timezone.utc
    )

    start_time = _historical_perf_counter()

    try:
        trend = _historical_trend("month")

        if (
            trend.get("status") != "success"
            or trend.get("read_only") is not True
            or trend.get("raw_records_included") is not False
            or trend.get("dataset_type") != "synthetic_demo"
            or not isinstance(trend.get("periods"), list)
        ):
            raise ValueError(
                "Historical trend verification failed."
            )

        analysis = _detect_monthly_outliers(trend)

        if (
            analysis.get("status") != "success"
            or analysis.get("read_only") is not True
            or analysis.get("ai_used") is not False
            or analysis.get("raw_records_included") is not False
            or not isinstance(analysis.get("findings"), list)
        ):
            raise ValueError(
                "Historical anomaly verification failed."
            )

        completed = _historical_datetime.now(
            _historical_timezone.utc
        )

        elapsed_ms = round(
            (_historical_perf_counter() - start_time) * 1000,
            2,
        )

        history_result = _save_historical_history({
            "connection_id": "historical_source",
            "dataset_type": trend["dataset_type"],
            "granularity": "month",
            "timezone": "Asia/Kuala_Lumpur",
            "started_at": started.isoformat(),
            "completed_at": completed.isoformat(),
            "duration_ms": elapsed_ms,
            "period_count": len(trend["periods"]),
            "finding_count": len(analysis["findings"]),
            "assessment": analysis.get("assessment"),
            "findings": analysis["findings"],
            "read_only": True,
            "raw_records_included": False,
            "ai_used": False,
        })

        return {
            "status": "success",
            "pipeline_type": "historical_quality",
            "connection_id": "historical_source",
            "dataset_type": "synthetic_demo",
            "granularity": "month",
            "timezone": "Asia/Kuala_Lumpur",
            "started_at": started.isoformat(),
            "completed_at": completed.isoformat(),
            "duration_ms": elapsed_ms,
            "period_count": len(trend["periods"]),
            "finding_count": len(analysis["findings"]),
            "assessment": analysis.get("assessment"),
            "findings": analysis["findings"],
            "read_only": True,
            "raw_records_included": False,
            "ai_used": False,
            "history_persisted": history_result["history_persisted"],
            "run_id": history_result["run_id"],
            "history_records_saved": history_result["records_saved"],
            "history_findings_saved": history_result["findings_saved"],
        }

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Historical pipeline execution is unavailable.",
        ) from None
