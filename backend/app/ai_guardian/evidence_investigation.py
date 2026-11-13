
"""
AI Data Guardian 3.0
Evidence-Aware Investigation Service

Purpose:
- Retrieve verified row-level customer evidence
- Check that evidence matches deterministic validation
- Return exact pseudonymous references for a rule
- Keep verified findings separate from AI guidance

This module does NOT call Ollama.
The AI model will be connected separately.
"""

import json
import re

from app.ai_guardian.evidence_context import (
    build_evidence_context
)

from app.validation.customer_rules import (
    validate_customers
)


# =====================================================
# APPROVED RULES
# =====================================================

RULE_CONFIG = {
    "missing_email": {
        "label": "Missing email",
        "metric": "missing",
        "recommendation": (
            "Review the source records and determine "
            "whether the missing emails can be recovered."
        )
    },

    "duplicate_email": {
        "label": "Duplicate email",
        "metric": "duplicates",
        "recommendation": (
            "Review the duplicate records before "
            "merging or removing any information."
        )
    },

    "invalid_phone": {
        "label": "Invalid phone",
        "metric": "invalid",
        "recommendation": (
            "Review phone number formatting and "
            "confirm valid values against business rules."
        )
    }
}


# =====================================================
# VALIDATE INPUT
# =====================================================

def validate_rule_name(rule_name):
    if rule_name not in RULE_CONFIG:
        raise ValueError(
            "The requested validation rule is not supported."
        )

    return rule_name


# =====================================================
# VERIFY ROW REFERENCES
# =====================================================

def validate_evidence_rows(rows, rule_name):
    if not isinstance(rows, list):
        raise ValueError(
            "Invalid evidence rows."
        )

    verified_rows = []
    seen_references = set()

    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(
                "Invalid evidence row structure."
            )

        row_ref = row.get("row_ref")
        failed_rules = row.get("failed_rules")

        if (
            not isinstance(row_ref, str)
            or re.fullmatch(
                r"row_[a-f0-9]{20}",
                row_ref
            ) is None
        ):
            raise ValueError(
                "Invalid pseudonymous row reference."
            )

        if (
            not isinstance(failed_rules, list)
            or rule_name not in failed_rules
            or not all(
                rule in RULE_CONFIG
                for rule in failed_rules
            )
        ):
            raise ValueError(
                "Evidence does not match the requested rule."
            )

        if row_ref in seen_references:
            raise ValueError(
                "Duplicate row reference in evidence."
            )

        seen_references.add(row_ref)

        verified_rows.append({
            "row_ref": row_ref,
            "failed_rules": list(failed_rules)
        })

    return verified_rows


# =====================================================
# BUILD EVIDENCE-AWARE RESULT
# =====================================================

def investigate_verified_rule(
    rule_name,
    table_name="customers"
):
    """
    Return verified findings for a customer rule.

    Raw customer IDs, names, emails and phone
    numbers are never returned.

    The result contains no AI-generated text.
    """

    validate_rule_name(rule_name)

    if table_name != "customers":
        raise ValueError(
            "Evidence-aware investigation currently "
            "supports the customers table only."
        )

    # Retrieve deterministic validation.
    validation = validate_customers()

    if (
        validation.get("table") != "customers"
        or validation.get("status") != "completed"
        or validation.get("ai_used") is not False
    ):
        raise ValueError(
            "Verified customer validation is unavailable."
        )

    # Retrieve verified row-level evidence.
    context = build_evidence_context(
        table_name="customers",
        rule_name=rule_name
    )

    if (
        context.get("status") != "success"
        or context.get("verified") is not True
        or context.get("ai_used") is not False
        or context.get("selected_rule") != rule_name
    ):
        raise ValueError(
            "Invalid evidence context."
        )

    verified_rows = validate_evidence_rows(
        context.get("context_rows"),
        rule_name
    )

    metric_name = RULE_CONFIG[
        rule_name
    ]["metric"]

    expected_count = validation[
        metric_name
    ]

    # Evidence is limited to a maximum number of
    # rows. When truncated, do not claim the visible
    # references form a complete list.
    truncated = (
        context.get("truncated") is True
    )

    if (
        not truncated
        and len(verified_rows) != expected_count
    ):
        raise ValueError(
            "Evidence count does not match "
            "deterministic validation."
        )

    rule_label = RULE_CONFIG[
        rule_name
    ]["label"]

    if truncated:
        finding = (
            f"SQL verified {expected_count} findings "
            f"for {rule_label.lower()}. "
            f"Only {len(verified_rows)} temporary row "
            f"references are included in this result."
        )

    else:
        finding = (
            f"SQL verified {expected_count} findings "
            f"for {rule_label.lower()}. "
            f"The returned references represent "
            f"the affected rows for this rule."
        )

    return {
        "status": "success",
        "table": table_name,
        "rule": rule_name,
        "rule_label": rule_label,
        "verified": True,
        "validation_method": "deterministic_sql",
        "ai_used": False,
        "pii_included": False,
        "quality_score": validation[
            "quality_score"
        ],
        "total_records": validation[
            "total_records"
        ],
        "verified_issue_count": expected_count,
        "returned_rows": len(verified_rows),
        "truncated": truncated,
        "finding": finding,
        "rows": verified_rows,
        "recommendation": RULE_CONFIG[
            rule_name
        ]["recommendation"],
        "recommendation_source": (
            "deterministic_rule_guidance"
        ),
        "limitations": (
            "References are temporary pseudonymous "
            "identifiers, not permanent customer IDs. "
            "The system does not expose actual "
            "customer values."
        )
    }


# =====================================================
# LOCAL TESTS
# =====================================================

if __name__ == "__main__":

    for rule_name in (
        "missing_email",
        "duplicate_email",
        "invalid_phone"
    ):
        print()
        print("=" * 50)
        print("TEST:", rule_name)
        print("=" * 50)

        result = investigate_verified_rule(
            rule_name
        )

        print(
            json.dumps(
                result,
                indent=2
            )
        )
