
"""
AI Data Guardian 3.0
Backend AI Question Privacy Guard

Purpose:
- Validate questions before local Ollama inference.
- Reject recognizable personal values.
- Reject existing customer names.
- Reject requests for exact customer records.
- Accept general data-quality questions.
- Fail closed when privacy verification is unavailable.

Customer names are checked locally using the
restricted PostgreSQL reader connection.

This is a conservative safeguard, not a
comprehensive PII detection solution.
"""

import re

from app.ai_guardian.customer_name_guard import (
    contains_customer_name,
)


MAX_QUESTION_LENGTH = 500


class PrivacyGuardError(ValueError):
    """Rejected AI question."""


# =====================================================
# SENSITIVE VALUE DETECTION
# =====================================================

EMAIL_VALUE = re.compile(
    r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
    re.IGNORECASE
)

PHONE_VALUE = re.compile(
    r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)"
)

LONG_NUMBER = re.compile(
    r"(?<!\d)\d{8,}(?!\d)"
)

ROW_REFERENCE = re.compile(
    r"\brow_[a-f0-9]{20}\b",
    re.IGNORECASE
)


# =====================================================
# RECORD-LEVEL REQUEST DETECTION
# =====================================================

RECORD_ACTION = re.compile(
    r"\b("
    r"which|show|list|find|identify|display|"
    r"give|provide|retrieve|fetch|return|"
    r"export|reveal|expose|lookup|locate"
    r")\b",
    re.IGNORECASE
)

RECORD_TARGET = re.compile(
    r"\b("
    r"customer|customers|record|records|"
    r"row|rows|entry|entries|"
    r"ids?|identifiers?|references?|"
    r"names?|addresses?|"
    r"email addresses?|phone numbers?|"
    r"personal details|raw values|"
    r"individual values"
    r")\b",
    re.IGNORECASE
)

RECORD_DETAIL = re.compile(
    r"\b("
    r"exact|specific|individual|original|"
    r"unmasked|raw|real|full|actual"
    r")\b",
    re.IGNORECASE
)


# =====================================================
# SERVER-SIDE VALIDATION
# =====================================================

def validate_ai_question(question):
    """
    Return an approved, normalized question.

    Reject recognizable sensitive information.

    Customer-name detection runs locally through
    the restricted PostgreSQL reader connection.

    Any failure in the customer-name verification
    blocks the question before Ollama inference.
    """

    if not isinstance(question, str):
        raise PrivacyGuardError(
            "Question must be text."
        )

    text = question.strip()

    if not text:
        raise PrivacyGuardError(
            "Question cannot be empty."
        )

    if len(text) > MAX_QUESTION_LENGTH:
        raise PrivacyGuardError(
            "Question exceeds the maximum length."
        )

    # Reject unsupported control characters.
    if any(
        ord(character) < 32
        and character not in "\t\n\r"
        for character in text
    ):
        raise PrivacyGuardError(
            "Question contains unsupported characters."
        )

    text = " ".join(text.split())

    # -------------------------------------------------
    # 1. EMAIL PROTECTION
    # -------------------------------------------------

    if EMAIL_VALUE.search(text):
        raise PrivacyGuardError(
            "Do not include email addresses in AI questions."
        )

    # -------------------------------------------------
    # 2. PHONE PROTECTION
    # -------------------------------------------------

    if PHONE_VALUE.search(text):
        raise PrivacyGuardError(
            "Do not include phone numbers or long numeric "
            "values in AI questions."
        )

    # -------------------------------------------------
    # 3. NUMERIC IDENTIFIER PROTECTION
    # -------------------------------------------------

    if LONG_NUMBER.search(text):
        raise PrivacyGuardError(
            "Do not include numeric identifiers "
            "in AI questions."
        )

    # -------------------------------------------------
    # 4. PSEUDONYMOUS REFERENCE PROTECTION
    # -------------------------------------------------

    if ROW_REFERENCE.search(text):
        raise PrivacyGuardError(
            "Use the verified evidence interface "
            "to inspect pseudonymous row references."
        )

    # -------------------------------------------------
    # 5. RECORD-LEVEL REQUEST PROTECTION
    # -------------------------------------------------

    action = RECORD_ACTION.search(text)
    target = RECORD_TARGET.search(text)
    detail = RECORD_DETAIL.search(text)

    if action and target:
        raise PrivacyGuardError(
            "Record-level requests must use approved "
            "verified-evidence endpoints."
        )

    if detail and target:
        raise PrivacyGuardError(
            "AI Guardian cannot disclose exact "
            "customer records or personal values."
        )

    # -------------------------------------------------
    # 6. CUSTOMER NAME PROTECTION
    # -------------------------------------------------

    try:

        detected = contains_customer_name(text)

    except Exception as error:

        # Never allow AI processing when the
        # customer-name verification service fails.

        raise PrivacyGuardError(
            "Privacy verification is temporarily "
            "unavailable. Please try again later."
        ) from error

    if detected:
        raise PrivacyGuardError(
            "Your question may contain personal "
            "customer information. Remove personal "
            "details before submitting."
        )

    return text


# =====================================================
# LOCAL AUTOMATED TESTS
# =====================================================

if __name__ == "__main__":

    approved = [
        "How can I improve data quality?",
        "Explain the customer quality score.",
        "What causes duplicate emails?",
        "Why are some phone numbers invalid?",
        "Recommend validation improvements."
    ]

    rejected = [
        "Which customer records have missing emails?",
        "Give me the actual customer IDs.",
        "Show the exact customer names.",
        "Find the row with missing data.",
        "Check alice@example.invalid",
        "Investigate phone +60123456789",
        "Review customer 123456789012",
        "Find row_1234567890abcdef1234"
    ]

    failures = []

    print("BACKEND PRIVACY GUARD TESTS")
    print("=" * 50)

    for question in approved:

        try:
            result = validate_ai_question(question)

            print("PASS ALLOWED:", result)

        except PrivacyGuardError:
            failures.append(question)
            print("FAIL ALLOWED: General question rejected")

    for question in rejected:

        try:
            validate_ai_question(question)

            failures.append(question)
            print("FAIL BLOCKED: Sensitive question accepted")

        except PrivacyGuardError:
            print("PASS BLOCKED: Sensitive question rejected")

    print("=" * 50)

    if failures:
        print("FAILED:", len(failures), "tests")
        raise SystemExit(1)

    print(
        "PASSED:",
        len(approved) + len(rejected),
        "existing regression tests"
    )

    print("Customer-name verification enabled.")
    print("No Ollama inference executed by these tests.")
