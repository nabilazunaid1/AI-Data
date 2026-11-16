
"""
AI Data Guardian 3.0
Centralized Local AI Guardian Service

Model: gemma3:1b
Provider: Ollama (local)

Security:
- Only structured validation summaries are accepted.
- No raw database rows or PII are included.
- No SQL execution or database access.
- No automatic AI invocation.
"""

import json
import os
import urllib.error
import urllib.request


OLLAMA_URL = os.getenv(
    "OLLAMA_URL",
    "http://127.0.0.1:11434/api/generate"
)

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "gemma3:1b"
)

ALLOWED_TABLES = {
    "customers",
    "transactions",
    "products",
    "dim_region",
    "etl_logs"
}


def validate_summary(summary):
    """Validate and normalize an approved summary."""

    if not isinstance(summary, dict):
        raise ValueError("Summary must be a dictionary")

    table = summary.get("table")

    if table not in ALLOWED_TABLES:
        raise ValueError("Table is not approved")

    fields = (
        "total_records",
        "missing",
        "duplicates",
        "invalid"
    )

    clean = {"table": table}

    for field in fields:
        value = summary.get(field)

        if type(value) is not int or value < 0:
            raise ValueError(
                f"{field} must be a non-negative integer"
            )

        clean[field] = value

    score = summary.get("quality_score")

    if (
        type(score) not in (int, float)
        or not 0 <= score <= 100
    ):
        raise ValueError(
            "quality_score must be between 0 and 100"
        )

    clean["quality_score"] = float(score)

    return clean


def build_prompt(summary):
    """
    Construct the prompt from approved fields only.
    """

    clean = validate_summary(summary)

    return f"""
You are AI Data Guardian, a local enterprise
data-quality investigation assistant.

Your job is to explain deterministic SQL validation
results and recommend practical corrective actions.

You MUST follow these rules:
- Use only the supplied numerical summary.
- Do not claim you inspected individual database rows.
- Do not invent additional findings.
- Do not reveal or request personal information.
- Do not suggest deleting records automatically.
- Do not claim that recommendations have been applied.
- Keep the answer concise and actionable.

Validation summary:
{json.dumps(clean, indent=2)}

Respond with:
1. Overall assessment.
2. Explanation of missing, duplicate and invalid data.
3. Three recommended next actions.
4. A short note about limitations.

Do not include internal reasoning.
""".strip()


def investigate_validation(summary):
    """
    Run Ollama only when explicitly called.

    Returns a text explanation.
    """

    prompt = build_prompt(summary)

    request_body = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "think": False,
        "options": {
            "num_ctx": 1024,
            "num_predict": 240,
            "temperature": 0.2
        },
        "keep_alive": "0"
    }

    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=120
        ) as response:
            result = json.loads(
                response.read().decode("utf-8")
            )

    except urllib.error.URLError as error:
        raise RuntimeError(
            "Local Ollama service is unavailable"
        ) from error

    except TimeoutError as error:
        raise RuntimeError(
            "Local AI inference timed out"
        ) from error

    explanation = result.get("response", "").strip()

    if not explanation:
        raise RuntimeError(
            "Ollama returned an empty response"
        )

    return {
        "status": "success",
        "model": OLLAMA_MODEL,
        "provider": "ollama_local",
        "table": summary["table"],
        "ai_used": True,
        "read_only": True,
        "explanation": explanation
    }


if __name__ == "__main__":

    test_summary = {
        "table": "customers",
        "total_records": 8,
        "quality_score": 75.0,
        "missing": 3,
        "duplicates": 1,
        "invalid": 2
    }

    print("Testing AI Guardian with local Ollama...")

    result = investigate_validation(test_summary)

    print(json.dumps(result, indent=2))


# =====================================================
# RULE-SPECIFIC AI ROOT-CAUSE INVESTIGATION
# STEP 10.5.4
# =====================================================

def investigate_rule_root_cause(verified_finding):
    """
    Generate AI hypotheses from a verified SQL finding.

    Only approved numerical metadata reaches Ollama.
    No individual records, row references or raw PII
    are included in the model prompt.

    AI output is advisory and must not be presented
    as a verified root cause.
    """

    from app.ai_guardian.evidence_investigation import (
        RULE_CONFIG,
    )

    if not isinstance(verified_finding, dict):
        raise ValueError("Invalid verified finding.")

    if (
        verified_finding.get("verified") is not True
        or verified_finding.get("ai_used") is not False
        or verified_finding.get("pii_included") is not False
        or verified_finding.get("table") != "customers"
        or verified_finding.get("status") != "success"
        or verified_finding.get("validation_method")
        != "deterministic_sql"
    ):
        raise ValueError(
            "Only approved deterministic findings are accepted."
        )

    rule_name = verified_finding.get("rule")

    if rule_name not in RULE_CONFIG:
        raise ValueError("Unsupported validation rule.")

    issue_count = verified_finding.get(
        "verified_issue_count"
    )

    total_records = verified_finding.get(
        "total_records"
    )

    quality_score = verified_finding.get(
        "quality_score"
    )

    if (
        type(issue_count) is not int
        or issue_count < 0
        or type(total_records) is not int
        or total_records < 0
        or issue_count > total_records
        or type(quality_score) not in (int, float)
        or not 0 <= quality_score <= 100
    ):
        raise ValueError(
            "Invalid verified numerical metrics."
        )

    # The AI prompt is constructed exclusively
    # from whitelisted values. Never serialize
    # the complete evidence dictionary.

    approved_context = {
        "table": "customers",
        "rule": rule_name,
        "verified_issue_count": issue_count,
        "total_records": total_records,
        "quality_score": float(quality_score),
    }

    prompt = (
        "You are AI Data Guardian, a local data-quality "
        "investigation assistant.\n\n"
        "The numerical findings below were verified "
        "by deterministic SQL.\n\n"
        + json.dumps(approved_context, indent=2)
        + "\n\n"
        "Using only these findings, respond with:\n"
        "1. Verified finding: summarize the SQL result.\n"
        "2. Possible root causes: provide up to three "
        "clearly labeled hypotheses.\n"
        "3. Recommended actions: provide up to three "
        "practical investigation or correction steps.\n"
        "4. Limitations: explain what cannot be proven "
        "from aggregate data.\n\n"
        "Requirements:\n"
        "- Never claim a hypothesis is proven.\n"
        "- Do not invent customer records or values.\n"
        "- Do not claim to have inspected source-system logs.\n"
        "- Do not request or reveal personal information.\n"
        "- Do not suggest automatic record deletion.\n"
        "- Do not claim that any correction was applied.\n"
        "- Keep the response concise and actionable.\n"
    )

    request_body = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "think": False,
        "options": {
            "num_ctx": 2048,
            "num_predict": 400,
            "temperature": 0.2,
        },
        "keep_alive": "0",
    }

    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json"
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=120,
        ) as response:
            model_result = json.loads(
                response.read().decode("utf-8")
            )

    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(
            "Local AI root-cause investigation unavailable."
        ) from error

    explanation = model_result.get(
        "response", ""
    )

    if (
        not isinstance(explanation, str)
        or not explanation.strip()
    ):
        raise RuntimeError(
            "AI returned an empty root-cause explanation."
        )

    return {
        "status": "success",
        "table": "customers",
        "rule": rule_name,
        "verified": True,
        "verified_issue_count": issue_count,
        "total_records": total_records,
        "quality_score": float(quality_score),
        "validation_method": "deterministic_sql",
        "ai_used": True,
        "model": OLLAMA_MODEL,
        "provider": "ollama_local",
        "read_only": True,
        "pii_included_in_prompt": False,
        "analysis_type": "ai_root_cause_hypotheses",
        "explanation": explanation.strip(),
        "disclaimer": (
            "Issue counts are SQL-verified. Root-cause "
            "hypotheses and corrective suggestions are "
            "AI-generated and require human verification. "
            "No database records were modified."
        ),
    }
