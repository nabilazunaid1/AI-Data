
"""
AI Data Guardian 3.0
Read-Only Row-Level Evidence API

Endpoint:
GET /api/v1/evidence/customers

Purpose:
- Retrieve deterministic customer validation evidence
- Return temporary pseudonymous row references
- Identify failed validation rules
- Keep raw customer information out of responses

No Ollama requests.
No database modifications.

LOCAL DEVELOPMENT ONLY:
Authentication and authorization must be added
before exposing this endpoint to other users.
"""

import logging

import psycopg

from fastapi import APIRouter, HTTPException

from app.validation.customer_evidence import (
    collect_customer_evidence
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/evidence",
    tags=["Validation Evidence"]
)


@router.get("/customers")
def get_customer_evidence():
    """
    Retrieve current row-level validation evidence.

    PostgreSQL performs deterministic rule checks.
    The evidence engine converts customer IDs into
    temporary pseudonymous references before
    returning the results.

    This endpoint does not call an AI model.
    """

    try:
        result = collect_customer_evidence()

    except (psycopg.Error, ValueError) as error:
        logger.warning(
            "Customer evidence unavailable: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail="Customer validation evidence is unavailable"
        ) from error

    if (
        result.get("status") != "success"
        or result.get("table") != "customers"
        or result.get("ai_used") is not False
    ):
        raise HTTPException(
            status_code=503,
            detail="Invalid evidence engine response"
        )

    # Return only explicitly approved response fields.
    # Never return internal customer identifiers.

    return {
        "status": "success",
        "table": "customers",
        "validation_method": "deterministic_sql",
        "ai_used": False,
        "pii_included": False,
        "row_reference_type": result[
            "row_reference_type"
        ],
        "total_affected_rows": result[
            "total_affected_rows"
        ],
        "total_issue_occurrences": result[
            "total_issue_occurrences"
        ],
        "issue_counts": result[
            "issue_counts"
        ],
        "rule_descriptions": result[
            "rule_descriptions"
        ],
        "evidence": result[
            "evidence"
        ],
        "returned_evidence_rows": result[
            "returned_evidence_rows"
        ],
        "truncated": result[
            "truncated"
        ],
        "limitations": result[
            "limitations"
        ]
    }
