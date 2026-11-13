
"""
AI Data Guardian 3.0
Secure SQL Execution API

Endpoint:
POST /api/v1/sql/execute

Uses the existing secure SQL engine.
No Ollama or Qwen calls.
"""

import psycopg

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.sql_engine.secure_sql import (
    execute_secure_sql
)


router = APIRouter(
    prefix="/api/v1/sql",
    tags=["Secure SQL"]
)


class SQLRequest(BaseModel):
    query: str = Field(
        min_length=1,
        max_length=2000
    )


@router.post("/execute")
def execute_sql(request: SQLRequest):
    """
    Run strictly approved, read-only SQL.

    The underlying engine:
    - Validates an allowlisted SQL grammar
    - Uses restricted database credentials
    - Enforces read-only transactions
    - Limits returned rows
    - Masks known sensitive fields
    """

    try:
        return execute_secure_sql(request.query)

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except psycopg.Error:
        raise HTTPException(
            status_code=503,
            detail="Database query service unavailable"
        )
