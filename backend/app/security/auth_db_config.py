"""
AI Data Guardian 3.0
Dedicated PostgreSQL authentication configuration.

Uses existing database host, port and database name.
Requires a separate authentication database account.

No database connection is opened by this module.
"""

import os


def auth_database_config() -> dict:
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    dbname = os.getenv("DB_NAME")

    user = os.getenv("AUTH_DB_USER")
    password = os.getenv("AUTH_DB_PASSWORD")

    if not dbname:
        raise RuntimeError(
            "DB_NAME is not configured"
        )

    if not user:
        raise RuntimeError(
            "AUTH_DB_USER is not configured"
        )

    if not password:
        raise RuntimeError(
            "AUTH_DB_PASSWORD is not configured"
        )

    return {
        "host": host,
        "port": port,
        "dbname": dbname,
        "user": user,
        "password": password,
        "connect_timeout": 5,
    }
