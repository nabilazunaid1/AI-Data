
"""
AI Data Guardian 3.0
Centralized AI Guardian API

Endpoints:
POST /api/v1/ai/investigate/{table_name}
POST /api/v1/ai/chat/{table_name}

Architecture:
- PostgreSQL + Python: verified validation
- FastAPI: API request handling
- Privacy Guard: server-side question screening
- Ollama: local AI explanations
- One centralized AI model
- AI called only on user request

No unrestricted AI-generated SQL.
No raw database records provided to Ollama.

LOCAL PROTOTYPE:
Pattern-based privacy screening is not a
complete data protection or access control system.
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

from app.ai_guardian.privacy_guard import (
    PrivacyGuardError,
    validate_ai_question
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
# FETCH FRESH DETERMINISTIC VALIDATION
# =====================================================

def get_fresh_validation(table_name):
    """
    Retrieve a current deterministic validation.

    Only approved numerical metrics are included
    in the AI summary.

    No database rows, names, emails, phone
    numbers or customer identifiers are returned.
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
# SHARED VALIDATION ERROR HANDLING
# =====================================================

def prepare_summary(table_name):
    """
    Retrieve fresh verified metrics for an
    explicitly approved PostgreSQL table.
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
# SERVER-SIDE PRIVACY VALIDATION
# =====================================================

def prepare_ai_question(raw_question):
    """
    Check all chat questions before database
    validation or local AI inference.

    The frontend cannot bypass this check by
    submitting directly to the chat endpoint.

    Rejected questions never reach Ollama
    through this endpoint.
    """

    try:
        # First: existing basic text validation.
        question = validate_question(
            raw_question
        )

        # Second: new privacy protection.
        question = validate_ai_question(
            question
        )

        return question

    except PrivacyGuardError as error:

        # PrivacyGuardError messages are designed
        # for user display and do not include
        # submitted personal values.

        raise HTTPException(
            status_code=400,
            detail=str(error)
        ) from error

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        ) from error


# =====================================================
# ENDPOINT 1 — ON-DEMAND AI INVESTIGATION
# =====================================================

@router.post("/investigate/{table_name}")
def investigate_table(table_name: str):
    """
    Explain deterministic validation metrics
    with the configured local Ollama model.

    No free-form question is accepted here.
    No individual records are sent to AI.
    """

    summary = prepare_summary(table_name)

    try:
        result = investigate_validation(
            summary
        )

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
# ENDPOINT 2 — PRIVACY-PROTECTED AI CHAT
# =====================================================

@router.post("/chat/{table_name}")
def chat_with_guardian(
    table_name: str,
    request: ChatRequest
):
    """
    Answer an approved general data-quality question.

    Processing order:
    1. Check approved table.
    2. Validate question syntax and privacy.
    3. Retrieve fresh deterministic metrics.
    4. Invoke Ollama once on demand.

    Unsupported record-level questions must use
    the separate verified evidence endpoints.

    This endpoint does not receive chat history.
    """

    # -------------------------------------------------
    # STEP A: APPROVED TABLE CHECK
    # -------------------------------------------------

    if table_name not in ALLOWED_TABLES:
        raise HTTPException(
            status_code=404,
            detail="Table not approved for AI Guardian"
        )

    # -------------------------------------------------
    # STEP B: SERVER-SIDE PRIVACY GUARD
    #
    # No PostgreSQL or Ollama request occurs
    # before this check succeeds.
    # -------------------------------------------------

    question = prepare_ai_question(
        request.question
    )

    # -------------------------------------------------
    # STEP C: FRESH VERIFIED METRICS
    # -------------------------------------------------

    summary = prepare_summary(
        table_name
    )

    # -------------------------------------------------
    # STEP D: LOCAL OLLAMA INFERENCE
    # -------------------------------------------------

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

    # -------------------------------------------------
    # STEP E: APPROVED RESPONSE
    # -------------------------------------------------

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
