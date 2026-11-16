"""
AI Data Guardian 3.0
Independent PostgreSQL source and target connections.

Source:
    Reuses the existing PostgreSQL reader configuration.

Target:
    Requires explicitly configured TARGET_DB_* variables.

Security:
    - No credentials returned through public APIs
    - No credentials printed or logged
    - No direct frontend-supplied credentials
    - Missing target configuration fails closed
    - Same database target is rejected by default
"""

import os

from app.validation.customer_rules import (
    reader_database_config,
)


TARGET_VARIABLES = {
    "host": "TARGET_DB_HOST",
    "port": "TARGET_DB_PORT",
    "dbname": "TARGET_DB_NAME",
    "user": "TARGET_DB_USER",
    "password": "TARGET_DB_PASSWORD",
}


def source_database_config():
    """
    Return the existing trusted read-only
    source database connection configuration.
    """

    config = reader_database_config()

    if not isinstance(config, dict):
        raise RuntimeError(
            "Source database configuration is invalid."
        )

    return dict(config)


def target_database_config():
    """
    Return a separately configured target
    PostgreSQL connection.

    Credentials must come from trusted
    backend environment variables.
    """

    missing = [
        variable
        for variable in TARGET_VARIABLES.values()
        if not os.environ.get(variable)
    ]

    if missing:
        raise RuntimeError(
            "Target database is not configured. "
            "Missing required TARGET_DB_* settings."
        )

    config = {
        field: os.environ[variable]
        for field, variable in TARGET_VARIABLES.items()
    }

    try:
        port = int(config["port"])
    except ValueError as error:
        raise ValueError(
            "Invalid target database port."
        ) from error

    if not 1 <= port <= 65535:
        raise ValueError(
            "Target database port is out of range."
        )

    config["port"] = port

    return config


def independent_database_configs():
    """
    Return trusted source and target configurations.

    Reject a configuration that points to the
    same host, port and database name.

    This checks configuration identity, not
    physical server identity or database aliases.
    """

    source = source_database_config()
    target = target_database_config()

    def identity(config):
        return (
            str(config.get("host", "")).strip().lower(),
            str(config.get("port", "5432")),
            str(
                config.get(
                    "dbname",
                    config.get("database", ""),
                )
            ).strip().lower(),
        )

    if identity(source) == identity(target):
        raise ValueError(
            "Source and target must reference "
            "different database endpoints."
        )

    return source, target
