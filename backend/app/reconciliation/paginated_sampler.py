"""
AI Data Guardian 3.0
Read-only PostgreSQL paginated retrieval.

Uses a server-side cursor and a repeatable-read
transaction to retrieve records in bounded batches.

Raw records remain inside the trusted backend.
This function must never be exposed directly
through a public API or passed to Ollama.
"""

import psycopg
from psycopg import sql

from app.reconciliation.postgres_sampler import (
    APPROVED_TABLES,
)


MAX_TOTAL_ROWS = 10000
MAX_PAGE_SIZE = 500


def fetch_paginated_rows(
    connection_config,
    table_name,
    columns,
    page_size=250,
    max_total_rows=MAX_TOTAL_ROWS,
):
    """
    Retrieve an approved table in bounded batches.

    A server-side cursor avoids fetching all rows
    in one network response.

    A hard total-row cap prevents unlimited memory
    consumption. If the cap is exceeded, fail closed
    rather than returning incomplete data.

    Returns raw rows for internal processing only.
    """

    if (
        not isinstance(connection_config, dict)
        or not connection_config
    ):
        raise ValueError(
            "Invalid internal connection configuration."
        )

    if table_name not in APPROVED_TABLES:
        raise ValueError("Unsupported table.")

    table = APPROVED_TABLES[table_name]

    if (
        not isinstance(columns, (list, tuple))
        or not columns
        or len(columns) != len(set(columns))
        or not all(
            isinstance(column, str)
            and column in table["columns"]
            for column in columns
        )
    ):
        raise ValueError("Unapproved columns.")

    if (
        type(page_size) is not int
        or not 1 <= page_size <= MAX_PAGE_SIZE
    ):
        raise ValueError("Invalid page size.")

    if (
        type(max_total_rows) is not int
        or not 1 <= max_total_rows <= MAX_TOTAL_ROWS
    ):
        raise ValueError("Invalid total-row limit.")

    query = sql.SQL(
        "SELECT {columns} "
        "FROM {schema}.{table} "
        "ORDER BY {order_column} NULLS LAST"
    ).format(
        columns=sql.SQL(", ").join(
            sql.Identifier(column)
            for column in columns
        ),
        schema=sql.Identifier(table["schema"]),
        table=sql.Identifier(table["table"]),
        order_column=sql.Identifier(
            table["order_column"]
        ),
    )

    rows = []
    page_count = 0

    with psycopg.connect(
        **connection_config
    ) as connection:

        with connection.transaction():

            with connection.cursor() as control:
                control.execute(
                    "SET TRANSACTION ISOLATION LEVEL "
                    "REPEATABLE READ, READ ONLY"
                )

                control.execute(
                    "SET LOCAL statement_timeout = '30000ms'"
                )

            with connection.cursor(
                name="guardian_reconciliation_cursor"
            ) as cursor:

                cursor.execute(query)

                while True:
                    batch = cursor.fetchmany(page_size)

                    if not batch:
                        break

                    if (
                        len(rows) + len(batch)
                        > max_total_rows
                    ):
                        raise RuntimeError(
                            "Dataset exceeds safe retrieval "
                            "limit. No complete dataset "
                            "was returned."
                        )

                    names = [
                        description.name
                        for description in cursor.description
                    ]

                    rows.extend(
                        dict(zip(names, record))
                        for record in batch
                    )

                    page_count += 1

    return {
        "status": "success",
        "table": table_name,
        "read_only": True,
        "complete": True,
        "returned_rows": len(rows),
        "pages_fetched": page_count,
        "rows": rows,
    }
