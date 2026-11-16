import re

import psycopg

from app.validation.customer_rules import (
    reader_database_config,
)


def contains_customer_name(question: str) -> bool:
    """
    Detect existing customer names in an AI question.

    Uses restricted PostgreSQL reader credentials.
    Only reads the name column.
    Never returns customer names.
    """

    if not isinstance(question, str) or not question.strip():
        return False

    normalized_question = question.casefold()

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

                cursor.execute("""
                    SELECT DISTINCT name
                    FROM public.customers
                    WHERE name IS NOT NULL
                      AND TRIM(name) <> ''
                """)

                names = cursor.fetchall()

    for (name,) in names:

        normalized_name = " ".join(
            str(name).split()
        ).casefold()

        if not normalized_name:
            continue

        pattern = (
            r"(?<!\w)"
            + re.escape(normalized_name)
            + r"(?!\w)"
        )

        if re.search(pattern, normalized_question):
            return True

    return False
