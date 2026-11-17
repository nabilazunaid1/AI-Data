import json
import hashlib
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.lab.agent import execute_tools
from app.lab.config import load_config
from app.lab.engine import classify, digest, validate
from app.lab.fixture import COLUMNS, fixture_rows
from app.lab.service import artifact_path, run_quality
from app.lab.source import Source


class QualityLabTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = load_config()
        self.config.update(adapter='sqlite', sample_size=150,
            sqlite_path=str(Path(self.temp.name)/'source.sqlite'),
            output_dir=str(Path(self.temp.name)/'runs'))
        with sqlite3.connect(self.config['sqlite_path']) as db:
            db.execute('CREATE TABLE quality_fixture (' + ','.join('"'+c+'"' + (' INTEGER PRIMARY KEY' if c == 'record_id' else '') for c in COLUMNS) + ')')
            db.executemany('INSERT INTO quality_fixture VALUES (' + ','.join('?' for _ in COLUMNS) + ')',
                [tuple(r[c] for c in COLUMNS) for r in fixture_rows()])
        db.close()

    def test_full_fixture_faults_are_detected(self):
        rows = fixture_rows()
        self.assertEqual((len(rows), len(rows[0])), (150, 50))
        result = validate(rows, self.config)
        found = {(i['sample_row']+1, i['column'], i['rule']) for i in result['issues']}
        expected = {(2,'email','required'), (3,'email','unique'), (15,'email','unique'),
            (4,'phone','regex'), (5,'age','number'), (12,'age','number'),
            (8,'status','enum'), (9,'product_id','reference'), (10,'order_total','product'),
            (11,'email','regex'), (13,'event_date','date'), (14,'name','required'),
            (15,'*','duplicate_record')}
        self.assertEqual(found, expected)
        self.assertTrue(set(self.config['pii_columns']) <= set(classify(rows, self.config)))

    def test_run_artifacts_masking_corrections_and_hashes(self):
        report = run_quality(self.config)
        self.assertEqual(report['column_count'], 50)
        self.assertEqual(report['validation']['issue_count'], 13)
        self.assertEqual(len(report['anomalies']), 1)
        self.assertEqual(len(report['changes']), 1)
        self.assertEqual(report['changes'][0]['before'], ' central ')
        self.assertEqual(report['changes'][0]['after'], 'Central')
        self.assertEqual(report['agent']['mode'], 'deterministic')
        self.assertEqual(len(report['agent']['trace']), 5)
        root = Path(self.config['output_dir'])/report['run_id']
        manifest = json.loads((root/'manifest.json').read_text())
        for name, entry in manifest.items():
            self.assertEqual(digest((root/name).read_bytes()), entry['sha256'])
        text = (root/'masked.csv').read_text(encoding='utf-8-sig')
        for raw in ('example.invalid','Synthetic Person','4111111111111111','Example Street'):
            self.assertNotIn(raw, text)
        self.assertEqual(Source(self.config).lookup(7)['region'], ' central ')

    def test_sample_is_reproducible_and_sql_lookup_is_bound(self):
        self.config['sample_size'] = 100
        first, total = Source(self.config).sample()
        second, _ = Source(self.config).sample()
        self.assertEqual(first, second)
        self.assertEqual((len(first), total), (100, 150))
        self.assertIsNone(Source(self.config).lookup("1 OR 1=1"))

    def test_agent_executes_model_selected_order_and_rejects_unknown_tool(self):
        calls = []
        def choose(context):
            calls.append(context)
            return {'plan': list(reversed(context['available_tools'])), 'tool': context['available_tools'][-1]}
        report = run_quality(self.config, use_ai=True, decide=choose)
        self.assertEqual(report['agent']['trace'][0]['selected_tool'], 'verify_sql_row')
        self.assertEqual(len(calls), 5)
        with self.assertRaises(ValueError):
            execute_tools({'profile': lambda: {}}, True, lambda _: {'tool': 'DROP TABLE'})

    def test_failed_agent_publishes_no_success(self):
        with self.assertRaises(TimeoutError):
            run_quality(self.config, True, lambda _: (_ for _ in ()).throw(TimeoutError()))
        self.assertFalse(Path(self.config['output_dir']).exists())

    def test_artifact_traversal_rejected(self):
        with self.assertRaises(ValueError):
            artifact_path('../escape', 'report.json', self.config)

    def test_sqlite_source_is_read_only(self):
        with Source(self.config).snapshot() as db:
            with self.assertRaises(sqlite3.OperationalError):
                db.execute('DELETE FROM quality_fixture')

    def test_authorization_and_route_policy_coverage(self):
        from fastapi.testclient import TestClient
        from app.security.policy import API_ACCESS_POLICY
        with patch.dict(os.environ, {'GUARDIAN_ENV': 'development', 'GUARDIAN_AUTH_ENABLED': 'true',
            'GUARDIAN_OPERATOR_TOKEN_HASH': hashlib.sha256(b'unit-test-operator').hexdigest(),
            'GUARDIAN_READER_TOKEN_HASH': hashlib.sha256(b'unit-test-reader').hexdigest()}):
            from app.main import app
            for route, operations in app.openapi()['paths'].items():
                for method in operations:
                    if method in ('get', 'post'):
                        self.assertIn((method.upper(), route), API_ACCESS_POLICY)
            with TestClient(app) as client:
                self.assertEqual(client.post('/api/v1/quality/runs', json={}).status_code, 401)
                self.assertEqual(client.post('/api/v1/quality/runs', json={},
                    headers={'Authorization': 'Bearer unit-test-reader'}).status_code, 403)
                with patch('app.api.quality_lab_api.run_quality', return_value={'status':'completed'}):
                    self.assertEqual(client.post('/api/v1/quality/runs', json={},
                        headers={'Authorization': 'Bearer unit-test-operator'}).status_code, 200)


if __name__ == '__main__':
    unittest.main()
