"""SQL adapters. Implement Source.sample/lookup to add another database engine."""
import os
import random
import sqlite3
from contextlib import contextmanager
from pathlib import Path


class Source:
    def __init__(self, config):
        self.config = config

    @contextmanager
    def snapshot(self):
        c = self.config
        if c['adapter'] == 'sqlite':
            path = Path(c['sqlite_path']).resolve()
            db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
            db.row_factory = sqlite3.Row
            db.execute('BEGIN')
        else:
            import psycopg
            from psycopg.rows import dict_row
            if os.getenv('QUALITY_DATABASE_URL'):
                db = psycopg.connect(os.environ['QUALITY_DATABASE_URL'], row_factory=dict_row,
                    connect_timeout=5, options='-c statement_timeout=10000')
            else:
                from app.validation.customer_rules import reader_database_config
                db = psycopg.connect(**reader_database_config(), row_factory=dict_row,
                    options='-c statement_timeout=10000')
            db.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        try:
            yield db
        finally:
            db.rollback()
            db.close()

    def table_sql(self):
        # Quote every trusted identifier; never interpolate client SQL.
        quote = lambda s: '"' + s.replace('"', '""') + '"'
        c = self.config
        return (quote(c['schema']) + '.' if c['adapter'] == 'postgresql' else '') + quote(c['table'])

    def sample(self):
        c = self.config
        key = '"' + c['key'].replace('"', '""') + '"'
        with self.snapshot() as db:
            total = db.execute(f'SELECT COUNT(*) AS n FROM {self.table_sql()}').fetchone()['n']
            if total > 10000:
                raise ValueError('Prototype population cap is 10000; use a server-side sampling adapter.')
            rows = [dict(r) for r in db.execute(f'SELECT * FROM {self.table_sql()} ORDER BY {key}').fetchall()]
        if len({str(r[c['key']]) for r in rows}) != len(rows):
            raise ValueError('Configured sampling key must be unique.')
        return random.Random(c['sample_seed']).sample(rows, min(c['sample_size'], len(rows))), total

    def lookup(self, key_value):
        key = '"' + self.config['key'].replace('"', '""') + '"'
        placeholder = '?' if self.config['adapter'] == 'sqlite' else '%s'
        with self.snapshot() as db:
            row = db.execute(f'SELECT * FROM {self.table_sql()} WHERE {key} = {placeholder}', (key_value,)).fetchone()
        return dict(row) if row else None

    def warehouse_summary(self):
        if self.config['adapter'] != 'postgresql':
            return {'assessment': 'not_applicable', 'finding_count': 0}
        # The demo warehouse view contains aggregates only. Its SQL is versioned.
        with self.snapshot() as db:
            result = dict(db.execute('SELECT * FROM quality_mart.quality_summary').fetchone())
        return {**result, 'finding_count': sum(result[k] for k in ('missing_email', 'invalid_phone', 'duplicate_email'))}
