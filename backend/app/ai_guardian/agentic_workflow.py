"""Controlled, explicitly invoked AI Data Guardian workflow.

Reuses deterministic customer checks, evidence investigation and the existing
local Ollama root-cause function. Does not execute AI-generated SQL, mutate
records, or pass raw evidence rows to the model.
"""

from app.ai_guardian.evidence_investigation import (
    RULE_CONFIG,
    investigate_verified_rule,
)
from app.ai_guardian.guardian_service import investigate_rule_root_cause
from app.validation.customer_rules import validate_customers


# Fixed order is used only to break ties in verified issue counts.
RULE_ORDER = ("missing_email", "duplicate_email", "invalid_phone")
MAX_AI_CALLS = 1


def _verified_validation(validation):
    if (
        not isinstance(validation, dict)
        or validation.get("status") != "completed"
        or validation.get("table") != "customers"
        or validation.get("ai_used") is not False
        or validation.get("validation_method") != "deterministic_sql"
    ):
        raise ValueError("Deterministic customer validation is unavailable.")

    total = validation.get("total_records")
    if type(total) is not int or total <= 0:
        raise ValueError("Invalid validated record count.")

    score = validation.get("quality_score")
    if type(score) not in (int, float) or not 0 <= score <= 100:
        raise ValueError("Invalid quality score.")

    for rule in RULE_ORDER:
        count = validation.get(RULE_CONFIG[rule]["metric"])
        if type(count) is not int or count < 0 or count > total:
            raise ValueError("Invalid verified issue count.")

    return validation


def run_agentic_quality_review(*, use_ai=False):
    """Review existing customer rules; optionally investigate one priority rule.

    The caller must explicitly opt in to one Ollama inference by passing
    use_ai=True. No AI inference occurs if validation has no issues.
    """
    if type(use_ai) is not bool:
        raise ValueError("use_ai must be a boolean.")

    validation = _verified_validation(validate_customers())
    findings = []

    for rule in RULE_ORDER:
        settings = RULE_CONFIG[rule]
        count = validation[settings["metric"]]
        findings.append({
            "rule": rule,
            "label": settings["label"],
            "verified_issue_count": count,
            "recommendation": settings["recommendation"],
            "recommendation_source": "deterministic_rule_guidance",
        })

    affected = [finding for finding in findings if finding["verified_issue_count"] > 0]
    priority = max(affected, key=lambda item: item["verified_issue_count"]) if affected else None
    outcome = {
        "status": "success",
        "workflow": "controlled_data_quality_review",
        "table": "customers",
        "validation_method": "deterministic_sql",
        "verified": True,
        "read_only": True,
        "pii_included": False,
        "ai_used": False,
        "ai_calls": 0,
        "total_records": validation["total_records"],
        "quality_score": validation["quality_score"],
        "findings": findings,
        "priority_rule": priority["rule"] if priority else None,
        "investigation": None,
        "ai_guidance": None,
        "limitations": (
            "Findings are SQL-derived counts. Suggestions do not establish "
            "root causes. No database records were changed."
        ),
    }

    if not use_ai or priority is None:
        return outcome

    # This existing function rechecks SQL and verifies pseudonymous evidence.
    evidence = investigate_verified_rule(priority["rule"], table_name="customers")
    if (
        not isinstance(evidence, dict)
        or evidence.get("status") != "success"
        or evidence.get("verified") is not True
        or evidence.get("read_only", True) is not True
        or evidence.get("ai_used") is not False
        or evidence.get("pii_included") is not False
        or evidence.get("validation_method") != "deterministic_sql"
        or evidence.get("rule") != priority["rule"]
        or evidence.get("verified_issue_count") != priority["verified_issue_count"]
        or evidence.get("total_records") != validation["total_records"]
        or evidence.get("quality_score") != validation["quality_score"]
    ):
        raise RuntimeError("Verified evidence changed or is unavailable; AI skipped.")

    # The existing guardian function constructs its own allowlisted numerical
    # prompt. Never send `evidence["rows"]` or raw data to the model.
    guidance = investigate_rule_root_cause(evidence)
    if (
        not isinstance(guidance, dict)
        or guidance.get("status") != "success"
        or guidance.get("ai_used") is not True
        or guidance.get("pii_included_in_prompt") is not False
        or guidance.get("rule") != priority["rule"]
        or not isinstance(guidance.get("explanation"), str)
        or not guidance["explanation"].strip()
    ):
        raise RuntimeError("AI guidance could not be verified.")

    outcome["ai_used"] = True
    outcome["ai_calls"] = 1
    outcome["investigation"] = {
        "rule": evidence["rule"],
        "verified_issue_count": evidence["verified_issue_count"],
        "returned_evidence_rows": evidence.get("returned_rows", 0),
        "evidence_truncated": evidence.get("truncated", False),
        "finding": evidence.get("finding", ""),
    }
    outcome["ai_guidance"] = {
        "analysis_type": "ai_root_cause_hypotheses",
        "model": guidance.get("model", ""),
        "explanation": guidance["explanation"].strip(),
        "disclaimer": guidance.get("disclaimer", ""),
    }
    return outcome
