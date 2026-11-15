
"""
AI Data Guardian 3.0
Pipeline History API

Endpoints:
GET /api/v1/history/runs
GET /api/v1/history/summary
GET /api/v1/history/runs/{run_id}

Purpose:
- Retrieve approved pipeline execution metadata
- Provide actual PostgreSQL metrics for Reports
- Enforce read-only history access
- Return safe errors without exposing credentials

Security:
- Dedicated PostgreSQL history reader
- No customer table access
- No INSERT, UPDATE or DELETE operations
- No raw PII returned
- No automatic Ollama calls

LOCAL DEVELOPMENT ONLY:
API authentication, authorization and rate
limiting are required before production use.
"""

import logging
import uuid

import psycopg

from fastapi import (
    APIRouter,
    HTTPException,
    Query
)

from app.history.history_read_service import (
    get_recent_pipeline_runs,
    get_pipeline_run_by_id,
    get_pipeline_history_summary
)


# =====================================================
# CONFIGURATION
# =====================================================

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/history",
    tags=["Pipeline History"]
)


# =====================================================
# RECENT PIPELINE RUNS
# =====================================================

@router.get("/runs")
def list_pipeline_runs(
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description=(
            "Maximum number of recent "
            "pipeline executions to retrieve."
        )
    )
):
    """
    Return the most recent pipeline executions.

    Examples:
    GET /api/v1/history/runs
    GET /api/v1/history/runs?limit=5
    """

    try:
        return get_recent_pipeline_runs(
            limit=limit
        )

    except (
        psycopg.Error,
        ValueError,
        KeyError,
        TypeError
    ) as error:

        logger.warning(
            "History list retrieval failed: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Pipeline history is temporarily "
                "unavailable."
            )
        ) from error


# =====================================================
# PIPELINE HISTORY SUMMARY
# =====================================================

@router.get("/summary")
def pipeline_history_summary():
    """
    Return aggregated execution statistics.

    Used for Reports dashboard KPI cards:
    - Total pipeline runs
    - Completed runs
    - Failed runs
    - Average quality score
    - Total processed records
    - Total validation issue occurrences
    - Average execution duration
    """

    try:
        return get_pipeline_history_summary()

    except (
        psycopg.Error,
        ValueError,
        KeyError,
        TypeError
    ) as error:

        logger.warning(
            "History summary retrieval failed: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Pipeline history summary "
                "is temporarily unavailable."
            )
        ) from error


# =====================================================
# SINGLE PIPELINE EXECUTION
# =====================================================

@router.get("/runs/{run_id}")
def get_pipeline_run(run_id: str):
    """
    Retrieve one pipeline execution by UUID.

    Returns:
    - Execution metadata if found
    - HTTP 400 for an invalid Run ID
    - HTTP 404 for an unknown Run ID
    """

    # =========================================
    # VALIDATE RUN ID
    # =========================================

    try:
        validated_id = uuid.UUID(run_id)

    except (
        ValueError,
        AttributeError,
        TypeError
    ) as error:

        raise HTTPException(
            status_code=400,
            detail="Invalid Pipeline Run ID."
        ) from error

    # =========================================
    # RETRIEVE HISTORY RECORD
    # =========================================

    try:
        record = get_pipeline_run_by_id(
            validated_id
        )

        if record is None:
            raise HTTPException(
                status_code=404,
                detail="Pipeline Run ID not found."
            )

        return {
            "status": "success",
            "run": record
        }

    except HTTPException:
        raise

    except (
        psycopg.Error,
        ValueError,
        KeyError,
        TypeError
    ) as error:

        logger.warning(
            "History detail retrieval failed: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Pipeline execution history "
                "is temporarily unavailable."
            )
        ) from error
