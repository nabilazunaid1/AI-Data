"""
AI Data Guardian 3.0
Historical Pipeline Persistence Writer.

Writes aggregated execution metadata and statistical findings.
Never writes to the historical source database.
"""

import json
import math
import uuid

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import psycopg

from app.history.history_service import history_database_config

def _parse_timestamp(value, field):
    if not isinstance(value, str):
        raise ValueError(f"Invalid {field}.")

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))

    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a timezone.")

    return parsed.astimezone(timezone.utc)

def _finite_number(value, field):
    if isinstance(value, bool):
        raise ValueError(f"Invalid {field}.")

    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        raise ValueError(f"Invalid {field}.") from None

    if not math.isfinite(result):
        raise ValueError(f"Invalid {field}.")

    return result



def _parse_period_timestamp(value):
    """
    Historical aggregation timestamps represent
    Asia/Kuala_Lumpur calendar periods.

    Naive timestamps are interpreted as Malaysia local
    time. Explicitly timezone-aware timestamps retain
    their supplied timezone.

    All results are converted to UTC for PostgreSQL.
    """

    if not isinstance(value, str):
        raise ValueError("Invalid period_start.")

    try:
        parsed = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )
    except ValueError:
        raise ValueError("Invalid period_start.") from None

    if parsed.tzinfo is None:
        parsed = parsed.replace(
            tzinfo=ZoneInfo("Asia/Kuala_Lumpur")
        )

    return parsed.astimezone(timezone.utc)


def save_historical_pipeline_history(payload):
    """
    Persist one historical execution and all its findings
    in a single PostgreSQL transaction.
    """

    if not isinstance(payload, dict):
        raise ValueError("Invalid historical execution payload.")

    if payload.get("connection_id") != "historical_source":
        raise ValueError("Unapproved historical connection.")

    if payload.get("dataset_type") != "synthetic_demo":
        raise ValueError("Unapproved historical dataset.")

    if payload.get("granularity") != "month":
        raise ValueError("Unapproved historical granularity.")

    if payload.get("read_only") is not True:
        raise ValueError("Historical source must be read-only.")

    if payload.get("raw_records_included") is not False:
        raise ValueError("Raw records are not permitted.")

    if payload.get("ai_used") is not False:
        raise ValueError("AI inference is not permitted.")

    findings = payload.get("findings")

    if not isinstance(findings, list):
        raise ValueError("Invalid historical findings.")

    if payload.get("finding_count") != len(findings):
        raise ValueError("Historical finding count mismatch.")

    period_count = payload.get("period_count")

    if (
        isinstance(period_count, bool)
        or not isinstance(period_count, int)
        or period_count < 0
    ):
        raise ValueError("Invalid historical period count.")

    started_at = _parse_timestamp(
        payload.get("started_at"), "started_at"
    )

    completed_at = _parse_timestamp(
        payload.get("completed_at"), "completed_at"
    )

    if completed_at < started_at:
        raise ValueError("Invalid execution time range.")

    duration_ms = _finite_number(
        payload.get("duration_ms"), "duration_ms"
    )

    if duration_ms < 0:
        raise ValueError("Invalid execution duration.")

    assessment = payload.get("assessment")

    if not isinstance(assessment, str) or not assessment.strip():
        raise ValueError("Invalid historical assessment.")

    timezone_name = payload.get("timezone")

    if timezone_name != "Asia/Kuala_Lumpur":
        raise ValueError("Unexpected historical timezone.")

    run_id = uuid.uuid4()

    finding_records = []

    for finding in findings:
        if not isinstance(finding, dict):
            raise ValueError("Invalid finding record.")

        metric = finding.get("metric")
        period_start = finding.get("period_start")

        if not isinstance(metric, str) or not metric.strip():
            raise ValueError("Invalid finding metric.")

        if len(metric) > 100:
            raise ValueError("Finding metric exceeds allowed length.")

        finding_records.append((
            uuid.uuid4(),
            run_id,
            metric,
            _parse_period_timestamp(period_start),
            _finite_number(finding.get("actual"), "actual"),
            _finite_number(
                finding.get("baseline_median"),
                "baseline_median"
            ),
            _finite_number(
                finding.get("modified_z_score"),
                "modified_z_score"
            ),
            json.dumps({
                "method": finding.get("method")
            }, allow_nan=False)
        ))

    config = history_database_config()

    with psycopg.connect(**config) as connection:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                INSERT INTO public.historical_pipeline_runs (
                    run_id,
                    connection_id,
                    dataset_type,
                    granularity,
                    timezone,
                    status,
                    assessment,
                    started_at,
                    completed_at,
                    duration_ms,
                    period_count,
                    finding_count,
                    read_only,
                    raw_records_included,
                    ai_used
                )
                VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s
                )
                """,
                (
                    run_id,
                    "historical_source",
                    "synthetic_demo",
                    "month",
                    timezone_name,
                    "completed",
                    assessment,
                    started_at,
                    completed_at,
                    duration_ms,
                    period_count,
                    len(finding_records),
                    True,
                    False,
                    False,
                )
            )

            if finding_records:
                cursor.executemany(
                    """
                    INSERT INTO public.historical_pipeline_findings (
                        finding_id,
                        run_id,
                        metric,
                        period_start,
                        actual,
                        baseline_median,
                        modified_z_score,
                        evidence
                    )
                    VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s, %s::jsonb
                    )
                    """,
                    finding_records
                )

    return {
        "history_persisted": True,
        "run_id": str(run_id),
        "records_saved": 1,
        "findings_saved": len(finding_records),
    }
