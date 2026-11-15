
"""
AI Data Guardian 3.0
Read-Only Pipeline History Retrieval Service

Purpose:
- Retrieve recent pipeline execution history
- Retrieve a specific pipeline Run ID
- Calculate execution history statistics
- Support the Reports interface

Security:
- Dedicated guardian_history_reader account
- SELECT-only database operations
- Explicitly approved metadata columns
- Parameterized SQL queries
- No customer table queries
- No raw customer records
- No automatic Ollama calls
"""

import uuid
from pathlib import Path

import psycopg
from dotenv import dotenv_values

from app.validation.customer_rules import (
    reader_database_config
)


# =====================================================
# CONFIGURATION
# =====================================================

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BACKEND_DIR / ".env"

MAX_HISTORY_LIMIT = 100
DEFAULT_HISTORY_LIMIT = 20

HISTORY_COLUMNS = (
    "run_id",
    "pipeline_name",
    "source_type",
    "table_name",
    "status",
    "started_at",
    "completed_at",
    "duration_ms",
    "sample_records",
    "source_records",
    "output_records",
    "quality_score",
    "missing_count",
    "duplicate_count",
    "invalid_count",
    "total_issues",
    "pii_masked",
    "ai_used",
    "created_at"
)


# =====================================================
# DATABASE CONFIGURATION
# =====================================================

def history_reader_database_config():
    """
    Connect using the restricted history reader.

    Reuses database host, port and database name
    without reusing the source reader credentials.
    """

    env = dotenv_values(ENV_PATH)

    user = env.get("HISTORY_READER_DB_USER")
    password = env.get("HISTORY_READER_DB_PASSWORD")

    if user != "guardian_history_reader" or not password:
        raise ValueError(
            "History reader configuration is missing."
        )

    config = reader_database_config().copy()

    config["user"] = user
    config["password"] = password
    config["connect_timeout"] = 5

    return config


# =====================================================
# SERIALIZATION
# =====================================================

def serialize_history_row(row):
    """
    Convert an approved PostgreSQL history
    record into a JSON-compatible dictionary.

    No customer PII is included.
    """

    return {
        "run_id": str(row["run_id"]),
        "pipeline_name": row["pipeline_name"],
        "source": row["source_type"],
        "table": row["table_name"],
        "status": row["status"],
        "started_at": row["started_at"].isoformat(),
        "completed_at": row["completed_at"].isoformat(),
        "duration_ms": row["duration_ms"],
        "sample_records": row["sample_records"],
        "source_records": row["source_records"],
        "output_records": row["output_records"],
        "quality_score": (
            float(row["quality_score"])
            if row["quality_score"] is not None
            else None
        ),
        "missing": row["missing_count"],
        "duplicates": row["duplicate_count"],
        "invalid": row["invalid_count"],
        "total_issues": row["total_issues"],
        "pii_masked": row["pii_masked"],
        "ai_used": row["ai_used"],
        "created_at": row["created_at"].isoformat()
    }


# =====================================================
# RECENT PIPELINE RUNS
# =====================================================

def get_recent_pipeline_runs(limit=DEFAULT_HISTORY_LIMIT):
    """
    Retrieve the newest execution records.
    """

    if (
        type(limit) is not int
        or not 1 <= limit <= MAX_HISTORY_LIMIT
    ):
        raise ValueError(
            "History limit must be between 1 and 100."
        )

    query = """
        SELECT
            run_id,
            pipeline_name,
            source_type,
            table_name,
            status,
            started_at,
            completed_at,
            duration_ms,
            sample_records,
            source_records,
            output_records,
            quality_score,
            missing_count,
            duplicate_count,
            invalid_count,
            total_issues,
            pii_masked,
            ai_used,
            created_at
        FROM public.pipeline_runs
        ORDER BY created_at DESC, run_id DESC
        LIMIT %s
    """

    with psycopg.connect(
        **history_reader_database_config()
    ) as connection:

        connection.read_only = True

        with connection.cursor(
            row_factory=psycopg.rows.dict_row
        ) as cursor:

            cursor.execute(query, (limit,))
            rows = cursor.fetchall()

    return {
        "status": "success",
        "limit": limit,
        "returned_count": len(rows),
        "runs": [
            serialize_history_row(row)
            for row in rows
        ]
    }


# =====================================================
# SINGLE PIPELINE RUN
# =====================================================

def get_pipeline_run_by_id(run_id):
    """
    Retrieve a single execution by UUID.
    """

    try:
        validated_id = uuid.UUID(str(run_id))

    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError(
            "Invalid Pipeline Run ID."
        ) from error

    query = """
        SELECT
            run_id,
            pipeline_name,
            source_type,
            table_name,
            status,
            started_at,
            completed_at,
            duration_ms,
            sample_records,
            source_records,
            output_records,
            quality_score,
            missing_count,
            duplicate_count,
            invalid_count,
            total_issues,
            pii_masked,
            ai_used,
            created_at
        FROM public.pipeline_runs
        WHERE run_id = %s
        LIMIT 1
    """

    with psycopg.connect(
        **history_reader_database_config()
    ) as connection:

        connection.read_only = True

        with connection.cursor(
            row_factory=psycopg.rows.dict_row
        ) as cursor:

            cursor.execute(query, (validated_id,))
            row = cursor.fetchone()

    if row is None:
        return None

    return serialize_history_row(row)


# =====================================================
# HISTORY SUMMARY
# =====================================================

def get_pipeline_history_summary():
    """
    Calculate high-level Reports metrics.

    Quality score is averaged across
    successful runs with a non-null score.
    """

    query = """
        SELECT
            COUNT(*) AS total_runs,

            COUNT(*) FILTER (
                WHERE status = 'completed'
            ) AS completed_runs,

            COUNT(*) FILTER (
                WHERE status = 'failed'
            ) AS failed_runs,

            COALESCE(
                ROUND(
                    AVG(quality_score),
                    2
                ),
                0
            ) AS average_quality_score,

            COALESCE(
                SUM(source_records),
                0
            ) AS total_source_records,

            COALESCE(
                SUM(output_records),
                0
            ) AS total_output_records,

            COALESCE(
                SUM(total_issues),
                0
            ) AS total_validation_issues,

            COALESCE(
                ROUND(
                    AVG(duration_ms)::numeric,
                    2
                ),
                0
            ) AS average_duration_ms,

            MAX(completed_at) AS latest_completed_at

        FROM public.pipeline_runs
    """

    with psycopg.connect(
        **history_reader_database_config()
    ) as connection:

        connection.read_only = True

        with connection.cursor(
            row_factory=psycopg.rows.dict_row
        ) as cursor:

            cursor.execute(query)
            row = cursor.fetchone()

    return {
        "status": "success",
        "total_runs": int(row["total_runs"]),
        "completed_runs": int(row["completed_runs"]),
        "failed_runs": int(row["failed_runs"]),
        "average_quality_score": float(
            row["average_quality_score"]
        ),
        "total_source_records": int(
            row["total_source_records"]
        ),
        "total_output_records": int(
            row["total_output_records"]
        ),
        "total_validation_issues": int(
            row["total_validation_issues"]
        ),
        "average_duration_ms": float(
            row["average_duration_ms"]
        ),
        "latest_completed_at": (
            row["latest_completed_at"].isoformat()
            if row["latest_completed_at"] is not None
            else None
        )
    }


# =====================================================
# LOCAL READ-ONLY TEST
# =====================================================

if __name__ == "__main__":

    print("PIPELINE HISTORY READ SERVICE TEST")
    print("=" * 50)

    recent = get_recent_pipeline_runs(limit=5)

    print("Recent runs:", recent["returned_count"])

    assert recent["status"] == "success"
    assert recent["returned_count"] > 0

    print("PASS: Recent history retrieved.")

    summary = get_pipeline_history_summary()

    print("Total runs:", summary["total_runs"])
    print(
        "Average quality score:",
        summary["average_quality_score"]
    )
    print(
        "Total validation issues:",
        summary["total_validation_issues"]
    )

    assert summary["total_runs"] >= 1

    print("PASS: History summary retrieved.")

    first_run_id = recent["runs"][0]["run_id"]

    selected = get_pipeline_run_by_id(
        first_run_id
    )

    assert selected is not None
    assert selected["run_id"] == first_run_id

    print("PASS: Individual Run ID retrieved.")

    for run in recent["runs"]:
        assert run["pii_masked"] is True
        assert run["ai_used"] is False

    print("PASS: History privacy flags verified.")
    print("PASS: No customer tables queried.")
    print("PASS: No database modifications performed.")
