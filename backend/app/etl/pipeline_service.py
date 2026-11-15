
"""
AI Data Guardian 3.0
Three-Stage ETL Pipeline Service

Stages:
1. Extract approved PostgreSQL records
2. Validate full-table data quality
3. Transform and verify masked output

Properties:
- Read-only PostgreSQL access
- Existing deterministic validation rules
- Approved masked customer output
- No AI inference
- No source database modifications
- No output files written yet

IMPORTANT:
Extraction is a limited sample.
Validation checks the entire customers table.
Separate reads are not snapshot-consistent.

LOCAL DEVELOPMENT PROTOTYPE.
"""

import json
import time

from datetime import datetime, timezone

from app.etl.extract_service import (
    extract_table,
    validate_extraction_request
)

from app.etl.transform_service import (
    transform_customers,
    COLUMNS,
    MASKS,
    REGIONS
)

from app.validation.customer_rules import (
    validate_customers
)


# =====================================================
# CONFIGURATION
# =====================================================

PIPELINE_NAME = "customer_quality_pipeline"

PIPELINE_VERSION = "1.1"

SUPPORTED_TABLES = {
    "customers"
}


# =====================================================
# HELPERS
# =====================================================

def current_timestamp():
    return datetime.now(
        timezone.utc
    ).isoformat()


def duration_ms(start_time):
    return round(
        (time.perf_counter() - start_time) * 1000,
        2
    )


def make_stage(
    name,
    status,
    duration,
    message,
    records=None
):
    result = {
        "stage": name,
        "status": status,
        "duration_ms": duration,
        "message": message
    }

    if records is not None:
        result["records"] = records

    return result


# =====================================================
# REQUEST VALIDATION
# =====================================================

def validate_pipeline_request(
    table_name,
    limit
):
    if table_name not in SUPPORTED_TABLES:
        raise ValueError(
            "Pipeline currently supports "
            "the customers table only."
        )

    return validate_extraction_request(
        table_name,
        limit
    )


# =====================================================
# VERIFY FULL-TABLE VALIDATION
# =====================================================

def verify_validation_result(result):
    if not isinstance(result, dict):
        raise ValueError(
            "Invalid validation result."
        )

    if (
        result.get("table") != "customers"
        or result.get("status") not in (
            "completed",
            "no_data"
        )
        or result.get("ai_used") is not False
    ):
        raise ValueError(
            "Unexpected validation response."
        )

    metric_names = (
        "total_records",
        "missing",
        "duplicates",
        "invalid",
        "total_issues"
    )

    for name in metric_names:
        value = result.get(name)

        if type(value) is not int or value < 0:
            raise ValueError(
                f"Invalid validation metric: {name}"
            )

    if result["total_issues"] != (
        result["missing"]
        + result["duplicates"]
        + result["invalid"]
    ):
        raise ValueError(
            "Validation issue totals do not match."
        )

    if result["status"] == "completed":
        score = result.get("quality_score")

        if (
            type(score) not in (int, float)
            or not 0 <= score <= 100
            or result["total_records"] == 0
        ):
            raise ValueError(
                "Invalid full-table quality score."
            )

    else:
        if (
            result["total_records"] != 0
            or result["quality_score"] is not None
            or result["total_issues"] != 0
        ):
            raise ValueError(
                "Invalid empty-table validation."
            )

    return {
        "status": result["status"],
        "table": "customers",
        "scope": "full_table",
        "total_records": result["total_records"],
        "quality_score": result["quality_score"],
        "missing": result["missing"],
        "duplicates": result["duplicates"],
        "invalid": result["invalid"],
        "total_issues": result["total_issues"],
        "validation_method": "deterministic_sql",
        "ai_used": False
    }


# =====================================================
# VERIFY TRANSFORMED OUTPUT
# =====================================================

def verify_transformed_output(
    extraction,
    transformation
):
    """
    Confirm that transformation has not
    introduced unmasked sensitive values.

    Fail closed if any field violates
    the approved output schema.
    """

    if (
        transformation.get("status") != "success"
        or transformation.get("stage")
        != "transform_and_mask"
        or transformation.get("table") != "customers"
        or transformation.get("read_only") is not True
        or transformation.get("pii_masked") is not True
        or transformation.get("ai_used") is not False
    ):
        raise ValueError(
            "Unexpected transformation response."
        )

    rows = transformation.get("rows")

    if not isinstance(rows, list):
        raise ValueError(
            "Invalid transformed records."
        )

    if (
        transformation.get("columns") != COLUMNS
        or transformation.get("input_records")
        != extraction["extracted_records"]
        or transformation.get("output_records")
        != len(rows)
        or len(rows) != extraction["extracted_records"]
    ):
        raise ValueError(
            "Transformed row counts or schema "
            "do not match extraction."
        )

    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(
                "Invalid transformed row."
            )

        if set(row.keys()) != set(COLUMNS):
            raise ValueError(
                "Unexpected output columns."
            )

        for field, mask in MASKS.items():
            if row[field] not in (
                mask,
                None,
                ""
            ):
                raise ValueError(
                    "Sensitive value detected "
                    "in transformed output."
                )

        allowed_regions = {
            *REGIONS.values(),
            "[REDACTED_REGION]",
            None
        }

        if row["region"] not in allowed_regions:
            raise ValueError(
                "Unexpected region in output."
            )

        timestamp = row["updated_at"]

        if (
            timestamp is not None
            and not isinstance(timestamp, str)
        ):
            raise ValueError(
                "Invalid output timestamp."
            )

    return rows


# =====================================================
# MAIN PIPELINE
# =====================================================

def run_pipeline(
    table_name="customers",
    limit=20
):
    """
    Execute all three pipeline stages on demand.

    Source records are never updated.

    The returned output contains transformed
    masked sample rows and full-table
    validation metrics.
    """

    table_name, limit = (
        validate_pipeline_request(
            table_name,
            limit
        )
    )

    pipeline_started = time.perf_counter()
    started_at = current_timestamp()

    stages = []

    # =================================================
    # STAGE 1 — EXTRACT
    # =================================================

    extract_started = time.perf_counter()

    extraction = extract_table(
        table_name=table_name,
        limit=limit
    )

    if (
        extraction.get("status") != "success"
        or extraction.get("table") != table_name
        or extraction.get("read_only") is not True
        or extraction.get("pii_masked") is not True
        or extraction.get("ai_used") is not False
    ):
        raise ValueError(
            "Extraction safety check failed."
        )

    extracted_rows = extraction.get("rows")

    if (
        not isinstance(extracted_rows, list)
        or extraction.get("columns") != COLUMNS
        or extraction.get("extracted_records")
        != len(extracted_rows)
    ):
        raise ValueError(
            "Extraction schema or row count mismatch."
        )

    stages.append(
        make_stage(
            name="extract",
            status="completed",
            duration=duration_ms(
                extract_started
            ),
            message=(
                "Approved PostgreSQL sample "
                "extracted and masked."
            ),
            records=len(extracted_rows)
        )
    )

    # =================================================
    # STAGE 2 — VALIDATE
    # =================================================

    validation_started = time.perf_counter()

    validation = verify_validation_result(
        validate_customers()
    )

    stages.append(
        make_stage(
            name="validate",
            status="completed",
            duration=duration_ms(
                validation_started
            ),
            message=(
                "Full source table validated "
                "using deterministic SQL."
            ),
            records=validation["total_records"]
        )
    )

    # =================================================
    # STAGE 3 — TRANSFORM AND MASK
    # =================================================

    transform_started = time.perf_counter()

    transformation = transform_customers(
        extraction
    )

    output_rows = verify_transformed_output(
        extraction,
        transformation
    )

    stages.append(
        make_stage(
            name="transform_and_mask",
            status="completed",
            duration=duration_ms(
                transform_started
            ),
            message=(
                "Masked records verified and "
                "approved fields normalized."
            ),
            records=len(output_rows)
        )
    )

    # =================================================
    # FINAL RESULT
    # =================================================

    return {
        "status": "completed",
        "pipeline_name": PIPELINE_NAME,
        "pipeline_version": PIPELINE_VERSION,
        "table": table_name,
        "source": "postgresql",
        "started_at": started_at,
        "completed_at": current_timestamp(),
        "duration_ms": duration_ms(
            pipeline_started
        ),
        "read_only": True,
        "pii_masked": True,
        "ai_used": False,
        "stage_count": len(stages),
        "stages": stages,
        "extraction": {
            "scope": "limited_sample",
            "limit": limit,
            "extracted_records": len(
                extracted_rows
            ),
            "columns": list(COLUMNS)
        },
        "validation": validation,
        "transformation": {
            "status": "success",
            "input_records": transformation[
                "input_records"
            ],
            "output_records": transformation[
                "output_records"
            ],
            "normalized_regions": transformation[
                "normalized_regions"
            ],
            "redacted_regions": transformation[
                "redacted_regions"
            ]
        },
        "output": {
            "type": "masked_customer_sample",
            "format": "json",
            "file_generated": False,
            "columns": list(COLUMNS),
            "record_count": len(output_rows),
            "rows": output_rows
        },
        "limitations": (
            "The output is a limited masked sample. "
            "Validation metrics describe the full "
            "customers table. The operations use "
            "separate database reads and are not "
            "snapshot-consistent. No output file "
            "has been generated yet."
        )
    }


# =====================================================
# LOCAL TEST
# =====================================================

if __name__ == "__main__":
    print(
        "AI DATA GUARDIAN "
        "THREE-STAGE PIPELINE TEST"
    )
    print("=" * 50)

    result = run_pipeline(
        table_name="customers",
        limit=5
    )

    print(
        json.dumps(
            result,
            indent=2
        )
    )

    assert result["status"] == "completed"
    assert result["stage_count"] == 3
    assert result["read_only"] is True
    assert result["pii_masked"] is True
    assert result["ai_used"] is False

    assert all(
        stage["status"] == "completed"
        for stage in result["stages"]
    )

    assert (
        result["output"]["record_count"]
        == result["extraction"]["extracted_records"]
    )

    print()
    print("PASS: All three stages completed.")
    print("PASS: Output records verified.")
    print("PASS: Read-only execution.")
    print("PASS: No Ollama calls.")
