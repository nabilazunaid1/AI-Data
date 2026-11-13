
"""
AI Data Guardian 3.0
Deterministic Validation for Four PostgreSQL Tables

Tables:
- transactions
- products
- dim_region
- etl_logs

All processing uses Python + SQL.
No Ollama or Qwen calls are made.
"""

import os

import psycopg
from dotenv import load_dotenv

load_dotenv()


# Only explicitly approved database tables and SQL.
VALIDATION_QUERIES = {

    "transactions": {
        "missing": """
            SELECT COUNT(*)
            FROM public.transactions
            WHERE customer_id IS NULL
               OR TRIM(customer_id) = ''
               OR product_id IS NULL
               OR TRIM(product_id) = '';
        """,

        "duplicates": """
            SELECT COALESCE(
                SUM(occurrences - 1), 0
            )
            FROM (
                SELECT COUNT(*) AS occurrences
                FROM public.transactions
                WHERE customer_id IS NOT NULL
                  AND TRIM(customer_id) <> ''
                  AND product_id IS NOT NULL
                  AND TRIM(product_id) <> ''
                  AND transaction_date IS NOT NULL
                GROUP BY
                    customer_id,
                    product_id,
                    transaction_date
                HAVING COUNT(*) > 1
            ) AS duplicate_groups;
        """,

        "invalid": """
            SELECT COUNT(*)
            FROM public.transactions
            WHERE quantity IS NULL
               OR quantity <= 0
               OR amount IS NULL
               OR amount <= 0
               OR transaction_date IS NULL;
        """
    },

    "products": {
        "missing": """
            SELECT COUNT(*)
            FROM public.products
            WHERE product_name IS NULL
               OR TRIM(product_name) = ''
               OR category IS NULL
               OR TRIM(category) = '';
        """,

        "duplicates": """
            SELECT COALESCE(
                SUM(occurrences - 1), 0
            )
            FROM (
                SELECT COUNT(*) AS occurrences
                FROM public.products
                WHERE product_name IS NOT NULL
                  AND TRIM(product_name) <> ''
                GROUP BY LOWER(TRIM(product_name))
                HAVING COUNT(*) > 1
            ) AS duplicate_groups;
        """,

        "invalid": """
            SELECT COUNT(*)
            FROM public.products
            WHERE price IS NULL
               OR price < 0;
        """
    },

    "dim_region": {
        "missing": """
            SELECT COUNT(*)
            FROM public.dim_region
            WHERE region_name IS NULL
               OR TRIM(region_name) = ''
               OR region_code IS NULL
               OR TRIM(region_code) = '';
        """,

        "duplicates": """
            SELECT COALESCE(
                SUM(occurrences - 1), 0
            )
            FROM (
                SELECT COUNT(*) AS occurrences
                FROM public.dim_region
                WHERE region_code IS NOT NULL
                  AND TRIM(region_code) <> ''
                GROUP BY UPPER(TRIM(region_code))
                HAVING COUNT(*) > 1
            ) AS duplicate_groups;
        """,

        "invalid": """
            SELECT COUNT(*)
            FROM public.dim_region
            WHERE region_code IS NOT NULL
              AND TRIM(region_code) <> ''
              AND TRIM(region_code) !~ '^[A-Z]{3}$';
        """
    },

    "etl_logs": {
        "missing": """
            SELECT COUNT(*)
            FROM public.etl_logs
            WHERE pipeline_name IS NULL
               OR TRIM(pipeline_name) = ''
               OR status IS NULL
               OR TRIM(status) = '';
        """,

        "duplicates": """
            SELECT COALESCE(
                SUM(occurrences - 1), 0
            )
            FROM (
                SELECT COUNT(*) AS occurrences
                FROM public.etl_logs
                WHERE pipeline_name IS NOT NULL
                  AND TRIM(pipeline_name) <> ''
                  AND started_at IS NOT NULL
                GROUP BY
                    LOWER(TRIM(pipeline_name)),
                    started_at
                HAVING COUNT(*) > 1
            ) AS duplicate_groups;
        """,

        "invalid": """
            SELECT COUNT(*)
            FROM public.etl_logs
            WHERE records_processed IS NULL
               OR records_processed < 0
               OR started_at IS NULL
               OR (
                   completed_at IS NOT NULL
                   AND completed_at < started_at
               );
        """
    }
}


def database_config():
    """Use only the restricted PostgreSQL reader."""

    username = os.getenv("READER_DB_USER")
    password = os.getenv("READER_DB_PASSWORD")

    if not username or not password:
        raise ValueError(
            "guardian_reader credentials are missing"
        )

    return {
        "host": os.getenv(
            "DB_HOST", "127.0.0.1"
        ),
        "port": int(
            os.getenv("DB_PORT", "5432")
        ),
        "dbname": os.getenv(
            "DB_NAME", "customer_db"
        ),
        "user": username,
        "password": password,
        "connect_timeout": 5
    }


def validate_table(table_name):
    """
    Validate an approved PostgreSQL table.

    Three checks per record:
    1. Missing data
    2. Duplicate data
    3. Invalid data

    Returns deterministic validation results.
    """

    if table_name not in VALIDATION_QUERIES:
        raise ValueError(
            "Validation rules not configured for table"
        )

    queries = VALIDATION_QUERIES[table_name]

    results = {}

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

                # Table name is sourced only from the
                # internal allowlist, never arbitrary input.
                from psycopg import sql

                count_query = sql.SQL(
                    "SELECT COUNT(*) FROM {}"
                ).format(
                    sql.Identifier(
                        "public", table_name
                    )
                )

                cursor.execute(count_query)

                total_records = int(
                    cursor.fetchone()[0]
                )

                for rule in (
                    "missing",
                    "duplicates",
                    "invalid"
                ):
                    cursor.execute(queries[rule])

                    results[rule] = int(
                        cursor.fetchone()[0]
                    )

    total_issues = sum(results.values())

    if total_records == 0:
        return {
            "table": table_name,
            "status": "no_data",
            "total_records": 0,
            "quality_score": None,
            "missing": 0,
            "duplicates": 0,
            "invalid": 0,
            "total_issues": 0,
            "validation_method": "deterministic_sql",
            "ai_used": False
        }

    total_checks = total_records * 3

    passed_checks = max(
        0,
        total_checks - total_issues
    )

    quality_score = round(
        (passed_checks / total_checks) * 100,
        2
    )

    return {
        "table": table_name,
        "status": "completed",
        "total_records": total_records,
        "quality_score": quality_score,
        "missing": results["missing"],
        "duplicates": results["duplicates"],
        "invalid": results["invalid"],
        "total_issues": total_issues,
        "validation_method": "deterministic_sql",
        "ai_used": False
    }


def validate_all_other_tables():
    """Run validation for all four configured tables."""

    return {
        table_name: validate_table(table_name)
        for table_name in VALIDATION_QUERIES
    }
