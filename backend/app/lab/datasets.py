"""Resolve a review to the selected registered connection and approved table."""
from app.connectors.connection_registry import get_registered_connection
from app.lab.config import load_config

KEYS = {'customers': 'customer_id', 'transactions': 'transaction_id', 'products': 'product_id',
        'dim_region': 'region_id', 'etl_logs': 'log_id', 'historical_quality_fixture': 'record_id'}


def dataset_config(connection_id='quality_source', schema=None, table=None):
    connection = get_registered_connection(connection_id)
    if connection is None or connection['purpose'] == 'reconciliation_only':
        raise ValueError('Select a registered connection that supports data-quality checks.')
    tables = connection['tables']
    if not tables:
        raise ValueError('No approved tables are configured for this connection.')
    schema = schema or tables[0]['schema']
    table = table or tables[0]['name']
    if not any(t['schema'] == schema and t['name'] == table for t in tables):
        raise ValueError('This table is not approved for the selected connection.')
    config = load_config()
    if connection_id != 'quality_source':
        rules = []
        if table == 'customers':
            rules = [{'column': 'email', 'kind': 'required'}, {'column': 'email', 'kind': 'unique'},
                     {'column': 'email', 'kind': 'regex', 'pattern': r'[^\s@]+@[^\s@]+\.[^\s@]+'},
                     {'column': 'phone', 'kind': 'regex', 'pattern': r'[0-9]{10,11}'}]
        elif table == 'products':
            rules = [{'column': c, 'kind': 'required'} for c in ('product_name', 'category')]
            rules += [{'column': 'product_name', 'kind': 'unique'}, {'column': 'price', 'kind': 'number', 'min': 0, 'max': 1e12}]
        elif table == 'transactions':
            rules = [{'column': c, 'kind': 'required'} for c in ('customer_id', 'product_id', 'transaction_date')]
            rules += [{'column': c, 'kind': 'number', 'min': 0.000001, 'max': 1e12} for c in ('quantity', 'amount')]
        elif table == 'dim_region':
            rules = [{'column': c, 'kind': 'required'} for c in ('region_name', 'region_code')]
            rules += [{'column': 'region_code', 'kind': 'unique'}, {'column': 'region_code', 'kind': 'regex', 'pattern': '[A-Z]{3}'}]
        elif table == 'etl_logs':
            rules = [{'column': c, 'kind': 'required'} for c in ('pipeline_name', 'status', 'started_at')]
            rules += [{'column': 'records_processed', 'kind': 'number', 'min': 0, 'max': 1e12}]
        elif table == 'historical_quality_fixture':
            rules = [{'column': 'quality_score', 'kind': 'number', 'min': 0, 'max': 100},
                     {'column': 'event_timestamp', 'kind': 'required'}]
        key = KEYS[table]
        config.update(adapter='postgresql', rules=rules, key=key, duplicate_exclude=[key],
            normalize={}, outlier_columns={'transactions': ['amount'], 'products': ['price'],
                'historical_quality_fixture': ['processing_time_ms', 'queue_wait_ms']}.get(table, []),
            pii_columns={c: c for c in ('name', 'email', 'phone', 'customer_id')}, warehouse_enabled=False)
    config.update(connection_id=connection_id, connection_name=connection['name'], schema=schema, table=table)
    return config


def source_context(config):
    from app.lab.source import Source
    source = Source(config)
    with source.snapshot() as db:
        count = db.execute(f'SELECT COUNT(*) AS n FROM {source.table_sql()}').fetchone()['n']
        cursor = db.execute(f'SELECT * FROM {source.table_sql()} WHERE 1=0')
        columns = [item[0] for item in cursor.description]
        if config['key'] not in columns:
            raise ValueError('Configured row key is not present in the selected table.')
    return {'connection_id': config['connection_id'], 'connection_name': config['connection_name'],
        'schema': config['schema'], 'table': config['table'], 'engine': config['adapter'],
        'status': 'connected', 'population_count': count, 'column_count': len(columns),
        'sample_size': min(count, config['sample_size']), 'key_column': config['key']}
