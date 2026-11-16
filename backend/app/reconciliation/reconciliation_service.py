"""
AI Data Guardian 3.0
Source-to-target PostgreSQL reconciliation service.

Reconciliation must not report full-dataset
discrepancies from independently truncated samples.

Raw data is used internally only.
"""

from app.reconciliation.postgres_sampler import (
    fetch_postgres_sample,
    validate_sample_request,
)
from app.reconciliation.reconciliation_engine import (
    reconcile_samples,
)


def reconcile_postgres_tables(
    table_name="customers",
    key_columns=None,
    compare_columns=None,
    limit=100,
    source_config=None,
    target_config=None,
):
    """
    Reconcile two bounded PostgreSQL datasets.

    Both samples must be complete before reporting
    verified missing keys, extra keys, duplicates
    or field mismatches.

    When either sample is truncated, fail closed
    without returning potentially misleading
    reconciliation counts.

    Uses read-only SQL sampling only.
    """

    if key_columns is None:
        key_columns = ["customer_id"]

    if compare_columns is None:
        compare_columns = ["email", "region"]

    required_columns = (
        list(key_columns) + list(compare_columns)
    )

    selected_columns = validate_sample_request(
        table_name,
        required_columns,
        limit,
    )

    if (
        not key_columns
        or not compare_columns
        or set(key_columns) & set(compare_columns)
    ):
        raise ValueError(
            "Invalid reconciliation column selection."
        )

    source = fetch_postgres_sample(
        table_name=table_name,
        columns=selected_columns,
        limit=limit,
        connection_config=source_config,
    )

    target = fetch_postgres_sample(
        table_name=table_name,
        columns=selected_columns,
        limit=limit,
        connection_config=target_config,
    )

    if (
        source.get("status") != "success"
        or target.get("status") != "success"
        or source.get("read_only") is not True
        or target.get("read_only") is not True
    ):
        raise RuntimeError(
            "Read-only database sampling failed."
        )

    # Critical: do not report missing or extra
    # keys from independently truncated datasets.

    if (
        source.get("has_more_rows") is not False
        or target.get("has_more_rows") is not False
    ):
        raise RuntimeError(
            "Reconciliation requires complete samples. "
            "At least one dataset exceeds the current "
            "sample limit. No verified reconciliation "
            "counts were produced."
        )

    comparison = reconcile_samples(
        source_rows=source["rows"],
        target_rows=target["rows"],
        key_columns=key_columns,
        compare_columns=compare_columns,
    )

    # Do not return source or target raw rows.

    return {
        **comparison,
        "table": table_name,
        "sample_limit": limit,
        "source_has_more_rows": False,
        "target_has_more_rows": False,
        "sampling_complete": True,
        "sampling_method": "bounded_ordered_sql",
        "limitations": (
            comparison["limitations"]
            + " Both source and target datasets "
            "were fully retrieved within the "
            "configured limit. Findings apply "
            "to those complete datasets at the "
            "times they were read; concurrent "
            "changes across databases are not "
            "excluded."
        ),
    }
