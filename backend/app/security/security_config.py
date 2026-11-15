"""
AI Data Guardian 3.0
Security configuration.

Fails closed unless local development explicitly
permits disabled authorization.
"""

import os


def authorization_enabled() -> bool:
    environment = os.getenv(
        "GUARDIAN_ENV",
        "production",
    ).strip().lower()

    setting = os.getenv(
        "GUARDIAN_AUTH_ENABLED",
        "",
    ).strip().lower()

    valid_environments = {
        "development",
        "staging",
        "production",
    }

    if environment not in valid_environments:
        raise RuntimeError(
            "Invalid GUARDIAN_ENV configuration"
        )

    if environment in {"staging", "production"}:
        if setting != "true":
            raise RuntimeError(
                "Authorization must be enabled "
                "outside local development"
            )
        return True

    if setting == "true":
        return True

    if setting == "false":
        return False

    raise RuntimeError(
        "Development authorization setting "
        "must be explicitly configured"
    )
