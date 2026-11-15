
"""
AI Data Guardian 3.0
Masked CSV Export Service

Converts approved masked customer records into
CSV content without accessing PostgreSQL.

Security:
- Approved schema only
- Masked sensitive values only
- CSV formula injection protection
- Row count limit
- No source database modification
- No file written to disk
- No AI inference

LOCAL DEVELOPMENT PROTOTYPE.
"""

import csv
import io

from app.etl.transform_service import (
    COLUMNS,
    MASKS,
    REGIONS
)


MAX_EXPORT_ROWS = 100

DANGEROUS_PREFIXES = (
    "=",
    "+",
    "-",
    "@"
)

ALLOWED_REGIONS = set(
    REGIONS.values()
) | {
    "[REDACTED_REGION]",
    None
}


def sanitize_csv_cell(value):
    """
    Prevent spreadsheet applications from
    interpreting values as formulas.

    Reject control characters and escape
    potentially executable cell prefixes.
    """

    if value is None:
        return ""

    if not isinstance(value, str):
        raise ValueError(
            "CSV values must be strings or null."
        )

    if any(
        ord(character) < 32
        and character not in ("\t", "\n", "\r")
        for character in value
    ):
        raise ValueError(
            "Unexpected control character."
        )

    # Remove leading and trailing whitespace
    # from approved non-sensitive output values.
    cleaned = value.strip()

    if cleaned.startswith(
        DANGEROUS_PREFIXES
    ) or cleaned.startswith(
        ("\t", "\r", "\n")
    ):
        return "'" + cleaned

    return cleaned


def verify_csv_rows(rows):
    """
    Accept only the approved customer schema.

    All sensitive fields must contain the
    expected placeholders or missing values.
    """

    if not isinstance(rows, list):
        raise ValueError(
            "Export input must be a list."
        )

    if len(rows) > MAX_EXPORT_ROWS:
        raise ValueError(
            "CSV export row limit exceeded."
        )

    for row in rows:

        if not isinstance(row, dict):
            raise ValueError(
                "Invalid CSV row."
            )

        if set(row.keys()) != set(COLUMNS):
            raise ValueError(
                "Unexpected CSV columns."
            )

        for column, placeholder in MASKS.items():

            value = row[column]

            if value not in (
                placeholder,
                None,
                ""
            ):
                raise ValueError(
                    "Unmasked sensitive value "
                    f"detected in {column}."
                )

        if row["region"] not in ALLOWED_REGIONS:
            raise ValueError(
                "Unexpected region value."
            )

        timestamp = row["updated_at"]

        if (
            timestamp is not None
            and not isinstance(timestamp, str)
        ):
            raise ValueError(
                "Invalid timestamp value."
            )

    return True


def generate_masked_csv(rows):
    """
    Return an in-memory CSV string.

    This function does not write files
    or perform database queries.
    """

    verify_csv_rows(rows)

    output = io.StringIO(
        newline=""
    )

    writer = csv.DictWriter(
        output,
        fieldnames=COLUMNS,
        extrasaction="raise",
        lineterminator="\r\n"
    )

    writer.writeheader()

    for row in rows:

        cleaned_row = {
            column: sanitize_csv_cell(
                row[column]
            )
            for column in COLUMNS
        }

        writer.writerow(
            cleaned_row
        )

    return output.getvalue()


if __name__ == "__main__":

    from app.etl.pipeline_service import (
        run_pipeline
    )

    print(
        "MASKED CSV EXPORT TEST"
    )
    print("=" * 45)

    result = run_pipeline(
        table_name="customers",
        limit=5
    )

    rows = result["output"]["rows"]

    csv_content = generate_masked_csv(
        rows
    )

    print(csv_content)

    assert "[MASKED_ID]" in csv_content

    assert "[MASKED_EMAIL]" in csv_content

    assert (
        len(csv_content.splitlines())
        == len(rows) + 1
    )

    print(
        "PASS: Masked CSV generated in memory."
    )

    # Verify raw PII rejection.
    unsafe_row = dict(rows[0])

    unsafe_row["email"] = (
        "customer@example.com"
    )

    try:
        generate_masked_csv(
            [unsafe_row]
        )

    except ValueError:
        print(
            "PASS: Raw email rejected."
        )

    else:
        raise AssertionError(
            "Unsafe CSV export was accepted."
        )

    # Verify spreadsheet formula protection.
    assert (
        sanitize_csv_cell("=1+1")
        == "'=1+1"
    )

    print(
        "PASS: Spreadsheet formula protected."
    )
