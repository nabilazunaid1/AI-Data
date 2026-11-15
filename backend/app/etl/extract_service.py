
"""
AI Data Guardian 3.0
PostgreSQL Extraction Service

Purpose:
- Read approved PostgreSQL tables
- Enforce read-only database access
- Extract a limited number of records
- Mask sensitive values before returning data
- Provide structured extraction results

Initial implementation:
- customers table only
- 100 records maximum per extraction
- no database modifications
- no Ollama calls

LOCAL PROTOTYPE:
Masking and access controls require further
security review before production use.
"""

import json
import re

import psycopg

from psycopg import sql

from app.validation.customer_rules import (
    reader_database_config
)


# =====================================================
# CONFIGURATION
# =====================================================

ALLOWED_TABLES = {
    "customers": [
        "customer_id",
        "name",
        "email",
        "phone",
        "region",
        "updated_at"
    ]
}

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


# =====================================================
# PRIVACY MASKING
# =====================================================

def mask_customer_id(value):
    """
    Do not reveal the source customer identifier.
    """

    if value is None:
        return None

    return "[MASKED_ID]"


def mask_name(value):
    if value is None:
        return None

    if str(value).strip() == "":
        return ""

    return "[MASKED_NAME]"


def mask_email(value):
    if value is None:
        return None

    if str(value).strip() == "":
        return ""

    return "[MASKED_EMAIL]"


def mask_phone(value):
    if value is None:
        return None

    if str(value).strip() == "":
        return ""

    return "[MASKED_PHONE]"


MASK_FUNCTIONS = {
    "customer_id": mask_customer_id,
    "name": mask_name,
    "email": mask_email,
    "phone": mask_phone
}


# =====================================================
# INPUT VALIDATION
# =====================================================

def validate_extraction_request(
    table_name,
    limit=DEFAULT_LIMIT
):
    """
    Validate table and extraction size.
    """

    if table_name not in ALLOWED_TABLES:
        raise ValueError(
            "Table is not approved for ETL extraction."
        )

    if type(limit) is not int:
        raise ValueError(
            "Extraction limit must be an integer."
        )

    if limit < 1 or limit > MAX_LIMIT:
        raise ValueError(
            f"Extraction limit must be between "
            f"1 and {MAX_LIMIT}."
        )

    return table_name, limit


# =====================================================
# MASK EXTRACTED ROW
# =====================================================

def mask_row(row, columns):
    """
    Convert one PostgreSQL row into an approved
    masked output dictionary.

    Raw sensitive values must never be returned.
    """

    masked = {}

    for column, value in zip(columns, row):

        if column in MASK_FUNCTIONS:
            masked[column] = MASK_FUNCTIONS[
                column
            ](value)

        elif column == "updated_at":
            masked[column] = (
                value.isoformat()
                if value is not None
                else None
            )

        elif column == "region":
            # Region remains visible under the
            # current demo privacy policy.
            masked[column] = value

        else:
            # Fail closed for unknown columns.
            masked[column] = "[REDACTED]"

    return masked


# =====================================================
# POSTGRESQL EXTRACTION
# =====================================================

def extract_table(
    table_name="customers",
    limit=DEFAULT_LIMIT
):
    """
    Extract and mask approved PostgreSQL records.

    PostgreSQL is accessed using the restricted
    reader account in a read-only transaction.

    The source database is never modified.
    """

    table_name, limit = (
        validate_extraction_request(
            table_name,
            limit
        )
    )

    columns = ALLOWED_TABLES[
        table_name
    ]

    with psycopg.connect(
        **reader_database_config()
    ) as connection:

        with connection.transaction():

            with connection.cursor() as cursor:

                cursor.execute(
                    "SET TRANSACTION READ ONLY"
                )

                cursor.execute(
                    "SET LOCAL statement_timeout = '5000ms'"
                )

                # All SQL identifiers come from
                # the allowlist, not user input.

                query = sql.SQL(
                    """
                    SELECT {columns}
                    FROM {schema}.{table}
                    ORDER BY {order_column}
                    LIMIT %s
                    """
                ).format(
                    columns=sql.SQL(", ").join(
                        sql.Identifier(column)
                        for column in columns
                    ),
                    schema=sql.Identifier("public"),
                    table=sql.Identifier(table_name),
                    order_column=sql.Identifier(
                        "customer_id"
                    )
                )

                cursor.execute(
                    query,
                    (limit,)
                )

                records = cursor.fetchall()

    masked_rows = [
        mask_row(row, columns)
        for row in records
    ]

    return {
        "status": "success",
        "stage": "extract",
        "table": table_name,
        "source": "postgresql",
        "read_only": True,
        "pii_masked": True,
        "ai_used": False,
        "extracted_records": len(masked_rows),
        "limit": limit,
        "columns": columns,
        "rows": masked_rows,
        "message": (
            "Approved PostgreSQL data extracted "
            "and masked successfully."
        )
    }


# =====================================================
# LOCAL TEST
# =====================================================

if __name__ == "__main__":

    result = extract_table(
        table_name="customers",
        limit=5
    )

    print("POSTGRESQL EXTRACTION TEST")
    print("=" * 45)

    print(
        json.dumps(
            result,
            indent=2
        )
    )
