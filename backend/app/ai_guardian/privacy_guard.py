
"""
AI Data Guardian 3.0
Backend AI Question Privacy Guard

Purpose:
- Validate questions before local Ollama inference
- Reject recognizable personal values
- Reject requests for exact customer records
- Accept general data-quality questions
- Fail closed for unsupported input

IMPORTANT:
This is a conservative prototype safeguard,
not a comprehensive PII detection solution.

It must be called by the backend API before
a question is forwarded to Ollama.
"""

import re


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

# Possible phone numbers, including formatted
# Malaysian-style numbers and other common forms.
# This is intentionally conservative.
PHONE_VALUE = re.compile(
    r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)"
)

# Long uninterrupted numeric identifiers.
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

    Raise PrivacyGuardError for potentially
    sensitive or unsupported requests.

    No database access or Ollama call occurs here.
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

    # Normalize whitespace and remove control
    # characters rather than accepting prompts
    # containing hidden formatting.
    if any(
        ord(character) < 32
        and character not in "\t\n\r"
        for character in text
    ):
        raise PrivacyGuardError(
            "Question contains unsupported characters."
        )

    text = " ".join(text.split())

    if EMAIL_VALUE.search(text):
        raise PrivacyGuardError(
            "Do not include email addresses in AI questions."
        )

    if PHONE_VALUE.search(text):
        raise PrivacyGuardError(
            "Do not include phone numbers or long numeric "
            "values in AI questions."
        )

    if LONG_NUMBER.search(text):
        raise PrivacyGuardError(
            "Do not include numeric identifiers "
            "in AI questions."
        )

    if ROW_REFERENCE.search(text):
        raise PrivacyGuardError(
            "Use the verified evidence interface "
            "to inspect pseudonymous row references."
        )

    action = RECORD_ACTION.search(text)
    target = RECORD_TARGET.search(text)
    detail = RECORD_DETAIL.search(text)

    # Exact or individual record requests must
    # not go through the general Ollama endpoint.
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
    print("=" * 45)

    for question in approved:
        try:
            result = validate_ai_question(question)

            print("PASS ALLOWED:", result)

        except PrivacyGuardError:
            failures.append(question)
            print("FAIL ALLOWED:", question)

    for question in rejected:
        try:
            validate_ai_question(question)

            failures.append(question)
            print("FAIL BLOCKED:", question)

        except PrivacyGuardError:
            print("PASS BLOCKED:", question)

    print("=" * 45)

    if failures:
        print(
            f"FAILED: {len(failures)} tests"
        )
        raise SystemExit(1)

    print(
        f"PASSED: {len(approved) + len(rejected)} tests"
    )
    print("Privacy guard is ready for API integration.")
