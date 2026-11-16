"""
AI Data Guardian 3.0
Privacy-safe source-to-target reconciliation.

Pure comparison engine:
- No database connections
- No SQL execution
- No AI inference
- No database writes

Input rows are expected to be independently
sampled and authorized by a separate data
access component.
"""

import hashlib
import hmac
import json
import math
import re
import secrets
from collections import Counter


MAX_SAMPLE_ROWS = 500
IDENTIFIER_PATTERN = re.compile(
    r"^[A-Za-z_][A-Za-z0-9_]*$"
)


def validate_columns(columns, label):
    if (
        not isinstance(columns, (list, tuple))
        or not columns
    ):
        raise ValueError(
            f"{label} must be a non-empty list."
        )

    if len(columns) > 50:
        raise ValueError("Too many comparison columns.")

    if len(set(columns)) != len(columns):
        raise ValueError("Duplicate comparison column.")

    for column in columns:
        if (
            not isinstance(column, str)
            or not IDENTIFIER_PATTERN.fullmatch(column)
        ):
            raise ValueError(
                "Invalid comparison column identifier."
            )

    return list(columns)


def encode_value(value):
    """
    Preserve basic value types to prevent accidental
    equality between different data types.
    """

    if value is None:
        return ["null", None]

    if type(value) is bool:
        return ["boolean", value]

    if type(value) is int:
        return ["integer", value]

    if type(value) is float:
        if not math.isfinite(value):
            raise ValueError("Non-finite values unsupported.")

        return ["float", value]

    if type(value) is str:
        return ["string", value]

    raise ValueError(
        "Unsupported sampled field value type."
    )


def encode_key(row, key_columns):
    values = [
        encode_value(row[column])
        for column in key_columns
    ]

    return json.dumps(
        values,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def masked_reference(key, secret):
    digest = hmac.new(
        secret,
        key.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return "row_" + digest[:24]


def reconcile_samples(
    source_rows,
    target_rows,
    key_columns,
    compare_columns,
):
    """
    Reconcile two bounded samples.

    Results never include raw row values or keys.
    Duplicate keys are reported but not paired
    for field-level comparisons.

    Returned counts apply only to the supplied
    samples, not the full database populations.
    """

    keys = validate_columns(
        key_columns,
        "key_columns",
    )

    fields = validate_columns(
        compare_columns,
        "compare_columns",
    )

    if set(keys) & set(fields):
        raise ValueError(
            "Key and comparison columns must differ."
        )

    if (
        not isinstance(source_rows, list)
        or not isinstance(target_rows, list)
    ):
        raise ValueError("Samples must be lists.")

    if (
        len(source_rows) > MAX_SAMPLE_ROWS
        or len(target_rows) > MAX_SAMPLE_ROWS
    ):
        raise ValueError("Sample size exceeds limit.")

    required = keys + fields

    def prepare(rows):
        prepared = []
        key_strings = []

        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("Invalid sampled row.")

            if any(column not in row for column in required):
                raise ValueError(
                    "Required comparison column missing."
                )

            if any(row[column] is None for column in keys):
                raise ValueError(
                    "Null reconciliation keys unsupported."
                )

            key = encode_key(row, keys)

            for column in fields:
                encode_value(row[column])

            prepared.append(row)
            key_strings.append(key)

        counts = Counter(key_strings)

        unique = {
            key: row
            for key, row in zip(key_strings, prepared)
            if counts[key] == 1
        }

        duplicates = {
            key: count
            for key, count in counts.items()
            if count > 1
        }

        return counts, unique, duplicates

    source_counts, source_unique, source_dups = (
        prepare(source_rows)
    )

    target_counts, target_unique, target_dups = (
        prepare(target_rows)
    )

    source_keys = set(source_counts)
    target_keys = set(target_counts)

    missing_keys = source_keys - target_keys
    extra_keys = target_keys - source_keys

    shared_unique_keys = (
        set(source_unique)
        & set(target_unique)
    )

    # Fresh per-run secret. Never return or log it.
    secret = secrets.token_bytes(32)

    def ref(key):
        return masked_reference(key, secret)

    missing = [
        {"row_ref": ref(key)}
        for key in sorted(missing_keys)
    ]

    extra = [
        {"row_ref": ref(key)}
        for key in sorted(extra_keys)
    ]

    duplicate_source = [
        {
            "row_ref": ref(key),
            "occurrences": count,
        }
        for key, count in sorted(
            source_dups.items()
        )
    ]

    duplicate_target = [
        {
            "row_ref": ref(key),
            "occurrences": count,
        }
        for key, count in sorted(
            target_dups.items()
        )
    ]

    mismatches = []

    for key in sorted(shared_unique_keys):
        source = source_unique[key]
        target = target_unique[key]

        differing_fields = [
            column
            for column in fields
            if encode_value(source[column])
            != encode_value(target[column])
        ]

        if differing_fields:
            mismatches.append({
                "row_ref": ref(key),
                "mismatched_columns": differing_fields,
            })

    return {
        "status": "success",
        "comparison_type": "source_to_target",
        "scope": "provided_samples_only",
        "verified": True,
        "ai_used": False,
        "read_only": True,
        "pii_included": False,
        "source_sample_rows": len(source_rows),
        "target_sample_rows": len(target_rows),
        "source_distinct_keys": len(source_keys),
        "target_distinct_keys": len(target_keys),
        "missing_key_count": len(missing),
        "extra_key_count": len(extra),
        "duplicate_source_key_count": len(
            source_dups
        ),
        "duplicate_target_key_count": len(
            target_dups
        ),
        "compared_unique_key_count": len(
            shared_unique_keys
        ),
        "field_mismatch_count": len(
            mismatches
        ),
        "missing_in_target": missing,
        "extra_in_target": extra,
        "duplicate_source_keys": duplicate_source,
        "duplicate_target_keys": duplicate_target,
        "field_mismatches": mismatches,
        "limitations": (
            "Results describe only the provided "
            "samples. Duplicate keys are excluded "
            "from field-level comparison. "
            "Row references are temporary and "
            "change between runs. No full-population "
            "reconciliation is implied."
        ),
    }
