
"""
AI Data Guardian 3.0
Deterministic Validation API

Supports all five approved PostgreSQL tables.
No Ollama or Qwen calls.
"""

import psycopg

from fastapi import APIRouter, HTTPException

from app.validation.customer_rules import (
    validate_customers
)

from app.validation.other_tables import (
    validate_table,
    VALIDATION_QUERIES
)


router = APIRouter(
    prefix="/api/v1/validation",
    tags=["Data Validation"]
)


@router.get("/tables/{table_name}")
def get_table_validation(table_name: str):
    """
    Return deterministic validation results.

    Only approved tables can be validated.
    """

    if table_name == "customers":
        validation_function = validate_customers

    elif table_name in VALIDATION_QUERIES:
        validation_function = lambda: validate_table(
            table_name
        )

    else:
        raise HTTPException(
            status_code=404,
            detail="Validation rules not configured"
        )

    try:
        return validation_function()

    except (psycopg.Error, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Data validation is unavailable"
        )
