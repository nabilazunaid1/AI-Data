
"""
AI Data Guardian 3.0
Controlled Customer Transformation Service

Responsibilities:
- Accept only masked extraction records
- Reject unexpected sensitive values
- Normalize approved region names
- Validate timestamp formatting
- Preserve missing values
- Return structured processing results

No source database changes.
No Ollama requests.
No file writes.

LOCAL PROTOTYPE ONLY.
"""

import json
from datetime import datetime

from app.etl.extract_service import extract_table


# =====================================================
# APPROVED OUTPUT SCHEMA
# =====================================================

COLUMNS = [
    "customer_id",
    "name",
    "email",
    "phone",
    "region",
    "updated_at"
]

MASKS = {
    "customer_id": "[MASKED_ID]",
    "name": "[MASKED_NAME]",
    "email": "[MASKED_EMAIL]",
    "phone": "[MASKED_PHONE]"
}

REGIONS = {
    "north": "North",
    "south": "South",
    "east": "East",
    "west": "West",
    "central": "Central"
}


# =====================================================
# VALIDATE MASKED INPUT
# =====================================================

def validate_masked_row(row):
    """
    Only approved columns and masked sensitive
    values are accepted.

    Reject raw values rather than attempting
    to guess whether they contain personal data.
    """

    if not isinstance(row, dict):
        raise ValueError(
            "Customer row must be a dictionary."
        )

    if set(row.keys()) != set(COLUMNS):
        raise ValueError(
            "Unexpected customer columns."
        )

    for column, mask in MASKS.items():

        value = row[column]

        # Missing fields remain missing.
        if value is None or value == "":
            continue

        if value != mask:
            raise ValueError(
                "Unmasked sensitive value detected "
                f"in column: {column}"
            )

    return True


# =====================================================
# NORMALIZE REGION
# =====================================================

def normalize_region(value):
    """
    Normalize known region labels.

    Unexpected values are replaced with
    a redaction marker rather than exposed.
    """

    if value is None:
        return None

    if not isinstance(value, str):
        return "[REDACTED_REGION]"

    normalized = " ".join(
        value.split()
    ).lower()

    if not normalized:
        return None

    return REGIONS.get(
        normalized,
        "[REDACTED_REGION]"
    )


# =====================================================
# VALIDATE TIMESTAMP
# =====================================================

def normalize_timestamp(value):
    """
    Ensure that timestamps are valid ISO strings.

    Preserve their existing timezone semantics.
    Do not assume a timezone for naive timestamps.
    """

    if value is None or value == "":
        return None

    if not isinstance(value, str):
        raise ValueError(
            "Timestamp must be an ISO string."
        )

    try:
        parsed = datetime.fromisoformat(value)

    except ValueError as error:
        raise ValueError(
            "Invalid timestamp format."
        ) from error

    return parsed.isoformat()


# =====================================================
# TRANSFORM ONE ROW
# =====================================================

def transform_customer_row(row):
    """
    Transform a single masked customer row.

    No missing emails or phones are invented.
    No raw PII is returned.
    """

    validate_masked_row(row)

    return {
        "customer_id": row["customer_id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "region": normalize_region(
            row["region"]
        ),
        "updated_at": normalize_timestamp(
            row["updated_at"]
        )
    }


# =====================================================
# TRANSFORM DATASET
# =====================================================

def transform_customers(extraction):
    """
    Process a masked customer extraction result.

    This function is independent of PostgreSQL.
    It accepts a result from extract_table().
    """

    if not isinstance(extraction, dict):
        raise ValueError(
            "Invalid extraction result."
        )

    if (
        extraction.get("status") != "success"
        or extraction.get("table") != "customers"
        or extraction.get("read_only") is not True
        or extraction.get("pii_masked") is not True
        or extraction.get("ai_used") is not False
    ):
        raise ValueError(
            "Extraction has not passed safety checks."
        )

    if extraction.get("columns") != COLUMNS:
        raise ValueError(
            "Unexpected extraction schema."
        )

    source_rows = extraction.get("rows")

    if not isinstance(source_rows, list):
        raise ValueError(
            "Extraction rows must be a list."
        )

    if (
        extraction.get("extracted_records")
        != len(source_rows)
    ):
        raise ValueError(
            "Extraction row count mismatch."
        )

    transformed_rows = []
    normalized_regions = 0
    redacted_regions = 0

    for source_row in source_rows:

        transformed = transform_customer_row(
            source_row
        )

        original_region = source_row["region"]
        transformed_region = transformed["region"]

        if original_region != transformed_region:
            normalized_regions += 1

        if (
            transformed_region
            == "[REDACTED_REGION]"
        ):
            redacted_regions += 1

        transformed_rows.append(
            transformed
        )

    return {
        "status": "success",
        "stage": "transform_and_mask",
        "table": "customers",
        "read_only": True,
        "pii_masked": True,
        "ai_used": False,
        "input_records": len(source_rows),
        "output_records": len(
            transformed_rows
        ),
        "normalized_regions": normalized_regions,
        "redacted_regions": redacted_regions,
        "columns": list(COLUMNS),
        "rows": transformed_rows,
        "message": (
            "Masked customer records transformed "
            "using approved formatting rules."
        ),
        "limitations": (
            "Only masked extraction records "
            "are accepted. No source records "
            "are corrected or modified."
        )
    }


# =====================================================
# LOCAL TESTS
# =====================================================

if __name__ == "__main__":

    print("CUSTOMER TRANSFORMATION TEST")
    print("=" * 50)

    extraction = extract_table(
        table_name="customers",
        limit=5
    )

    result = transform_customers(
        extraction
    )

    print(
        json.dumps(
            result,
            indent=2
        )
    )

    print()
    print("SAFETY TEST")
    print("=" * 50)

    unsafe_row = {
        "customer_id": "CUST001",
        "name": "[MASKED_NAME]",
        "email": "[MASKED_EMAIL]",
        "phone": "[MASKED_PHONE]",
        "region": "North",
        "updated_at": None
    }

    try:
        transform_customer_row(unsafe_row)

    except ValueError:
        print(
            "PASS: Unmasked customer ID rejected."
        )

    else:
        raise AssertionError(
            "Unsafe customer ID was accepted."
        )

    print(
        "Transformation safety test completed."
    )
