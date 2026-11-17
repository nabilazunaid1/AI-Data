"""
AI Data Guardian 3.0
Read-only Historical Pipeline History Reader.

Uses guardian_history_reader.
SELECT operations only.
"""

import uuid

import psycopg

from psycopg.rows import dict_row

from app.history.history_read_service import (
    history_reader_database_config,
)

def _connect():
    config = history_reader_database_config()
    config["row_factory"] = dict_row
    return psycopg.connect(**config)

def _serialize_run(row):
    return {
        "run_id": str(row["run_id"]),
        "connection_id": row["connection_id"],
        "dataset_type": row["dataset_type"],
        "granularity": row["granularity"],
        "timezone": row["timezone"],
        "status": row["status"],
        "assessment": row["assessment"],
        "started_at": row["started_at"].isoformat(),
        "completed_at": row["completed_at"].isoformat(),
        "duration_ms": row["duration_ms"],
        "period_count": row["period_count"],
        "finding_count": row["finding_count"],
        "read_only": row["read_only"],
        "raw_records_included": row["raw_records_included"],
        "ai_used": row["ai_used"],
        "created_at": row["created_at"].isoformat(),
    }

def _serialize_finding(row):
    return {
        "finding_id": str(row["finding_id"]),
        "metric": row["metric"],
        "period_start": row["period_start"].isoformat(),
        "actual": row["actual"],
        "baseline_median": row["baseline_median"],
        "modified_z_score": row["modified_z_score"],
        "evidence": row["evidence"],
    }

def get_historical_pipeline_runs(limit=20):
    if (
        isinstance(limit, bool)
        or not isinstance(limit, int)
        or not 1 <= limit <= 100
    ):
        raise ValueError("Invalid history limit.")

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT *
                FROM public.historical_pipeline_runs
                ORDER BY started_at DESC, run_id DESC
                LIMIT %s
                """,
                (limit,)
            )

            rows = cursor.fetchall()

    return {
        "status": "success",
        "returned_count": len(rows),
        "runs": [_serialize_run(row) for row in rows],
        "read_only": True,
        "raw_records_included": False,
    }

def get_historical_pipeline_run(run_id):
    try:
        validated_id = uuid.UUID(str(run_id))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Invalid historical run ID.") from None

    with _connect() as connection:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT *
                FROM public.historical_pipeline_runs
                WHERE run_id = %s
                """,
                (validated_id,)
            )

            run = cursor.fetchone()

            if run is None:
                return None

            cursor.execute(
                """
                SELECT
                    finding_id,
                    metric,
                    period_start,
                    actual,
                    baseline_median,
                    modified_z_score,
                    evidence
                FROM public.historical_pipeline_findings
                WHERE run_id = %s
                ORDER BY period_start, metric
                """,
                (validated_id,)
            )

            findings = cursor.fetchall()

    result = _serialize_run(run)

    result["findings"] = [
        _serialize_finding(row)
        for row in findings
    ]

    result["read_only"] = True
    result["raw_records_included"] = False

    return result

