"""Explicitly triggered, read-only AI Data Guardian workflow endpoint.

This router reuses the existing verified customer workflow and never accepts
SQL, database credentials, table names or raw customer records from clients.
"""

import logging

import psycopg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool

from app.ai_guardian.agentic_workflow import run_agentic_quality_review

router = APIRouter(prefix="/api/v1/ai", tags=["AI Guardian"])
logger = logging.getLogger(__name__)


class AgenticReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    use_ai: StrictBool = False


@router.post("/quality-review")
def quality_review(request: AgenticReviewRequest):
    """Run deterministic checks; use Ollama only when use_ai is explicitly true."""
    try:
        return run_agentic_quality_review(use_ai=request.use_ai)
    except (psycopg.Error, ValueError, RuntimeError, OSError):
        logger.warning("AI quality review unavailable", exc_info=False)
        raise HTTPException(
            status_code=503,
            detail="AI quality review is unavailable.",
        ) from None
