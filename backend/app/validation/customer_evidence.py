
"""
AI Data Guardian 3.0
Customer Row-Level Validation Evidence

Purpose:
- Identify records failing verified customer rules
- Return only opaque row references and rule names
- Never return raw customer identifiers or PII
- Use PostgreSQL read-only access
- Do not invoke Ollama

Security:
- Customer IDs are used internally only
- Row references use keyed HMAC
- The key is generated per Python process
- References change when the process restarts

This is a local prototype, not a full anonymization
or production authorization system.
"""

import hashlib
import hmac
import json
import secrets

import psycopg

from app.validation.customer_rules import (
    reader_database_config
)


# =====================================================
# CONFIGURATION
# =====================================================

# Generate a temporary secret for this process.
# It is never returned to the frontend.

_EVIDENCE_KEY = secrets.token_bytes(32)

MAX_EVIDENCE_ROWS = 100


# =====================================================
# VERIFIED CUSTOMER RULE DESCRIPTIONS
# =====================================================

RULE_DESCRIPTIONS = {
    "missing_email": (
        "Email is NULL or contains only whitespace."
    ),
    "duplicate_email": (
        "Email duplicates an earlier record after "
        "case and whitespace normalization."
    ),
    "invalid_phone": (
        "Phone number is NULL or does not contain "
        "exactly 10 or 11 digits."
    )
}


# =====================================================
# PRIVATE ROW REFERENCE
# =====================================================

def make_row_reference(customer_id):
    """
    Create an opaque reference from the primary key.

    Never expose the original customer_id.

    Because the HMAC key is temporary, these
    references should not be stored as permanent IDs.
    """

    if customer_id is None:
        raise ValueError(
            "Customer identifier cannot be NULL"
        )

    message = (
        "customers:" + str(customer_id)
    ).encode("utf-8")

    digest = hmac.new(
        _EVIDENCE_KEY,
        message,
        hashlib.sha256
    ).hexdigest()

    return "row_" + digest[:20]


# =====================================================
# DETERMINISTIC SQL EVIDENCE
# =====================================================

EVIDENCE_SQL = """
WITH ranked_customers AS (

    SELECT
        customer_id,

        (
            email IS NULL
            OR TRIM(email) = ''
        ) AS missing_email,

        (
            phone IS NULL
            OR phone !~ '^[0-9]{10,11}$'
        ) AS invalid_phone,

        CASE
            WHEN email IS NOT NULL
             AND TRIM(email) <> ''
            THEN ROW_NUMBER() OVER (
                PARTITION BY LOWER(TRIM(email))
                ORDER BY customer_id
            )
            ELSE 1
        END AS email_occurrence

    FROM public.customers
)

SELECT
    customer_id,
    missing_email,
    (email_occurrence > 1) AS duplicate_email,
    invalid_phone

FROM ranked_customers

WHERE
    missing_email
    OR email_occurrence > 1
    OR invalid_phone

ORDER BY customer_id;
"""


# =====================================================
# EVIDENCE ENGINE
# =====================================================

def collect_customer_evidence():
    """
    Collect row-level validation evidence.

    Returns:
    - Masked, opaque row references
    - Names of failed rules
    - Rule descriptions
    - Aggregate issue counts

    No customer names, emails, phone numbers
    or raw customer IDs are returned.
    """

    with psycopg.connect(
        **reader_database_config()
    ) as connection:

        with connection.transaction():

            with connection.cursor() as cursor:

                cursor.execute(
                    "SET TRANSACTION READ ONLY"
                )

                cursor.execute(
                    "SET LOCAL statement_timeout = '5000ms'"
                )

                cursor.execute(EVIDENCE_SQL)

                records = cursor.fetchall()

    evidence = []

    issue_counts = {
        "missing": 0,
        "duplicates": 0,
        "invalid": 0
    }

    for (
        customer_id,
        missing_email,
        duplicate_email,
        invalid_phone
    ) in records:

        failed_rules = []

        if missing_email:
            failed_rules.append("missing_email")
            issue_counts["missing"] += 1

        if duplicate_email:
            failed_rules.append("duplicate_email")
            issue_counts["duplicates"] += 1

        if invalid_phone:
            failed_rules.append("invalid_phone")
            issue_counts["invalid"] += 1

        # customer_id is only used to create an
        # opaque reference; never include it in
        # the returned dictionary.

        evidence.append({
            "row_ref": make_row_reference(
                customer_id
            ),
            "failed_rules": failed_rules,
            "issue_count": len(failed_rules)
        })

    total_issue_occurrences = sum(
        issue_counts.values()
    )

    return {
        "status": "success",
        "table": "customers",
        "validation_method": "deterministic_sql",
        "ai_used": False,
        "pii_included": False,
        "row_reference_type": "temporary_hmac",
        "total_affected_rows": len(evidence),
        "total_issue_occurrences": (
            total_issue_occurrences
        ),
        "issue_counts": issue_counts,
        "rule_descriptions": RULE_DESCRIPTIONS,
        "evidence": evidence[:MAX_EVIDENCE_ROWS],
        "returned_evidence_rows": min(
            len(evidence),
            MAX_EVIDENCE_ROWS
        ),
        "truncated": (
            len(evidence) > MAX_EVIDENCE_ROWS
        ),
        "limitations": (
            "Row references are temporary and "
            "change after process restart. "
            "Evidence identifies validation failures "
            "but does not disclose customer values."
        )
    }


# =====================================================
# LOCAL TEST
# =====================================================

if __name__ == "__main__":

    result = collect_customer_evidence()

    print("CUSTOMER ROW-LEVEL EVIDENCE")
    print("---------------------------")

    print(
        json.dumps(
            result,
            indent=2
        )
    )
