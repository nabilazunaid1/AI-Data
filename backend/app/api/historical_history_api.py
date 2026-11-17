"""
AI Data Guardian 3.0
Historical Pipeline History API.

GET /api/v1/historical-history/runs
GET /api/v1/historical-history/runs/{run_id}

Read-only retrieval using guardian_history_reader.
"""

import logging

from fastapi import APIRouter, HTTPException, Query

from app.history.historical_history_reader import (
    get_historical_pipeline_runs,
    get_historical_pipeline_run,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/historical-history",
    tags=["Historical Pipeline History"],
)


@router.get("/runs")
def list_historical_pipeline_runs(
    limit: int = Query(default=20, ge=1, le=100),
):
    """Retrieve recent historical pipeline executions."""

    try:
        return get_historical_pipeline_runs(limit)

    except Exception:
        logger.exception(
            "Historical pipeline history retrieval failed."
        )

        raise HTTPException(
            status_code=503,
            detail="Historical pipeline history is unavailable.",
        ) from None


@router.get("/runs/{run_id}")
def get_historical_pipeline_run_detail(run_id: str):
    """Retrieve one execution and its statistical findings."""

    try:
        result = get_historical_pipeline_run(run_id)

        if result is None:
            raise HTTPException(
                status_code=404,
                detail="Historical pipeline run not found.",
            )

        return {
            "status": "success",
            "run": result,
        }

    except HTTPException:
        raise

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid historical pipeline run ID.",
        ) from None

    except Exception:
        logger.exception(
            "Historical pipeline detail retrieval failed."
        )

        raise HTTPException(
            status_code=503,
            detail="Historical pipeline history is unavailable.",
        ) from None
