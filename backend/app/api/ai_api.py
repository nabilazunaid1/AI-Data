
"""
AI Data Guardian 3.0
Centralized AI Investigation API

POST /api/v1/ai/investigate/{table_name}

Runs deterministic validation first.
Only an approved numerical summary is sent to
the local Ollama model.

No raw customer records are sent to AI.
"""

import logging

import psycopg

from fastapi import APIRouter, HTTPException

from app.validation.customer_rules import (
    validate_customers
)

from app.validation.other_tables import (
    validate_table,
    VALIDATION_QUERIES
)

from app.ai_guardian.guardian_service import (
    investigate_validation,
    validate_summary
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/ai",
    tags=["AI Guardian"]
)

ALLOWED_TABLES = {
    "customers",
    *VALIDATION_QUERIES.keys()
}


def get_fresh_validation(table_name):
    """
    Retrieve real validation results from PostgreSQL.
    """

    if table_name == "customers":
        result = validate_customers()
    else:
        result = validate_table(table_name)

    if not isinstance(result, dict):
        raise ValueError(
            "Invalid validation result"
        )

    if result.get("status") == "no_data":
        raise ValueError(
            "Cannot investigate an empty table"
        )

    summary = {
        "table": table_name,
        "total_records": result.get("total_records"),
        "quality_score": result.get("quality_score"),
        "missing": result.get("missing"),
        "duplicates": result.get("duplicates"),
        "invalid": result.get("invalid")
    }

    return validate_summary(summary)


@router.post("/investigate/{table_name}")
def investigate_table(table_name: str):
    """
    Run one user-requested local AI investigation.
    """

    if table_name not in ALLOWED_TABLES:
        raise HTTPException(
            status_code=404,
            detail="Table not approved for investigation"
        )

    try:
        summary = get_fresh_validation(table_name)

    except (psycopg.Error, ValueError) as error:
        logger.warning(
            "Validation preparation failed: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail="Unable to prepare validation summary"
        ) from error

    try:
        result = investigate_validation(summary)

    except (RuntimeError, TimeoutError, OSError) as error:
        logger.warning(
            "AI investigation failed: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail="Local Ollama investigation is unavailable"
        ) from error

    return {
        "status": "success",
        "table": table_name,
        "model": result["model"],
        "provider": result["provider"],
        "ai_used": True,
        "read_only": True,
        "summary": summary,
        "explanation": result["explanation"],
        "disclaimer": (
            "AI explanations use aggregate validation "
            "metrics only. Individual database records "
            "were not examined."
        )
    }
