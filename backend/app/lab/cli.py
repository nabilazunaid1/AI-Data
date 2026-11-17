"""python -m app.lab.cli init-demo | run [--ai] | warehouse"""
import argparse
import json
import os
import sqlite3
from pathlib import Path
from app.lab.config import load_config
from app.lab.fixture import COLUMNS, write_fixture
from app.lab.service import run_quality


def initialize(config):
    rows = write_fixture(Path(__file__).resolve().parents[3] / 'sample-data')
    if config['adapter'] == 'sqlite':
        path = Path(config['sqlite_path'])
        path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(path) as db:
            definitions = ','.join('"'+c+'"' + (' INTEGER PRIMARY KEY' if c == 'record_id' else '') for c in COLUMNS)
            db.execute(f'CREATE TABLE IF NOT EXISTS "{config["table"]}" ({definitions})')
            db.executemany(f'INSERT OR IGNORE INTO "{config["table"]}" VALUES ({",".join("?" for _ in COLUMNS)})',
                           [tuple(r[c] for c in COLUMNS) for r in rows])
        db.close()
    else:
        import psycopg
        from psycopg import sql
        # Separate administrative URL used only by this explicit demo initialization.
        with psycopg.connect(os.environ['QUALITY_ADMIN_DATABASE_URL']) as db:
            db.execute(sql.SQL('CREATE SCHEMA IF NOT EXISTS {}').format(sql.Identifier(config['schema'])))
            table = sql.Identifier(config['schema'], config['table'])
            definitions = sql.SQL(',').join(sql.SQL('{} {}').format(sql.Identifier(c),
                sql.SQL('INTEGER PRIMARY KEY' if c == 'record_id' else 'TEXT')) for c in COLUMNS)
            db.execute(sql.SQL('CREATE TABLE IF NOT EXISTS {} ({})').format(table, definitions))
            statement = sql.SQL('INSERT INTO {} VALUES ({}) ON CONFLICT DO NOTHING').format(table,
                        sql.SQL(',').join(sql.Placeholder() for _ in COLUMNS))
            with db.cursor() as cursor:
                cursor.executemany(statement, [tuple(None if r[c] is None else str(r[c]) if c != 'record_id' else r[c] for c in COLUMNS) for r in rows])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['init-demo', 'run', 'warehouse'])
    parser.add_argument('--ai', action='store_true')
    args = parser.parse_args()
    if args.action == 'init-demo':
        initialize(load_config())
        print('Synthetic fixture initialized: 150 rows, 50 columns.')
    elif args.action == 'warehouse':
        import psycopg
        sql_path = Path(__file__).resolve().parents[3] / 'database' / 'quality_warehouse.sql'
        with psycopg.connect(os.environ['QUALITY_ADMIN_DATABASE_URL']) as db:
            db.execute(sql_path.read_text(encoding='utf-8'))
        print('Warehouse staging and mart views installed.')
    else:
        result = run_quality(use_ai=args.ai)
        print(json.dumps({'run_id': result['run_id'], 'sample_count': result['sample_count'],
                          'issue_count': result['validation']['issue_count'], 'ai_used': result['agent']['ai_used']}))


if __name__ == '__main__':
    main()
