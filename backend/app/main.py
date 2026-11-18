
"""
AI Data Guardian 3.0
FastAPI Main Application

Features:
1. Backend health monitoring
2. PostgreSQL health monitoring
3. PostgreSQL table discovery
4. Safe and masked Data Preview
5. Customer deterministic validation
6. Multi-table deterministic validation
7. Secure read-only SQL execution
8. Centralized AI Guardian API

Security:
- Approved database tables only
- Approved preview columns only
- Read-only PostgreSQL account
- Read-only preview transactions
- PII masking before API response
- Maximum 100 preview rows
- SQL statement timeout
- Ollama invoked only through AI API
"""

import os
from datetime import date, datetime
from decimal import Decimal

import psycopg
from psycopg import sql

from dotenv import load_dotenv

from fastapi import (
    FastAPI,
    HTTPException,
    Query
)

from app.validation.customer_rules import (
    validate_customers
)

from app.api.validation_api import (
    router as validation_router
)

from app.api.sql_api import (
    router as sql_router
)

from app.api.ai_api import (
    router as ai_router
)



# =====================================================
# LOCAL DEVELOPMENT CORS
# =====================================================

from fastapi.middleware.cors import CORSMiddleware

app_cors_origins = [
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://localhost:5173",
    "http://localhost:5174",
]

# =====================================================
# ENVIRONMENT CONFIGURATION
# =====================================================

load_dotenv()


# =====================================================
# FASTAPI APPLICATION
# =====================================================

app = FastAPI(
    title="AI Data Guardian 3.0 Backend",
    version="1.0.0",
    description=(
        "Secure data validation, masked preview, "
        "read-only SQL, and local AI investigation"
    )
)



# Allow only approved local React development origins.
# Do not use unrestricted origins in production.

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# GUARDIAN AUTHORIZATION MIDDLEWARE
# Disabled temporarily until frontend authentication is ready.
from app.security.middleware import GuardianAuthorizationMiddleware
from app.security.security_config import authorization_enabled

app.add_middleware(
    GuardianAuthorizationMiddleware,
    enabled=authorization_enabled(),
)

# =====================================================
# APPROVED POSTGRESQL TABLES
# =====================================================

ALLOWED_TABLES = {
    "customers",
    "transactions",
    "products",
    "dim_region",
    "etl_logs"
}


# =====================================================
# APPROVED DATA PREVIEW COLUMNS
#
# Never automatically expose every column.
#
# If a new column is added to PostgreSQL,
# it will not automatically appear in preview.
# =====================================================

ALLOWED_PREVIEW_COLUMNS = {

    "customers": [
        "customer_id",
        "name",
        "email",
        "phone",
        "region",
        "updated_at"
    ],

    "transactions": [
        "transaction_id",
        "customer_id",
        "product_id",
        "quantity",
        "amount",
        "transaction_date"
    ],

    "products": [
        "product_id",
        "product_name",
        "category",
        "price",
        "updated_at"
    ],

    "dim_region": [
        "region_id",
        "region_name",
        "region_code"
    ],

    "etl_logs": [
        "log_id",
        "pipeline_name",
        "status",
        "records_processed",
        "started_at",
        "completed_at"
    ]
}


# =====================================================
# PII CLASSIFICATION
# =====================================================

SENSITIVE_NAME_COLUMNS = {
    "name",
    "customer_name",
    "full_name",
    "first_name",
    "last_name"
}

SENSITIVE_EMAIL_COLUMNS = {
    "email"
}

SENSITIVE_PHONE_COLUMNS = {
    "phone"
}

SENSITIVE_IDENTIFIER_COLUMNS = {
    "customer_id",
    "transaction_id"
}


# =====================================================
# DATABASE CONFIGURATION
#
# This application uses the restricted reader
# for health checks, discovery, and previews.
# =====================================================

def database_config():
    username = os.getenv("READER_DB_USER")
    password = os.getenv("READER_DB_PASSWORD")

    if not username or not password:
        raise ValueError(
            "PostgreSQL read-only credentials "
            "are not configured"
        )

    return {
        "host": os.getenv(
            "DB_HOST",
            "127.0.0.1"
        ),
        "port": int(
            os.getenv(
                "DB_PORT",
                "5432"
            )
        ),
        "dbname": os.getenv(
            "DB_NAME",
            "customer_db"
        ),
        "user": username,
        "password": password,
        "connect_timeout": 5
    }


# =====================================================
# MASKING: CUSTOMER NAMES
# =====================================================

def mask_name(value):
    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return ""

    return text[0] + "***"


# =====================================================
# MASKING: EMAIL ADDRESSES
# =====================================================

def mask_email(value):
    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return ""

    if "@" not in text:
        return "***"

    local, domain = text.split("@", 1)

    if not local or not domain:
        return "***"

    return local[0] + "***@" + domain


# =====================================================
# MASKING: PHONE NUMBERS
# =====================================================

def mask_phone(value):
    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return ""

    digits = "".join(
        character
        for character in text
        if character.isdigit()
    )

    if len(digits) < 4:
        return "***"

    return (
        "*" * (len(digits) - 4)
        + digits[-4:]
    )


# =====================================================
# MASKING: IDENTIFIERS
# =====================================================

def mask_identifier(value):
    if value is None:
        return None

    text = str(value)

    if not text:
        return ""

    return text[:1] + "***"


# =====================================================
# SAFE VALUE CONVERSION
#
# Apply PII masking BEFORE responding to React.
# =====================================================

def safe_value(column, value):
    column = column.lower()

    if value is None:
        return None

    if column in SENSITIVE_EMAIL_COLUMNS:
        return mask_email(value)

    if column in SENSITIVE_PHONE_COLUMNS:
        return mask_phone(value)

    if column in SENSITIVE_NAME_COLUMNS:
        return mask_name(value)

    if column in SENSITIVE_IDENTIFIER_COLUMNS:
        return mask_identifier(value)

    if isinstance(value, Decimal):
        return str(value)

    if isinstance(value, (date, datetime)):
        return value.isoformat()

    if isinstance(value, (str, int, float, bool)):
        return value

    # Do not expose unexpected object types.
    return "[hidden]"


# =====================================================
# ENDPOINT 1 — ROOT
# =====================================================

@app.get("/")
def home():
    return {
        "application": "AI Data Guardian 3.0",
        "backend": "FastAPI",
        "status": "running"
    }


# =====================================================
# ENDPOINT 2 — BACKEND HEALTH
# =====================================================

@app.get("/api/v1/health")
def health():
    return {
        "service": "Python Backend",
        "status": "healthy"
    }


# =====================================================
# ENDPOINT 3 — POSTGRESQL HEALTH
# =====================================================

@app.get("/api/v1/database/health")
def database_health():
    try:
        with psycopg.connect(
            **database_config()
        ) as connection:

            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT current_database()"
                )

                database_name = cursor.fetchone()[0]

        return {
            "service": "PostgreSQL",
            "status": "connected",
            "database": database_name
        }

    except (psycopg.Error, ValueError):
        return {
            "service": "PostgreSQL",
            "status": "disconnected",
            "database": None
        }


# =====================================================
# ENDPOINT 4 — DISCOVER POSTGRESQL TABLES
# =====================================================

@app.get("/api/v1/database/tables")
def list_database_tables():
    try:
        with psycopg.connect(
            **database_config()
        ) as connection:

            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_type = 'BASE TABLE'
                    ORDER BY table_name;
                    """
                )

                tables = [
                    row[0]
                    for row in cursor.fetchall()
                    if row[0] in ALLOWED_TABLES
                ]

        return {
            "database": os.getenv(
                "DB_NAME",
                "customer_db"
            ),
            "status": "success",
            "total_tables": len(tables),
            "tables": tables
        }

    except (psycopg.Error, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database tables are unavailable"
        )


# =====================================================
# ENDPOINT 5 — SECURE MASKED DATA PREVIEW
#
# Important:
# - Approved tables only
# - Approved columns only
# - Restricted PostgreSQL reader
# - Read-only database transaction
# - Maximum 100 rows
# - PII masking
# =====================================================

@app.get(
    "/api/v1/database/tables/{table_name}/preview"
)
def preview_table(
    table_name: str,
    limit: int = Query(
        default=20,
        ge=1,
        le=100
    )
):
    # Reject unapproved tables.
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(
            status_code=404,
            detail="Table is not available"
        )

    try:
        with psycopg.connect(
            **database_config()
        ) as connection:

            with connection.transaction():

                with connection.cursor() as cursor:

                    cursor.execute(
                        "SET TRANSACTION READ ONLY"
                    )

                    cursor.execute(
                        "SET LOCAL statement_timeout = '5000ms'"
                    )

                    # ---------------------------------
                    # Read actual available columns.
                    # ---------------------------------

                    cursor.execute(
                        """
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = %s
                        ORDER BY ordinal_position;
                        """,
                        (table_name,)
                    )

                    available_columns = {
                        row[0]
                        for row in cursor.fetchall()
                    }

                    # ---------------------------------
                    # Use only explicitly approved
                    # columns present in PostgreSQL.
                    # ---------------------------------

                    approved_columns = [
                        column
                        for column in
                        ALLOWED_PREVIEW_COLUMNS[table_name]
                        if column in available_columns
                    ]

                    if not approved_columns:
                        raise ValueError(
                            "No approved preview columns "
                            "are available"
                        )

                    # ---------------------------------
                    # Build SQL safely with identifiers.
                    # Never execute raw user SQL here.
                    # ---------------------------------

                    selected_columns = sql.SQL(
                        ", "
                    ).join(
                        sql.Identifier(column)
                        for column in approved_columns
                    )

                    query = sql.SQL(
                        "SELECT {} FROM {} LIMIT %s"
                    ).format(
                        selected_columns,
                        sql.Identifier(
                            "public",
                            table_name
                        )
                    )

                    cursor.execute(
                        query,
                        (limit,)
                    )

                    columns = [
                        description.name
                        for description in cursor.description
                    ]

                    records = cursor.fetchall()

        # ---------------------------------------------
        # Mask data BEFORE returning the API response.
        # ---------------------------------------------

        masked_rows = []

        for record in records:
            masked_record = [
                safe_value(column, value)
                for column, value in zip(
                    columns,
                    record
                )
            ]

            masked_rows.append(
                masked_record
            )

        return {
            "database": os.getenv(
                "DB_NAME",
                "customer_db"
            ),
            "table": table_name,
            "status": "success",
            "masked": True,
            "limit": limit,
            "returned_rows": len(masked_rows),
            "columns": columns,
            "rows": masked_rows
        }

    except (psycopg.Error, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Data preview is unavailable"
        )


# =====================================================
# ENDPOINT 6 — CUSTOMER VALIDATION
#
# Existing endpoint preserved for compatibility.
# =====================================================

@app.get("/api/v1/validation/customers")
def get_customer_validation():
    """
    Execute deterministic customer validation.

    Ollama is not called.
    """

    try:
        return validate_customers()

    except (psycopg.Error, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Customer validation is unavailable"
        )


# =====================================================
# ADDITIONAL API ROUTERS
# =====================================================

# Multi-table deterministic validation:
#
# GET /api/v1/validation/tables/{table_name}

app.include_router(validation_router)


# Secure SQL execution:
#
# POST /api/v1/sql/execute

app.include_router(sql_router)


# Centralized AI Guardian:
#
# POST /api/v1/ai/investigate/{table_name}

app.include_router(ai_router)


# Read-only customer evidence API
from app.api.evidence_api import router as evidence_router
app.include_router(evidence_router)

# =====================================================
# Active deployment uses one quality run catalogue. Legacy pipeline/history,
# historical monitoring and reconciliation modules are not registered.
from app.api.auth_api import router as auth_router
from app.api.connections_api import router as connections_router
from app.api.quality_lab_api import router as quality_lab_router
app.include_router(auth_router)
app.include_router(connections_router)
app.include_router(quality_lab_router)
