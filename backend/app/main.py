from app.validation.customer_rules import validate_customers
import os
from datetime import date, datetime
from decimal import Decimal

import psycopg
from psycopg import sql
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query

load_dotenv()

app = FastAPI(
    title="AI Data Guardian 3.0 Backend",
    version="1.0.0"
)

# Only these five tables are available to Data Preview.
ALLOWED_TABLES = {
    "customers",
    "transactions",
    "products",
    "dim_region",
    "etl_logs",
}

# Columns that contain personal information.
SENSITIVE_COLUMNS = {
    "name",
    "email",
    "phone",
    "customer_name",
    "full_name",
    "first_name",
    "last_name",
}

# Identification fields displayed as masked identifiers.
IDENTIFIER_COLUMNS = {
    "customer_id",
}


def database_config(reader=False):
    if reader:
        username = os.getenv("READER_DB_USER")
        password = os.getenv("READER_DB_PASSWORD")

        if not username or not password:
            raise ValueError(
                "Read-only account is not configured"
            )
    else:
        username = os.getenv("DB_USER", "postgres")
        password = os.getenv("DB_PASSWORD", "")

    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("DB_NAME", "customer_db"),
        "user": username,
        "password": password,
        "connect_timeout": 5,
    }


def mask_name(value):
    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return ""

    return text[0] + "***"


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


def mask_phone(value):
    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return ""

    digits = "".join(
        character for character in text
        if character.isdigit()
    )

    if len(digits) < 4:
        return "***"

    return "*" * (len(digits) - 4) + digits[-4:]


def mask_identifier(value):
    if value is None:
        return None

    text = str(value)

    if len(text) <= 2:
        return "***"

    return text[:1] + "***"


def safe_value(column, value):
    column = column.lower()

    if column == "email":
        return mask_email(value)

    if column == "phone":
        return mask_phone(value)

    if column in SENSITIVE_COLUMNS:
        return mask_name(value)

    if column in IDENTIFIER_COLUMNS:
        return mask_identifier(value)

    if isinstance(value, Decimal):
        return str(value)

    if isinstance(value, (date, datetime)):
        return value.isoformat()

    if isinstance(value, (str, int, float, bool)):
        return value

    if value is None:
        return None

    # Do not expose unexpected object types.
    return "[hidden]"


@app.get("/")
def home():
    return {
        "application": "AI Data Guardian 3.0",
        "backend": "FastAPI",
        "status": "running"
    }


@app.get("/api/v1/health")
def health():
    return {
        "service": "Python Backend",
        "status": "healthy"
    }


@app.get("/api/v1/database/health")
def database_health():
    try:
        with psycopg.connect(
            **database_config(reader=True)
        ) as conn:

            with conn.cursor() as cursor:
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


@app.get("/api/v1/database/tables")
def list_database_tables():
    try:
        with psycopg.connect(
            **database_config(reader=True)
        ) as conn:

            with conn.cursor() as cursor:
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
                "DB_NAME", "customer_db"
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


@app.get("/api/v1/database/tables/{table_name}/preview")
def preview_table(
    table_name: str,
    limit: int = Query(default=20, ge=1, le=100)
):
    # Never accept arbitrary table names.
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(
            status_code=404,
            detail="Table is not available"
        )

    try:
        with psycopg.connect(
            **database_config(reader=True)
        ) as conn:

            # Database-side read-only enforcement.
            with conn.transaction():
                with conn.cursor() as cursor:

                    cursor.execute(
                        "SET TRANSACTION READ ONLY"
                    )

                    cursor.execute(
                        "SET LOCAL statement_timeout = '5000ms'"
                    )

                    query = sql.SQL(
                        "SELECT * FROM {} LIMIT %s"
                    ).format(
                        sql.Identifier("public", table_name)
                    )

                    cursor.execute(query, (limit,))

                    columns = [
                        description.name
                        for description in cursor.description
                    ]

                    records = cursor.fetchall()

        # Mask records BEFORE returning the API response.
        masked_rows = []

        for record in records:
            masked_record = []

            for column, value in zip(columns, record):
                masked_record.append(
                    safe_value(column, value)
                )

            masked_rows.append(masked_record)

        return {
            "database": os.getenv(
                "DB_NAME", "customer_db"
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

@app.get("/api/v1/validation/customers")
def get_customer_validation():
    """
    Return real customer data quality results.

    All validation is deterministic.
    Ollama and Qwen are not called.
    """

    try:
        result = validate_customers()

        return result

    except (psycopg.Error, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Customer validation is unavailable"
        )
