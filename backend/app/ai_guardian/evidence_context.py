
"""
AI Data Guardian 3.0
Verified Evidence Context Builder

Purpose:
- Retrieve deterministic row-level evidence
- Select approved validation findings
- Prepare compact, pseudonymous context
- Keep raw customer details out of AI input
- Avoid unnecessary Ollama requests

This module does NOT call Ollama.
This module does NOT modify PostgreSQL.
"""

import json

from app.validation.customer_evidence import (
    collect_customer_evidence
)


# =====================================================
# CONFIGURATION
# =====================================================

ALLOWED_TABLES = {
    "customers"
}

ALLOWED_RULES = {
    "missing_email",
    "duplicate_email",
    "invalid_phone"
}

MAX_CONTEXT_ROWS = 10


# =====================================================
# VALIDATE REQUEST
# =====================================================

def validate_evidence_request(
    table_name,
    rule_name=None
):
    """
    Allow only configured tables and rule names.
    """

    if table_name not in ALLOWED_TABLES:
        raise ValueError(
            "Evidence-aware investigation is "
            "currently available for customers only."
        )

    if (
        rule_name is not None
        and rule_name not in ALLOWED_RULES
    ):
        raise ValueError(
            "Unknown validation rule."
        )

    return table_name, rule_name


# =====================================================
# BUILD VERIFIED CONTEXT
# =====================================================

def build_evidence_context(
    table_name="customers",
    rule_name=None
):
    """
    Retrieve fresh deterministic evidence and
    prepare a limited context for AI investigation.

    The returned data contains:
    - Temporary pseudonymous references
    - Failed rule names
    - Verified issue counts
    - Rule descriptions

    It does not contain raw customer identifiers,
    names, email addresses or phone numbers.
    """

    table_name, rule_name = (
        validate_evidence_request(
            table_name,
            rule_name
        )
    )

    # Retrieve current evidence using the
    # existing PostgreSQL validation engine.

    source = collect_customer_evidence()

    if (
        source.get("status") != "success"
        or source.get("table") != table_name
        or source.get("ai_used") is not False
    ):
        raise ValueError(
            "Verified evidence is unavailable."
        )

    source_rows = source.get("evidence", [])

    if not isinstance(source_rows, list):
        raise ValueError(
            "Invalid evidence structure."
        )

    # Ensure we do not silently treat a partial
    # evidence response as a complete population.

    source_truncated = (
        source.get("truncated") is True
    )

    # Filter rows by the selected validation rule.
    # If no rule is selected, include all issue types.

    filtered_rows = []

    for row in source_rows:

        row_ref = row.get("row_ref")
        failed_rules = row.get(
            "failed_rules",
            []
        )

        if (
            not isinstance(row_ref, str)
            or not row_ref.startswith("row_")
            or not isinstance(failed_rules, list)
            or not all(
                rule in ALLOWED_RULES
                for rule in failed_rules
            )
        ):
            raise ValueError(
                "Invalid evidence row."
            )

        if (
            rule_name is not None
            and rule_name not in failed_rules
        ):
            continue

        filtered_rows.append({
            "row_ref": row_ref,
            "failed_rules": list(failed_rules)
        })

    # Keep model context small for low-memory
    # local inference on gemma3:1b.

    context_rows = filtered_rows[
        :MAX_CONTEXT_ROWS
    ]

    context_truncated = (
        source_truncated
        or len(filtered_rows) > MAX_CONTEXT_ROWS
    )

    descriptions = source.get(
        "rule_descriptions",
        {}
    )

    approved_descriptions = {
        rule: descriptions.get(rule, "")
        for rule in ALLOWED_RULES
    }

    return {
        "status": "success",
        "table": table_name,
        "source": "deterministic_sql",
        "verified": True,
        "ai_used": False,
        "selected_rule": rule_name,
        "total_affected_rows": source.get(
            "total_affected_rows"
        ),
        "total_issue_occurrences": source.get(
            "total_issue_occurrences"
        ),
        "issue_counts": source.get(
            "issue_counts"
        ),
        "rule_descriptions": (
            approved_descriptions
        ),
        "returned_context_rows": len(
            context_rows
        ),
        "context_rows": context_rows,
        "truncated": context_truncated,
        "limitations": (
            "Row references are temporary, "
            "pseudonymous identifiers. "
            "The context does not include raw "
            "customer details. When truncated, "
            "the displayed rows are not a "
            "complete list of affected records."
        )
    }


# =====================================================
# LOCAL TEST
# =====================================================

if __name__ == "__main__":

    print(
        "TEST 1: Missing email evidence"
    )

    missing_context = (
        build_evidence_context(
            "customers",
            "missing_email"
        )
    )

    print(
        json.dumps(
            missing_context,
            indent=2
        )
    )

    print()
    print(
        "TEST 2: Duplicate email evidence"
    )

    duplicate_context = (
        build_evidence_context(
            "customers",
            "duplicate_email"
        )
    )

    print(
        json.dumps(
            duplicate_context,
            indent=2
        )
    )
