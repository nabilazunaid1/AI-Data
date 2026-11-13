
"""
AI Data Guardian 3.0
Centralized AI Guardian API

Endpoints:
POST /api/v1/ai/investigate/{table_name}
POST /api/v1/ai/chat/{table_name}

Architecture:
- PostgreSQL + Python: verified validation
- FastAPI: request handling
- Ollama: local AI responses
- One centralized AI model
- AI called only on user request

No unrestricted SQL access.
No raw database records sent to AI.
"""

import logging

import psycopg

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

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

from app.ai_guardian.chat_service import (
    ask_guardian,
    validate_question
)


# =====================================================
# CONFIGURATION
# =====================================================

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/ai",
    tags=["AI Guardian"]
)

ALLOWED_TABLES = {
    "customers",
    *VALIDATION_QUERIES.keys()
}


# =====================================================
# REQUEST MODEL
# =====================================================

class ChatRequest(BaseModel):
    question: str = Field(
        min_length=1,
        max_length=500
    )


# =====================================================
# FETCH FRESH VALIDATION SUMMARY
# =====================================================

def get_fresh_validation(table_name):
    """
    Retrieve current deterministic validation.

    Build an explicit numerical summary.

    Do not return raw database rows to Ollama.
    """

    if table_name not in ALLOWED_TABLES:
        raise ValueError(
            "Table is not approved"
        )

    if table_name == "customers":
        result = validate_customers()

    else:
        result = validate_table(table_name)

    if not isinstance(result, dict):
        raise ValueError(
            "Invalid validation response"
        )

    if result.get("status") == "no_data":
        raise ValueError(
            "Cannot investigate an empty table"
        )

    summary = {
        "table": table_name,
        "total_records": result.get(
            "total_records"
        ),
        "quality_score": result.get(
            "quality_score"
        ),
        "missing": result.get("missing"),
        "duplicates": result.get("duplicates"),
        "invalid": result.get("invalid")
    }

    return validate_summary(summary)


# =====================================================
# SHARED DATABASE ERROR HANDLING
# =====================================================

def prepare_summary(table_name):
    """
    Validate the table and retrieve fresh metrics.
    """

    if table_name not in ALLOWED_TABLES:
        raise HTTPException(
            status_code=404,
            detail="Table not approved for AI Guardian"
        )

    try:
        return get_fresh_validation(table_name)

    except (psycopg.Error, ValueError) as error:
        logger.warning(
            "Validation summary unavailable "
            "for %s: %s",
            table_name,
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to prepare verified "
                "validation summary"
            )
        ) from error


# =====================================================
# EXISTING ENDPOINT — AI INVESTIGATION
# =====================================================

@router.post("/investigate/{table_name}")
def investigate_table(table_name: str):
    """
    Generate an explanation of verified metrics.

    Called only when the user requests
    Investigate with AI.
    """

    summary = prepare_summary(table_name)

    try:
        result = investigate_validation(summary)

    except (
        RuntimeError,
        TimeoutError,
        OSError
    ) as error:

        logger.warning(
            "AI investigation unavailable: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Local AI investigation is unavailable. "
                "SQL validation remains operational."
            )
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


# =====================================================
# NEW ENDPOINT — INTERACTIVE AI CHAT
# =====================================================

@router.post("/chat/{table_name}")
def chat_with_guardian(
    table_name: str,
    request: ChatRequest
):
    """
    Answer one question about verified
    PostgreSQL data quality metrics.

    No chat history is sent.
    The question and summary are sent to
    the configured local Ollama model.
    """

    # Reject blank questions before any database
    # or AI processing.
    try:
        question = validate_question(
            request.question
        )

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        ) from error

    # Obtain fresh deterministic metrics.
    summary = prepare_summary(table_name)

    # Invoke Ollama only after validation succeeds.
    try:
        result = ask_guardian(
            question=question,
            summary=summary
        )

    except (
        RuntimeError,
        TimeoutError,
        OSError
    ) as error:

        logger.warning(
            "AI chat unavailable: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Local AI chat is unavailable. "
                "SQL validation remains operational."
            )
        ) from error

    return {
        "status": "success",
        "table": table_name,
        "model": result["model"],
        "provider": result["provider"],
        "ai_used": True,
        "read_only": True,
        "summary": summary,
        "answer": result["answer"],
        "disclaimer": result["disclaimer"]
    }
