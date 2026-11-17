"""Independent, read-only PostgreSQL historical connector."""

import os

import psycopg


REQUIRED_ENV = {
    "host": "HISTORY_SOURCE_DB_HOST",
    "port": "HISTORY_SOURCE_DB_PORT",
    "dbname": "HISTORY_SOURCE_DB_NAME",
    "user": "HISTORY_SOURCE_DB_USER",
    "password": "HISTORY_SOURCE_DB_PASSWORD",
}

SCHEMA = "guardian_demo"
TABLE = "historical_quality_fixture"

GRANULARITIES = {
    "hour",
    "day",
    "week",
    "month",
    "year",
}


def historical_database_config():
    missing = [
        name
        for name in REQUIRED_ENV.values()
        if not os.environ.get(name)
    ]

    if missing:
        raise RuntimeError(
            "Historical database connection is not configured."
        )

    config = {
        field: os.environ[name]
        for field, name in REQUIRED_ENV.items()
    }

    try:
        config["port"] = int(config["port"])
    except ValueError as exc:
        raise RuntimeError(
            "Invalid historical database port."
        ) from exc

    if not 1 <= config["port"] <= 65535:
        raise RuntimeError(
            "Historical database port is out of range."
        )

    config["connect_timeout"] = 5
    config["options"] = (
        "-c default_transaction_read_only=on "
        "-c statement_timeout=5000"
    )

    return config


def read_query(query, parameters=()):
    """Execute a trusted, fixed SQL query. No raw row API."""
    config = historical_database_config()

    with psycopg.connect(**config) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION READ ONLY")
                cursor.execute(
                    "SET LOCAL statement_timeout = '5000ms'"
                )
                cursor.execute(query, parameters)
                return cursor.fetchall()


def historical_health():
    rows = read_query(
        """
        SELECT
            current_database(),
            current_setting('transaction_read_only')
        """
    )

    database, read_only = rows[0]

    return {
        "status": "connected",
        "database": database,
        "read_only": read_only == "on",
    }


def historical_schema():
    columns = read_query(
        """
        SELECT
            column_name,
            data_type,
            is_nullable
        FROM information_schema.columns
        WHERE table_schema = %s
          AND table_name = %s
        ORDER BY ordinal_position
        """,
        (SCHEMA, TABLE),
    )

    if not columns:
        raise RuntimeError(
            "Historical fixture is not accessible."
        )

    return {
        "status": "success",
        "schema": SCHEMA,
        "table": TABLE,
        "column_count": len(columns),
        "columns": [
            {
                "name": name,
                "data_type": data_type,
                "nullable": nullable == "YES",
            }
            for name, data_type, nullable in columns
        ],
        "raw_records_included": False,
    }


def historical_trend(granularity="month"):
    if granularity not in GRANULARITIES:
        raise ValueError("Unsupported time granularity.")

    # Fixed schema, table, and metric columns.
    # SQL aggregates data inside PostgreSQL.
    # No customer or transaction records are returned.
    rows = read_query(
        """
        SELECT
            DATE_TRUNC(
                %s,
                event_timestamp AT TIME ZONE 'Asia/Kuala_Lumpur'
            ) AS period_start,
            COUNT(*) AS record_count,
            ROUND(AVG(quality_score), 2) AS avg_quality,
            SUM(missing_value_count) AS missing_total,
            SUM(duplicate_count) AS duplicate_total,
            SUM(invalid_value_count) AS invalid_total,
            ROUND(AVG(processing_time_ms), 2)
                AS avg_processing_ms,
            ROUND(AVG(queue_wait_ms), 2)
                AS avg_queue_wait_ms
        FROM guardian_demo.historical_quality_fixture
        GROUP BY 1
        ORDER BY 1
        """,
        (granularity,),
    )

    return {
        "status": "success",
        "source": "postgresql",
        "dataset_type": "synthetic_demo",
        "schema": SCHEMA,
        "table": TABLE,
        "granularity": granularity,
        "timezone": "Asia/Kuala_Lumpur",
        "read_only": True,
        "ai_used": False,
        "raw_records_included": False,
        "period_count": len(rows),
        "periods": [
            {
                "period_start": period.isoformat(),
                "record_count": count,
                "avg_quality_score": (
                    float(quality)
                    if quality is not None else None
                ),
                "missing_total": missing,
                "duplicate_total": duplicates,
                "invalid_total": invalid,
                "avg_processing_ms": (
                    float(processing)
                    if processing is not None else None
                ),
                "avg_queue_wait_ms": (
                    float(queue)
                    if queue is not None else None
                ),
            }
            for (
                period,
                count,
                quality,
                missing,
                duplicates,
                invalid,
                processing,
                queue,
            ) in rows
        ],
    }
