"""
AI Data Guardian 3.0
Independent source-to-target reconciliation API.

Uses trusted backend connection configurations.
Never accepts raw database credentials from clients.
"""

import logging

import psycopg

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.reconciliation.connection_config import (
    independent_database_configs,
)
from app.reconciliation.reconciliation_service import (
    reconcile_postgres_tables,
)


router = APIRouter(
    prefix="/api/v1/reconciliation",
    tags=["N-to-N Reconciliation"],
)

logger = logging.getLogger(__name__)


class ReconciliationRequest(BaseModel):
    table_name: str = "guardian_reconcile_fixture"
    limit: int = Field(default=20, ge=1, le=500)


@router.post("/run")
def run_reconciliation(request: ReconciliationRequest):
    """
    Compare approved columns across two separately
    configured PostgreSQL databases.

    This endpoint is read-only.
    """

    if request.table_name != "guardian_reconcile_fixture":
        raise HTTPException(
            status_code=400,
            detail="Unsupported reconciliation table.",
        )

    try:
        source_config, target_config = (
            independent_database_configs()
        )

        result = reconcile_postgres_tables(
            table_name=request.table_name,
            key_columns=["customer_id"],
            compare_columns=["email", "region"],
            limit=request.limit,
            source_config=source_config,
            target_config=target_config,
        )

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid reconciliation configuration.",
        ) from None

    except (psycopg.Error, RuntimeError, OSError):
        logger.warning(
            "Reconciliation unavailable",
            exc_info=False,
        )

        raise HTTPException(
            status_code=503,
            detail="Reconciliation service unavailable.",
        ) from None

    return result
