"""
AI Data Guardian 3.0
Source-to-target PostgreSQL reconciliation service.

The sampler returns raw rows internally.
The public result contains only reconciliation
statistics and pseudonymous discrepancy evidence.

Connection configurations are internal arguments,
not values supplied by public API requests.
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
    Reconcile bounded source and target samples.

    For initial testing, both connections default
    to the existing PostgreSQL reader account.

    Independent configurations can be supplied
    later through trusted backend configuration.

    This function performs SELECT operations only.
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

    comparison = reconcile_samples(
        source_rows=source["rows"],
        target_rows=target["rows"],
        key_columns=key_columns,
        compare_columns=compare_columns,
    )

    # Deliberately do not return either sampler
    # response: those objects contain raw values.

    return {
        **comparison,
        "table": table_name,
        "sample_limit": limit,
        "source_has_more_rows": source[
            "has_more_rows"
        ],
        "target_has_more_rows": target[
            "has_more_rows"
        ],
        "sampling_complete": (
            source["has_more_rows"] is False
            and target["has_more_rows"] is False
        ),
        "sampling_method": "bounded_ordered_sql",
        "limitations": (
            comparison["limitations"]
            + " Independently bounded source and "
            "target samples may contain different "
            "keys even if full datasets match. "
            "Only keys present in the supplied "
            "samples are compared. Sampling is "
            "not a complete population audit."
        ),
    }
