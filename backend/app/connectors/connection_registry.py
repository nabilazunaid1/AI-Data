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


# Historical monitoring and reconciliation are archived, not part of deployment.
CONNECTIONS = {key: value for key, value in CONNECTIONS.items() if key == 'customer_source'}


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

    from app.lab.config import load_config
    config = load_config()
    result.append({
        'id': 'quality_source', 'name': 'Quality Sample Database',
        'engine': config['adapter'], 'purpose': 'data_quality',
        'capabilities': ['sample_validation', 'column_profiling', 'masked_export'],
        'configuration_status': 'configured' if config['adapter'] == 'sqlite' or os.getenv('QUALITY_DATABASE_URL') or
            (os.getenv('READER_DB_USER') and os.getenv('READER_DB_PASSWORD')) else 'not_configured',
        'connection_tested': False, 'read_only_operations': True,
        'tables': [{'schema': config['schema'], 'name': config['table']}],
    })
    return result


def get_registered_connection(connection_id):
    for connection in list_registered_connections():
        if connection["id"] == connection_id:
            return connection

    return None
