"""Explicit isolated-schema setup and live PostgreSQL evidence capture.

Run from backend: python -m scripts.verify_quality_postgres
Only quality_lab / quality_staging / quality_mart objects are created.
Existing application source tables are never changed.
"""
import json
import os
from pathlib import Path
import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from dotenv import load_dotenv
from app.lab.cli import initialize
from app.lab.config import load_config
from app.lab.service import run_quality
from app.lab.source import Source


def main():
    load_dotenv()
    os.environ['QUALITY_ADAPTER'] = 'postgresql'
    admin = os.getenv('QUALITY_ADMIN_DATABASE_URL') or make_conninfo(
        host=os.getenv('DB_HOST', '127.0.0.1'), port=os.getenv('DB_PORT', '5432'),
        dbname=os.getenv('DB_NAME', 'customer_db'), user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'])
    os.environ['QUALITY_ADMIN_DATABASE_URL'] = admin
    config = load_config()
    initialize(config)
    with psycopg.connect(admin) as db:
        db.execute(Path('../database/quality_warehouse.sql').read_text())
        reader = os.getenv('READER_DB_USER')
        if reader:
            db.execute(sql.SQL('GRANT USAGE ON SCHEMA quality_lab, quality_staging, quality_mart TO {}').format(sql.Identifier(reader)))
            db.execute(sql.SQL('GRANT SELECT ON ALL TABLES IN SCHEMA quality_lab, quality_staging, quality_mart TO {}').format(sql.Identifier(reader)))
    report = run_quality(config)
    assert report['sample_count'] < report['population_count'] == 150
    assert report['column_count'] == 50
    assert report['warehouse']['missing_email'] == 1
    assert report['warehouse']['duplicate_email'] == 2
    assert report['warehouse']['invalid_phone'] == 1
    assert Source(config).lookup('5')['age'] == '-8'
    summary = {key: report[key] for key in ('run_id','source_engine','sample_count','population_count','column_count','warehouse')}
    summary['issue_count'] = report['validation']['issue_count']
    summary['anomaly_count'] = len(report['anomalies'])
    summary['correction_count'] = len(report['changes'])
    Path('../docs/postgres-verification.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
