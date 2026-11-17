"""Approved connection metadata for AI Data Guardian.

Configuration status is not a connectivity test.
Never return credentials or connection strings.
"""

import os


CONNECTIONS = {
    "customer_source": {
        "name": "Customer Database",
        "engine": "postgresql",
        "purpose": "data_quality",
        "capabilities": [
            "schema_discovery",
            "masked_preview",
            "sql_validation",
        ],
        "required_env": [
            "READER_DB_USER",
            "READER_DB_PASSWORD",
        ],
        "tables": [
            {"schema": "public", "name": "customers"},
            {"schema": "public", "name": "transactions"},
            {"schema": "public", "name": "products"},
            {"schema": "public", "name": "dim_region"},
            {"schema": "public", "name": "etl_logs"},
        ],
    },
    "historical_source": {
        "name": "Historical Database",
        "engine": "postgresql",
        "purpose": "historical_monitoring",
        "capabilities": [
            "schema_discovery",
            "historical_aggregation",
            "statistical_anomaly_detection",
        ],
        "required_env": [
            "HISTORY_SOURCE_DB_HOST",
            "HISTORY_SOURCE_DB_PORT",
            "HISTORY_SOURCE_DB_NAME",
            "HISTORY_SOURCE_DB_USER",
            "HISTORY_SOURCE_DB_PASSWORD",
        ],
        "tables": [
            {
                "schema": "guardian_demo",
                "name": "historical_quality_fixture",
            },
        ],
    },
    "reconciliation_target": {
        "name": "Reconciliation Target",
        "engine": "postgresql",
        "purpose": "reconciliation_only",
        "capabilities": [
            "approved_reconciliation",
        ],
        "required_env": [
            "TARGET_DB_HOST",
            "TARGET_DB_PORT",
            "TARGET_DB_NAME",
            "TARGET_DB_USER",
            "TARGET_DB_PASSWORD",
        ],
        "tables": [],
    },
}


def list_registered_connections():
    result = []

    for connection_id, definition in CONNECTIONS.items():
        configured = all(
            bool(os.getenv(key))
            for key in definition["required_env"]
        )

        result.append({
            "id": connection_id,
            "name": definition["name"],
            "engine": definition["engine"],
            "purpose": definition["purpose"],
            "capabilities": list(definition["capabilities"]),
            "configuration_status": (
                "configured" if configured else "not_configured"
            ),
            "connection_tested": False,
            "read_only_operations": True,
            "tables": [
                dict(item) for item in definition["tables"]
            ],
        })

    return result


def get_registered_connection(connection_id):
    for connection in list_registered_connections():
        if connection["id"] == connection_id:
            return connection

    return None
