"""
AI Data Guardian 3.0
Source-to-target PostgreSQL reconciliation service.

Fully retrieve approved tables through read-only,
paginated PostgreSQL cursors before comparison.
Fail closed when either dataset exceeds the safe cap.
Raw records remain internal and never enter the API result.
"""

from app.reconciliation.connection_config import (
    source_database_config,
)
from app.reconciliation.paginated_sampler import (
    fetch_paginated_rows,
    MAX_TOTAL_ROWS,
    MAX_PAGE_SIZE,
)
from app.reconciliation.postgres_sampler import (
    APPROVED_TABLES,
)
from app.reconciliation.reconciliation_engine import (
    reconcile_samples,
    validate_columns,
    MAX_SAMPLE_ROWS,
)


def reconcile_postgres_tables(
    table_name="customers",
    key_columns=None,
    compare_columns=None,
    limit=100,
    source_config=None,
    target_config=None,
):
    """Compare complete, bounded table snapshots from two databases.

    limit is the maximum rows PER database, not a page size.
    Records are processed internally; only aggregate counts
    and per-run HMAC references are returned.
    """
    if key_columns is None:
        key_columns = ["customer_id"]

    if compare_columns is None:
        compare_columns = ["email", "region"]

    keys = validate_columns(key_columns, "key_columns")
    fields = validate_columns(compare_columns, "compare_columns")
    if set(keys) & set(fields):
        raise ValueError("Key and comparison columns must differ.")

    if not isinstance(table_name, str) or table_name not in APPROVED_TABLES:
        raise ValueError("Unsupported reconciliation table.")

    allowed = APPROVED_TABLES[table_name]["columns"]
    selected_columns = keys + fields
    if any(column not in allowed for column in selected_columns):
        raise ValueError("Unapproved reconciliation column.")

    if (
        type(limit) is not int
        or not 1 <= limit <= min(MAX_TOTAL_ROWS, MAX_SAMPLE_ROWS)
    ):
        raise ValueError("Invalid reconciliation row limit.")

    if target_config is None:
        raise ValueError("A separate target database is required.")

    if source_config is None:
        source_config = source_database_config()

    page_size = min(MAX_PAGE_SIZE, limit)

    source = fetch_paginated_rows(
        connection_config=source_config,
        table_name=table_name,
        columns=selected_columns,
        page_size=page_size,
        max_total_rows=limit,
    )

    target = fetch_paginated_rows(
        connection_config=target_config,
        table_name=table_name,
        columns=selected_columns,
        page_size=page_size,
        max_total_rows=limit,
    )

    if (
        source.get("status") != "success"
        or target.get("status") != "success"
        or source.get("read_only") is not True
        or target.get("read_only") is not True
        or source.get("complete") is not True
        or target.get("complete") is not True
    ):
        raise RuntimeError("Complete read-only retrieval required.")

    source_rows = source["rows"]
    target_rows = target["rows"]

    # The engine never receives incomplete populations.
    comparison = reconcile_samples(
        source_rows=source_rows,
        target_rows=target_rows,
        key_columns=keys,
        compare_columns=fields,
    )

    # Do not return raw source or target rows.
    return {
        **comparison,
        "scope": "complete_bounded_datasets_at_read_time",
        "table": table_name,
        "sample_limit": limit,
        "source_has_more_rows": False,
        "target_has_more_rows": False,
        "sampling_complete": True,
        "sampling_method": "read_only_paginated_sql",
        "source_pages_fetched": source["pages_fetched"],
        "target_pages_fetched": target["pages_fetched"],
        "limitations": (
            "Both datasets were fully retrieved within the "
            "configured row cap using independent read-only "
            "transactions. Counts apply to these datasets at "
            "their respective read times; the databases are not "
            "snapshotted atomically together, so concurrent "
            "changes can affect comparisons. Duplicate keys "
            "are excluded from field-level comparison. "
            "Pseudonymous row references change between runs."
        ),
    }
