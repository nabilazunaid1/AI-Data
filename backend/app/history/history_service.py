
"""
AI Data Guardian 3.0
PostgreSQL Pipeline History Service

Purpose:
- Save approved pipeline execution metadata
- Use the restricted history writer account
- Never store customer records
- Never store raw PII
- Use parameterized SQL
- Confirm transaction completion

Current scope:
- Completed customer pipelines only
- One history record per save request
- No automatic persistence yet
- No Ollama calls

LOCAL DEVELOPMENT PROTOTYPE.
"""

import math
import uuid
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from dotenv import dotenv_values

from app.validation.customer_rules import (
    reader_database_config
)


# =====================================================
# CONFIGURATION
# =====================================================

EXPECTED_PIPELINE = "customer_quality_pipeline"
EXPECTED_TABLE = "customers"

MAX_SAMPLE_RECORDS = 100

# Resolve backend/.env from this file location.
BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BACKEND_DIR / ".env"


# =====================================================
# DATABASE CONNECTION
# =====================================================

def history_database_config():
    """
    Reuse the database connection location,
    but authenticate with the restricted
    history writer rather than guardian_reader.
    """

    env = dotenv_values(ENV_PATH)

    user = env.get("HISTORY_DB_USER")
    password = env.get("HISTORY_DB_PASSWORD")

    if (
        user != "guardian_history_writer"
        or not password
    ):
        raise ValueError(
            "History writer configuration is missing."
        )

    config = reader_database_config().copy()

    config["user"] = user
    config["password"] = password
    config["connect_timeout"] = 5

    return config


# =====================================================
# VALIDATION HELPERS
# =====================================================

def require_nonnegative_integer(value, field):
    if type(value) is not int or value < 0:
        raise ValueError(
            f"Invalid history field: {field}"
        )

    return value


def require_timestamp(value, field):
    if not isinstance(value, str):
        raise ValueError(
            f"Invalid timestamp: {field}"
        )

    try:
        parsed = datetime.fromisoformat(value)

    except ValueError as error:
        raise ValueError(
            f"Invalid timestamp: {field}"
        ) from error

    if (
        parsed.tzinfo is None
        or parsed.utcoffset() is None
    ):
        raise ValueError(
            f"Timezone required: {field}"
        )

    return parsed.astimezone(timezone.utc)


# =====================================================
# APPROVED HISTORY METADATA
# =====================================================

def prepare_history_record(pipeline_result):
    """
    Convert a pipeline result into a fixed,
    explicitly allowlisted metadata dictionary.

    Extracted rows, transformed rows and other
    unexpected fields are never persisted.
    """

    if not isinstance(pipeline_result, dict):
        raise ValueError(
            "Invalid pipeline result."
        )

    if (
        pipeline_result.get("status") != "completed"
        or pipeline_result.get("pipeline_name")
        != EXPECTED_PIPELINE
        or pipeline_result.get("table")
        != EXPECTED_TABLE
        or pipeline_result.get("source")
        != "postgresql"
        or pipeline_result.get("read_only") is not True
        or pipeline_result.get("pii_masked") is not True
        or pipeline_result.get("ai_used") is not False
        or pipeline_result.get("stage_count") != 3
    ):
        raise ValueError(
            "Pipeline result is not approved "
            "for history persistence."
        )

    stages = pipeline_result.get("stages")

    expected_stages = [
        "extract",
        "validate",
        "transform_and_mask"
    ]

    if (
        not isinstance(stages, list)
        or len(stages) != 3
    ):
        raise ValueError(
            "Invalid pipeline stages."
        )

    for index, stage in enumerate(stages):
        if (
            not isinstance(stage, dict)
            or stage.get("stage")
            != expected_stages[index]
            or stage.get("status") != "completed"
        ):
            raise ValueError(
                "Incomplete pipeline cannot be saved."
            )

    extraction = pipeline_result.get("extraction")
    validation = pipeline_result.get("validation")
    transformation = pipeline_result.get("transformation")
    output = pipeline_result.get("output")

    if not all(
        isinstance(section, dict)
        for section in (
            extraction,
            validation,
            transformation,
            output
        )
    ):
        raise ValueError(
            "Incomplete pipeline metadata."
        )

    if (
        extraction.get("scope") != "limited_sample"
        or validation.get("scope") != "full_table"
        or validation.get("table") != "customers"
        or validation.get("status") != "completed"
        or validation.get("ai_used") is not False
        or transformation.get("status") != "success"
        or output.get("type")
        != "masked_customer_sample"
    ):
        raise ValueError(
            "Unexpected pipeline result structure."
        )

    sample_records = require_nonnegative_integer(
        extraction.get("extracted_records"),
        "sample_records"
    )

    source_records = require_nonnegative_integer(
        validation.get("total_records"),
        "source_records"
    )

    output_records = require_nonnegative_integer(
        output.get("record_count"),
        "output_records"
    )

    transformed_records = require_nonnegative_integer(
        transformation.get("output_records"),
        "transformed_records"
    )

    if (
        sample_records > MAX_SAMPLE_RECORDS
        or sample_records != output_records
        or output_records != transformed_records
    ):
        raise ValueError(
            "Pipeline record counts do not match."
        )

    missing = require_nonnegative_integer(
        validation.get("missing"),
        "missing"
    )

    duplicates = require_nonnegative_integer(
        validation.get("duplicates"),
        "duplicates"
    )

    invalid = require_nonnegative_integer(
        validation.get("invalid"),
        "invalid"
    )

    total_issues = require_nonnegative_integer(
        validation.get("total_issues"),
        "total_issues"
    )

    if total_issues != (
        missing + duplicates + invalid
    ):
        raise ValueError(
            "Validation issue counts do not match."
        )

    quality_score = validation.get("quality_score")

    if (
        type(quality_score) not in (int, float)
        or not math.isfinite(quality_score)
        or not 0 <= quality_score <= 100
    ):
        raise ValueError(
            "Invalid quality score."
        )

    duration = pipeline_result.get("duration_ms")

    if (
        type(duration) not in (int, float)
        or not math.isfinite(duration)
        or duration < 0
    ):
        raise ValueError(
            "Invalid pipeline duration."
        )

    started_at = require_timestamp(
        pipeline_result.get("started_at"),
        "started_at"
    )

    completed_at = require_timestamp(
        pipeline_result.get("completed_at"),
        "completed_at"
    )

    if completed_at < started_at:
        raise ValueError(
            "Completion time precedes start time."
        )

    return {
        "run_id": str(uuid.uuid4()),
        "pipeline_name": EXPECTED_PIPELINE,
        "source_type": "postgresql",
        "table_name": EXPECTED_TABLE,
        "status": "completed",
        "started_at": started_at,
        "completed_at": completed_at,
        "duration_ms": float(duration),
        "sample_records": sample_records,
        "source_records": source_records,
        "output_records": output_records,
        "quality_score": quality_score,
        "missing_count": missing,
        "duplicate_count": duplicates,
        "invalid_count": invalid,
        "total_issues": total_issues,
        "pii_masked": True,
        "ai_used": False
    }


# =====================================================
# SAVE HISTORY TO POSTGRESQL
# =====================================================

def save_pipeline_history(pipeline_result):
    """
    Save one completed pipeline execution.

    Only approved metadata is inserted.

    A successful return means that the
    database transaction has committed.
    """

    record = prepare_history_record(
        pipeline_result
    )

    query = """
        INSERT INTO public.pipeline_runs (
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
            ai_used
        )
        VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s
        )
    """

    values = (
        record["run_id"],
        record["pipeline_name"],
        record["source_type"],
        record["table_name"],
        record["status"],
        record["started_at"],
        record["completed_at"],
        record["duration_ms"],
        record["sample_records"],
        record["source_records"],
        record["output_records"],
        record["quality_score"],
        record["missing_count"],
        record["duplicate_count"],
        record["invalid_count"],
        record["total_issues"],
        record["pii_masked"],
        record["ai_used"]
    )

    with psycopg.connect(
        **history_database_config()
    ) as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                "SET LOCAL statement_timeout = '5000ms'"
            )

            cursor.execute(
                query,
                values
            )

            if cursor.rowcount != 1:
                raise RuntimeError(
                    "History insert was not confirmed."
                )

        # Successful context exit commits the
        # transaction. Exceptions roll it back.

    return {
        "status": "saved",
        "run_id": record["run_id"],
        "pipeline_name": record["pipeline_name"],
        "table": record["table_name"],
        "records_processed": record["source_records"],
        "pii_stored": False,
        "message": (
            "Pipeline execution metadata "
            "committed successfully."
        )
    }


# =====================================================
# LOCAL TEST
# =====================================================

if __name__ == "__main__":

    from app.etl.pipeline_service import (
        run_pipeline
    )

    print("PIPELINE HISTORY SERVICE TEST")
    print("=" * 50)

    pipeline_result = run_pipeline(
        table_name="customers",
        limit=5
    )

    history_result = save_pipeline_history(
        pipeline_result
    )

    print(
        "History status:",
        history_result["status"]
    )

    print(
        "Run ID:",
        history_result["run_id"]
    )

    print(
        "Source records:",
        history_result["records_processed"]
    )

    print(
        "PII stored:",
        history_result["pii_stored"]
    )

    assert history_result["status"] == "saved"
    assert history_result["pii_stored"] is False

    print()
    print("PASS: Pipeline completed.")
    print("PASS: History INSERT committed.")
    print("PASS: Only approved metadata submitted.")
    print("PASS: No customer rows submitted.")
