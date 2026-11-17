"""
AI Data Guardian 3.0
Centralized API authorization policy.

Policy definitions only.
Existing API endpoints are not modified or protected here.
"""

from typing import Literal

AccessLevel = Literal[
    "public",
    "authenticated",
    "reader",
    "operator",
    "admin",
]

API_ACCESS_POLICY: dict[tuple[str, str], AccessLevel] = {
    ("POST", "/api/v1/quality/runs"): "operator",
    ("GET", "/api/v1/quality/runs/{run_id}/{artifact}"): "reader",
    ("POST", "/api/v1/quality/validate-row"): "operator",
    ("POST", "/api/v1/ai/quality-review"): "operator",
    ("POST", "/api/v1/ai/investigate-rule/{rule_name}"): "operator",
    ("POST", "/api/v1/reconciliation/run"): "operator",
    ("POST", "/api/v1/pipeline/historical/run"): "operator",
    ("GET", "/api/v1/connections"): "reader",
    ("GET", "/api/v1/connections/{connection_id}"): "reader",
    ("GET", "/api/v1/historical/health"): "reader",
    ("GET", "/api/v1/historical/schema"): "reader",
    ("GET", "/api/v1/historical/trend"): "reader",
    ("GET", "/api/v1/historical/anomalies"): "reader",
    ("GET", "/api/v1/historical-history/runs"): "reader",
    ("GET", "/api/v1/historical-history/runs/{run_id}"): "reader",
    ("GET", "/"): "public",

    ("GET", "/api/v1/health"): "public",
    ("GET", "/api/v1/database/health"): "public",

    ("GET", "/api/v1/auth/me"): "authenticated",

    ("GET", "/api/v1/database/tables"): "reader",
    ("GET", "/api/v1/database/tables/{table_name}/preview"): "reader",

    ("GET", "/api/v1/evidence/customers"): "reader",
    ("GET", "/api/v1/evidence/customers/rules/{rule_name}"): "reader",

    ("GET", "/api/v1/history/runs"): "reader",
    ("GET", "/api/v1/history/runs/{run_id}"): "reader",
    ("GET", "/api/v1/history/summary"): "reader",

    ("GET", "/api/v1/validation/customers"): "reader",
    ("GET", "/api/v1/validation/tables/{table_name}"): "reader",

    ("POST", "/api/v1/ai/chat/{table_name}"): "operator",
    ("POST", "/api/v1/ai/investigate/{table_name}"): "operator",

    ("POST", "/api/v1/pipeline/download/csv"): "operator",
    ("POST", "/api/v1/pipeline/run"): "operator",

    ("POST", "/api/v1/sql/execute"): "admin",
}


def get_access_level(method: str, path: str) -> AccessLevel:
    """
    Return the assigned minimum access level.

    Unregistered operations are rejected rather than
    accidentally receiving public access.
    """
    key = (method.upper(), path)

    if key not in API_ACCESS_POLICY:
        raise ValueError(
            f"No authorization policy for {method.upper()} {path}"
        )

    return API_ACCESS_POLICY[key]
