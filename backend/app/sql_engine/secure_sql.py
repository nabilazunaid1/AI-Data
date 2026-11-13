
"""
AI Data Guardian 3.0
Secure SQL Execution Engine

Purpose:
- Execute strictly approved SELECT queries
- Use restricted PostgreSQL credentials
- Enforce read-only transactions
- Limit results to 100 rows
- Mask sensitive data before returning results

Ollama and Qwen are NOT used here.
"""

import os
import re

from datetime import date, datetime
from decimal import Decimal

import psycopg

from psycopg import sql
from dotenv import load_dotenv


load_dotenv()


# =====================================================
# APPROVED TABLES AND COLUMNS
# =====================================================

# Explicit column allowlist prevents unexpected schema
# changes from automatically exposing new information.

ALLOWED_COLUMNS = {
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


MAX_ROWS = 100
DEFAULT_ROWS = 20


# =====================================================
# DATABASE CONFIGURATION
# =====================================================

def database_config():
    """
    Use ONLY the restricted guardian_reader account.
    """

    username = os.getenv("READER_DB_USER")
    password = os.getenv("READER_DB_PASSWORD")

    if not username or not password:
        raise ValueError(
            "Read-only database credentials are missing"
        )

    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("DB_NAME", "customer_db"),
        "user": username,
        "password": password,
        "connect_timeout": 5
    }


# =====================================================
# SQL VALIDATION
# =====================================================

# This is intentionally a small SQL grammar,
# not a general-purpose SQL security parser.

QUERY_PATTERN = re.compile(
    r"""
    \A\s*
    SELECT\s+
    (?P<columns>
        \*
        |
        [a-z_][a-z0-9_]*
        (?:\s*,\s*[a-z_][a-z0-9_]*)*
    )
    \s+FROM\s+
    (?:(?:public)\s*\.\s*)?
    (?P<table>[a-z_][a-z0-9_]*)
    (?:\s+LIMIT\s+(?P<limit>[0-9]+))?
    \s*;?\s*\Z
    """,
    re.IGNORECASE | re.VERBOSE
)


def validate_sql_query(query):
    """
    Accept only a simple SELECT projection from
    one approved table, optionally with LIMIT.

    Reject all other SQL syntax.
    """

    if not isinstance(query, str):
        raise ValueError(
            "SQL query must be text"
        )

    if len(query) > 2000:
        raise ValueError(
            "SQL query is too long"
        )

    match = QUERY_PATTERN.fullmatch(query)

    if not match:
        raise ValueError(
            "Only simple SELECT queries are supported. "
            "Use SELECT columns FROM table LIMIT n."
        )

    table_name = match.group("table").lower()

    if table_name not in ALLOWED_COLUMNS:
        raise ValueError(
            "Table is not approved for SQL execution"
        )

    requested_columns = match.group("columns").strip()

    if requested_columns == "*":
        columns = list(ALLOWED_COLUMNS[table_name])

    else:
        columns = [
            column.strip().lower()
            for column in requested_columns.split(",")
        ]

        for column in columns:
            if column not in ALLOWED_COLUMNS[table_name]:
                raise ValueError(
                    f"Column is not approved: {column}"
                )

    raw_limit = match.group("limit")

    if raw_limit is None:
        limit = DEFAULT_ROWS
    else:
        limit = min(int(raw_limit), MAX_ROWS)

    return {
        "table": table_name,
        "columns": columns,
        "limit": limit
    }


# =====================================================
# PII MASKING
# =====================================================

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

    digits = "".join(
        character
        for character in str(value)
        if character.isdigit()
    )

    if len(digits) < 4:
        return "***"

    return (
        "*" * (len(digits) - 4)
        + digits[-4:]
    )


def mask_identifier(value):
    if value is None:
        return None

    text = str(value)

    if not text:
        return ""

    return text[:1] + "***"


# Only these fields receive specific masking rules.
# All fields not in ALLOWED_COLUMNS are rejected
# before query execution.

MASKED_IDENTIFIERS = {
    "customer_id",
    "transaction_id"
}

MASKED_NAMES = {
    "name",
    "customer_name",
    "full_name"
}


def safe_value(column, value):
    """
    Mask selected sensitive fields and serialize
    only approved primitive data types.
    """

    column = column.lower()

    if value is None:
        return None

    if column == "email":
        return mask_email(value)

    if column == "phone":
        return mask_phone(value)

    if column in MASKED_NAMES:
        return mask_name(value)

    if column in MASKED_IDENTIFIERS:
        return mask_identifier(value)

    if isinstance(value, Decimal):
        return str(value)

    if isinstance(value, (date, datetime)):
        return value.isoformat()

    if isinstance(value, (str, int, float, bool)):
        return value

    return "[hidden]"


# =====================================================
# SECURE SQL EXECUTION
# =====================================================

def execute_secure_sql(query):
    """
    Execute one strictly approved read-only SQL query.

    The backend builds SQL using approved identifiers;
    the raw user query is NEVER executed directly.
    """

    parsed = validate_sql_query(query)

    table_name = parsed["table"]
    columns = parsed["columns"]
    limit = parsed["limit"]

    selected_columns = sql.SQL(", ").join(
        sql.Identifier(column)
        for column in columns
    )

    statement = sql.SQL(
        "SELECT {} FROM {} LIMIT %s"
    ).format(
        selected_columns,
        sql.Identifier("public", table_name)
    )

    with psycopg.connect(
        **database_config()
    ) as connection:

        # Explicit read-only transaction.
        with connection.transaction():

            with connection.cursor() as cursor:

                cursor.execute(
                    "SET TRANSACTION READ ONLY"
                )

                cursor.execute(
                    "SET LOCAL statement_timeout = '5000ms'"
                )

                cursor.execute(
                    statement,
                    (limit,)
                )

                records = cursor.fetchall()

    masked_rows = []

    for record in records:
        masked_record = [
            safe_value(column, value)
            for column, value in zip(columns, record)
        ]

        masked_rows.append(masked_record)

    return {
        "status": "success",
        "table": table_name,
        "read_only": True,
        "masked": True,
        "ai_used": False,
        "limit": limit,
        "returned_rows": len(masked_rows),
        "columns": columns,
        "rows": masked_rows
    }


# =====================================================
# LOCAL TEST
# =====================================================

if __name__ == "__main__":

    import json

    test_query = (
        "SELECT * FROM customers LIMIT 5;"
    )

    print("Testing secure SQL engine...")

    result = execute_secure_sql(test_query)

    print(
        json.dumps(
            result,
            indent=2
        )
    )
