"""
AI Data Guardian 3.0
Controlled PostgreSQL sampling component.

Security:
- Approved table and columns only
- Restricted read-only database credentials
- Read-only transaction
- Statement timeout
- Bounded result size
- SQL identifiers composed safely

Important:
This function returns raw sampled values internally.
Callers must never expose its rows through public
API responses, logs, reports, or AI prompts.
"""

import psycopg

from psycopg import sql

from app.validation.customer_rules import (
    reader_database_config,
)


MAX_SAMPLE_ROWS = 500

APPROVED_TABLES = {
    "customers": {
        "schema": "public",
        "table": "customers",
        "columns": {
            "customer_id",
            "email",
            "region",
        },
        "order_column": "customer_id",
    }
}


def validate_sample_request(
    table_name,
    columns,
    limit,
):
    if (
        not isinstance(table_name, str)
        or table_name not in APPROVED_TABLES
    ):
        raise ValueError(
            "Unsupported sampling table."
        )

    if (
        not isinstance(columns, (list, tuple))
        or not columns
    ):
        raise ValueError(
            "Sampling columns must be a non-empty list."
        )

    if len(columns) != len(set(columns)):
        raise ValueError(
            "Duplicate sampling column."
        )

    allowed = APPROVED_TABLES[
        table_name
    ]["columns"]

    if not all(
        isinstance(column, str)
        and column in allowed
        for column in columns
    ):
        raise ValueError(
            "Unapproved sampling column."
        )

    if (
        type(limit) is not int
        or not 1 <= limit <= MAX_SAMPLE_ROWS
    ):
        raise ValueError(
            "Sampling limit must be between "
            "1 and 500."
        )

    return list(columns)


def fetch_postgres_sample(
    table_name="customers",
    columns=None,
    limit=100,
    connection_config=None,
):
    """
    Retrieve a bounded PostgreSQL sample.

    Only the approved public.customers table is
    currently supported.

    connection_config may be supplied internally
    for a separately configured database.

    Never accept connection credentials directly
    from an untrusted public API request.

    Returns raw rows for INTERNAL processing only.
    """

    if columns is None:
        columns = [
            "customer_id",
            "email",
            "region",
        ]

    selected_columns = validate_sample_request(
        table_name,
        columns,
        limit,
    )

    table_config = APPROVED_TABLES[
        table_name
    ]

    config = (
        reader_database_config()
        if connection_config is None
        else connection_config
    )

    if not isinstance(config, dict):
        raise ValueError(
            "Invalid internal database configuration."
        )

    query = sql.SQL(
        """
        SELECT {columns}
        FROM {schema}.{table}
        ORDER BY {order_column} NULLS LAST
        LIMIT %s
        """
    ).format(
        columns=sql.SQL(", ").join(
            sql.Identifier(column)
            for column in selected_columns
        ),
        schema=sql.Identifier(
            table_config["schema"]
        ),
        table=sql.Identifier(
            table_config["table"]
        ),
        order_column=sql.Identifier(
            table_config["order_column"]
        ),
    )

    with psycopg.connect(
        **config
    ) as connection:

        with connection.transaction():

            with connection.cursor() as cursor:

                cursor.execute(
                    "SET TRANSACTION READ ONLY"
                )

                cursor.execute(
                    "SET LOCAL statement_timeout = '5000ms'"
                )

                cursor.execute(
                    query,
                    (limit + 1,),
                )

                records = cursor.fetchall()

                selected_names = [
                    description.name
                    for description in cursor.description
                ]

    truncated = len(records) > limit

    records = records[:limit]

    rows = [
        dict(zip(selected_names, record))
        for record in records
    ]

    return {
        "status": "success",
        "table": table_name,
        "scope": "bounded_sql_sample",
        "read_only": True,
        "ai_used": False,
        "sample_limit": limit,
        "returned_rows": len(rows),
        "has_more_rows": truncated,
        "columns": selected_names,
        "rows": rows,
    }


# Approved synthetic reconciliation fixture.
# Available in both the source and target databases.
# No changes to the existing customers configuration.

APPROVED_TABLES["guardian_reconcile_fixture"] = {
    "schema": "public",
    "table": "guardian_reconcile_fixture",
    "columns": {
        "customer_id",
        "email",
        "region",
    },
    "order_column": "customer_id",
}
