
"""
AI Data Guardian 3.0
Deterministic Customer Data Validation

All checks are performed using Python and SQL.
Ollama / Qwen is not used for routine validation.
"""

import os

import psycopg
from dotenv import load_dotenv


load_dotenv()


def reader_database_config():
    """Get the restricted PostgreSQL connection settings."""

    username = os.getenv("READER_DB_USER")
    password = os.getenv("READER_DB_PASSWORD")

    if not username or not password:
        raise ValueError(
            "PostgreSQL reader account is not configured."
        )

    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("DB_NAME", "customer_db"),
        "user": username,
        "password": password,
        "connect_timeout": 5,
    }


def validate_customers():
    """
    Validate the customers table.

    Rules:
    1. Missing or empty email addresses.
    2. Duplicate nonempty email addresses.
    3. Phone numbers that are not 10-11 digits.

    All queries use a read-only PostgreSQL transaction.
    """

    with psycopg.connect(
        **reader_database_config()
    ) as connection:

        with connection.transaction():

            with connection.cursor() as cursor:

                # Enforce read-only SQL execution.
                cursor.execute(
                    "SET TRANSACTION READ ONLY"
                )

                cursor.execute(
                    "SET LOCAL statement_timeout = '5000ms'"
                )

                # CHECK 1: Total number of customers.
                cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM public.customers;
                    """
                )

                total_records = cursor.fetchone()[0]

                # CHECK 2: Missing email addresses.
                cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM public.customers
                    WHERE email IS NULL
                       OR TRIM(email) = '';
                    """
                )

                missing = cursor.fetchone()[0]

                # CHECK 3: Duplicate emails.
                # Normalization ignores case and whitespace.
                # Count extra occurrences, not duplicate groups.
                cursor.execute(
                    """
                    SELECT COALESCE(
                        SUM(occurrences - 1),
                        0
                    )
                    FROM (
                        SELECT COUNT(*) AS occurrences
                        FROM public.customers
                        WHERE email IS NOT NULL
                          AND TRIM(email) <> ''
                        GROUP BY LOWER(TRIM(email))
                        HAVING COUNT(*) > 1
                    ) AS duplicate_groups;
                    """
                )

                duplicates = int(
                    cursor.fetchone()[0]
                )

                # CHECK 4: Invalid phone numbers.
                # Demo policy: exactly 10 or 11 digits.
                cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM public.customers
                    WHERE phone IS NULL
                       OR phone !~ '^[0-9]{10,11}$';
                    """
                )

                invalid = cursor.fetchone()[0]

    total_issues = missing + duplicates + invalid

    if total_records == 0:
        return {
            "table": "customers",
            "status": "no_data",
            "total_records": 0,
            "quality_score": None,
            "missing": 0,
            "duplicates": 0,
            "invalid": 0,
            "total_issues": 0,
            "message": "No customer records to validate.",
            "validation_method": "deterministic_sql",
            "ai_used": False
        }

    # Three validation opportunities per customer.
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
        "table": "customers",
        "status": "completed",
        "total_records": total_records,
        "quality_score": quality_score,
        "missing": missing,
        "duplicates": duplicates,
        "invalid": invalid,
        "total_issues": total_issues,
        "validation_method": "deterministic_sql",
        "ai_used": False
    }
