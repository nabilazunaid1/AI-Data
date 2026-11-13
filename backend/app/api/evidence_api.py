
"""
AI Data Guardian 3.0
Verified Row-Level Evidence API

Endpoints:

GET /api/v1/evidence/customers

GET /api/v1/evidence/customers/rules/{rule_name}

Purpose:
- Retrieve deterministic SQL validation evidence
- Identify pseudonymous affected rows
- Explain verified validation rule failures
- Prevent AI hallucination of record references

Security:
- Restricted PostgreSQL reader
- Approved validation rules only
- No raw personal information in responses
- No Ollama calls
- No database modifications

LOCAL DEVELOPMENT ONLY:
Authentication, authorization, and audit controls
are required before enterprise deployment.
"""

import logging

import psycopg

from fastapi import APIRouter, HTTPException

from app.validation.customer_evidence import (
    collect_customer_evidence
)

from app.ai_guardian.evidence_investigation import (
    investigate_verified_rule,
    RULE_CONFIG
)


# =====================================================
# ROUTER CONFIGURATION
# =====================================================

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/evidence",
    tags=["Validation Evidence"]
)


# =====================================================
# ENDPOINT 1 — ALL CUSTOMER EVIDENCE
#
# Preserve existing frontend integration.
# =====================================================

@router.get("/customers")
def get_customer_evidence():
    """
    Retrieve current deterministic customer evidence.

    Returns:
    - Temporary pseudonymous row references
    - Failed rule names
    - Issue counts
    - Rule descriptions

    Does not return raw customer details.
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
            detail=(
                "Customer validation evidence "
                "is unavailable"
            )
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

    # Explicit response field allowlist.
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


# =====================================================
# ENDPOINT 2 — EVIDENCE FOR A SPECIFIC RULE
#
# New evidence-aware investigation endpoint.
# =====================================================

@router.get("/customers/rules/{rule_name}")
def get_customer_rule_evidence(
    rule_name: str
):
    """
    Return verified customer rows for one rule.

    Supported:
    - missing_email
    - duplicate_email
    - invalid_phone

    Results come from deterministic PostgreSQL
    checks, not AI-generated answers.
    """

    # Reject unsupported rule names before
    # accessing the database.

    if rule_name not in RULE_CONFIG:
        raise HTTPException(
            status_code=404,
            detail=(
                "Validation rule is not supported"
            )
        )

    try:
        result = investigate_verified_rule(
            rule_name=rule_name,
            table_name="customers"
        )

    except (psycopg.Error, ValueError) as error:

        logger.warning(
            "Evidence investigation failed "
            "for rule %s: %s",
            rule_name,
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Verified rule evidence is unavailable "
                "or inconsistent with validation results"
            )
        ) from error

    # Validate the result before returning it.

    if (
        result.get("status") != "success"
        or result.get("verified") is not True
        or result.get("ai_used") is not False
        or result.get("rule") != rule_name
        or result.get("table") != "customers"
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "Evidence investigation returned "
                "an invalid result"
            )
        )

    # Explicitly return approved fields only.

    return {
        "status": "success",
        "table": "customers",
        "rule": result["rule"],
        "rule_label": result["rule_label"],
        "verified": True,
        "validation_method": "deterministic_sql",
        "ai_used": False,
        "pii_included": False,
        "quality_score": result["quality_score"],
        "total_records": result["total_records"],
        "verified_issue_count": result[
            "verified_issue_count"
        ],
        "returned_rows": result["returned_rows"],
        "truncated": result["truncated"],
        "finding": result["finding"],
        "rows": result["rows"],
        "recommendation": result["recommendation"],
        "recommendation_source": result[
            "recommendation_source"
        ],
        "limitations": result["limitations"]
    }
