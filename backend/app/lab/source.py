"""SQL adapters. Implement Source.sample/lookup to add another database engine."""
import os
import hmac
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
            if c.get('connection_id', 'quality_source') == 'quality_source' and os.getenv('QUALITY_DATABASE_URL'):
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

    def lookup_row_number(self, row_number):
        """One-based position in the current source, ordered by configured key.

        This is distinct from a key lookup or a position in the random sample.
        Count and row retrieval share one read-only snapshot.
        """
        if type(row_number) is not int or not 1 <= row_number <= 10000:
            raise ValueError('Row number must be between 1 and 10000.')
        key = '"' + self.config['key'].replace('"', '""') + '"'
        placeholder = '?' if self.config['adapter'] == 'sqlite' else '%s'
        with self.snapshot() as db:
            total = db.execute(f'SELECT COUNT(*) AS n FROM {self.table_sql()}').fetchone()['n']
            row = None
            if row_number <= total:
                row = db.execute(f'SELECT * FROM {self.table_sql()} ORDER BY {key} LIMIT {placeholder} OFFSET {placeholder}',
                                 (1, row_number - 1)).fetchone()
        return (dict(row) if row else None), total

    def lookup_hashed_key(self, expected, hasher):
        """Resolve a private reference within one bounded read-only snapshot."""
        key = '"' + self.config['key'].replace('"', '""') + '"'
        placeholder = '?' if self.config['adapter'] == 'sqlite' else '%s'
        with self.snapshot() as db:
            keys = db.execute(f'SELECT {key} FROM {self.table_sql()} ORDER BY {key} LIMIT 10001').fetchall()
            if len(keys) > 10000:
                raise ValueError('Reference resolution exceeds the prototype source cap')
            matches = [record[self.config['key']] for record in keys
                       if hmac.compare_digest(expected, hasher(record[self.config['key']]))]
            if len(matches) > 1:
                raise ValueError('Source key is no longer unique')
            if not matches:
                return None
            row = db.execute(f'SELECT * FROM {self.table_sql()} WHERE {key} = {placeholder}', (matches[0],)).fetchone()
        return dict(row) if row else None

    def warehouse_summary(self):
        if self.config['adapter'] != 'postgresql':
            return {'assessment': 'not_applicable', 'finding_count': 0}
        # The demo warehouse view contains aggregates only. Its SQL is versioned.
        with self.snapshot() as db:
            result = dict(db.execute('SELECT * FROM quality_mart.quality_summary').fetchone())
        return {**result, 'finding_count': sum(result[k] for k in ('missing_email', 'invalid_phone', 'duplicate_email'))}
