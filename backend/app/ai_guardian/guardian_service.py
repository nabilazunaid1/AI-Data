
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
