import json
import hashlib
import io
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
from app.lab.service import AIReviewError, artifact_path, run_quality, review_saved_run
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

    def test_correction_csv_has_ordered_headers_even_without_changes(self):
        import csv
        from app.lab.exports import CHANGE_FIELDS
        report = run_quality({**self.config, 'normalize': {}})
        content = (Path(self.config['output_dir'])/report['run_id']/'changes.csv').read_text(encoding='utf-8-sig')
        reader = csv.DictReader(io.StringIO(content))
        self.assertEqual(reader.fieldnames, list(CHANGE_FIELDS))
        self.assertEqual(list(reader), [])
        report = run_quality(self.config)
        content = (Path(self.config['output_dir'])/report['run_id']/'changes.csv').read_text(encoding='utf-8-sig')
        reader = csv.DictReader(io.StringIO(content))
        self.assertEqual(reader.fieldnames, list(CHANGE_FIELDS))
        self.assertEqual(next(reader)['applied_to'], 'output_only')

    def test_evidence_download_headers_and_bytes_remain_consistent(self):
        from app.api.quality_lab_api import download
        from app.lab.catalogue import read_report, verified_artifact
        from app.lab.exports import export_filename
        report = run_quality(self.config)
        with patch('app.api.quality_lab_api.read_report', side_effect=lambda run_id:read_report(run_id,self.config)), \
             patch('app.api.quality_lab_api.verified_artifact', side_effect=lambda run_id,name:verified_artifact(run_id,name,self.config)):
            for name in ('report.json','masked.csv','changes.csv','agent_trace.json','manifest.json'):
                response = download(report['run_id'], name)
                self.assertEqual(response.filename, export_filename(report,name))
                self.assertIn(f"{self.config['schema']}-{self.config['table']}", response.filename)
                self.assertIn('text/csv' if name.endswith('.csv') else 'application/json', response.media_type)
                self.assertEqual(response.headers['x-content-type-options'], 'nosniff')
                content = Path(response.path).read_bytes()
                if name != 'manifest.json':
                    manifest = json.loads((Path(response.path).parent/'manifest.json').read_text())
                    self.assertEqual(digest(content),manifest[name]['sha256'])

    def test_row_number_is_not_assumed_to_equal_record_key(self):
        db = sqlite3.connect(self.config['sqlite_path'])
        try:
            db.execute('UPDATE quality_fixture SET record_id=1005 WHERE record_id=5')
            db.commit()
        finally:
            db.close()
        source = Source(self.config)
        self.assertIsNone(source.lookup('5'))
        row, total = source.lookup_row_number(5)
        self.assertEqual((row['record_id'], total), (6, 150))
        self.assertEqual(source.lookup('1005')['age'], -8)
        self.assertIsNone(source.lookup_row_number(151)[0])
        for value in (0, -1, 1.5, True, '1 OR 1=1', 10001):
            with self.assertRaises(ValueError):
                source.lookup_row_number(value)

    def test_row_lookup_supports_text_keys_and_ordered_positions(self):
        from app.api.quality_lab_api import RowRequest, validate_row
        from fastapi import HTTPException
        db = sqlite3.connect(self.config['sqlite_path'])
        try:
            db.execute('CREATE TABLE customer_keys (customer_id TEXT PRIMARY KEY, email TEXT)')
            db.executemany('INSERT INTO customer_keys VALUES (?,?)', [('CUST-090','a@example.invalid'), ('CUST-010',None)])
            db.commit()
        finally:
            db.close()
        config = {**self.config, 'table':'customer_keys', 'key':'customer_id',
            'rules':[{'column':'email','kind':'required'}], 'duplicate_exclude':['customer_id']}
        with patch('app.api.quality_lab_api.dataset_config', return_value=config):
            result = validate_row(RowRequest(key='1', lookup_mode='row_number'))
            self.assertEqual(result['lookup']['row_number'], 1)
            self.assertEqual(result['lookup']['total_records'], 2)
            self.assertEqual(result['validation']['issue_count'], 1)
            self.assertEqual(result['masked_row']['customer_id'], '[MASKED]')
            self.assertEqual(validate_row(RowRequest(key='CUST-010'))['validation']['issue_count'], 1)
            with self.assertRaises(HTTPException) as missing:
                validate_row(RowRequest(key='1', lookup_mode='key'))
            self.assertEqual(missing.exception.status_code, 404)
            self.assertIn('exact source key', missing.exception.detail)
            for value in ('0','-1','1.5','1 OR 1=1'):
                with self.assertRaises(HTTPException) as invalid:
                    validate_row(RowRequest(key=value, lookup_mode='row_number'))
                self.assertEqual(invalid.exception.status_code, 400)
            with self.assertRaises(HTTPException) as out_of_range:
                validate_row(RowRequest(key='3', lookup_mode='row_number'))
            self.assertEqual(out_of_range.exception.status_code, 404)
            self.assertIn('1 to 2', out_of_range.exception.detail)

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
        with self.assertRaises(AIReviewError):
            run_quality(self.config, True, lambda _: (_ for _ in ()).throw(TimeoutError()))
        self.assertFalse(Path(self.config['output_dir']).exists())

    def test_ai_failure_keeps_standard_results_and_downloads(self):
        report = run_quality(self.config)
        root = Path(self.config['output_dir']) / report['run_id']
        before = {p.name: p.read_bytes() for p in root.iterdir()}
        with self.assertRaises(AIReviewError):
            review_saved_run(report['run_id'], config=self.config,
                decide=lambda _: (_ for _ in ()).throw(TimeoutError()))
        self.assertEqual(before, {p.name: p.read_bytes() for p in root.iterdir()})
        self.assertEqual(len([p for p in root.parent.iterdir() if not p.name.startswith('.')]), 1)
        self.assertEqual(json.loads((root/'report.json').read_text())['validation']['issue_count'], 13)

    def test_saved_ai_review_preserves_evidence_without_source_reread(self):
        report = run_quality(self.config)
        def choose(observation):
            plan = list(reversed(observation['available_tools']))
            return {'plan': plan, 'tool': plan[0]}
        with patch.object(Source, 'sample', side_effect=AssertionError('Must not re-extract source')):
            child = review_saved_run(report['run_id'], decide=choose, config=self.config)
        self.assertEqual(child['parent_run_id'], report['run_id'])
        self.assertEqual(child['dataset'], report['dataset'])
        self.assertEqual(child['validation'], report['validation'])
        self.assertTrue(child['agent']['ai_used'])
        self.assertEqual(child['agent']['scope'], 'saved_verified_evidence')
        root = Path(self.config['output_dir'])
        for name in ('masked.csv', 'changes.csv'):
            self.assertEqual((root/report['run_id']/name).read_bytes(), (root/child['run_id']/name).read_bytes())
        self.assertFalse(json.loads((root/report['run_id']/'report.json').read_text())['agent']['ai_used'])

    def test_protected_reference_resolves_exact_row_without_storing_source_keys(self):
        from app.lab.row_references import resolve_reference
        report=run_quality(self.config)
        reference=next(i['row_ref'] for i in report['validation']['issues'] if i['column']=='email' and i['rule']=='required')
        row,changed=resolve_reference(self.config,report['run_id'],reference)
        self.assertEqual(row['record_id'],2);self.assertFalse(changed)
        private=json.loads((Path(self.config['output_dir'])/report['run_id']/'.row-references.json').read_text())
        self.assertEqual(set(private['payload']['rows'][reference]),{'key_hash','row_hash'})
        self.assertNotIn('example.invalid',json.dumps(private))
        db=sqlite3.connect(self.config['sqlite_path'])
        try:
            db.execute("UPDATE quality_fixture SET email='restored@example.invalid' WHERE record_id=2");db.commit()
        finally:db.close()
        row,changed=resolve_reference(self.config,report['run_id'],reference)
        self.assertEqual(row['record_id'],2);self.assertTrue(changed)

    def test_protected_row_api_masks_values_and_uses_original_assessment(self):
        from app.api.quality_lab_api import ReferenceRequest,validate_reference
        from app.lab.catalogue import read_report,root_report
        report=run_quality(self.config)
        reference=next(i['row_ref'] for i in report['validation']['issues'] if i['column']=='email' and i['rule']=='required')
        with patch('app.api.quality_lab_api.read_report',side_effect=lambda run_id:read_report(run_id,self.config)), \
             patch('app.api.quality_lab_api.root_report',side_effect=lambda saved:root_report(saved,self.config)), \
             patch('app.api.quality_lab_api.dataset_config',return_value={**self.config}):
            result=validate_reference(report['run_id'],ReferenceRequest(row_ref=reference))
        self.assertEqual(result['row_ref'],reference)
        self.assertEqual(result['validation']['issue_count'],1)
        self.assertEqual(result['masked_row']['record_id'],'[MASKED]')
        self.assertIsNone(result['masked_row']['email'])

    def test_protected_mapping_tamper_and_cross_run_reference_are_rejected(self):
        from app.lab.row_references import resolve_reference
        report=run_quality(self.config);other=run_quality(self.config)
        reference=report['validation']['issues'][0]['row_ref']
        with self.assertRaises(KeyError):resolve_reference(self.config,other['run_id'],reference)
        path=Path(self.config['output_dir'])/report['run_id']/'.row-references.json'
        private=json.loads(path.read_text());private['payload']['rows'][reference]['key_hash']='0'*64
        path.write_text(json.dumps(private))
        with self.assertRaises(ValueError):resolve_reference(self.config,report['run_id'],reference)

    def test_ai_cannot_inspect_corrupt_evidence(self):
        report = run_quality(self.config)
        path = Path(self.config['output_dir'])/report['run_id']/'report.json'
        path.write_text('{}')
        with patch('app.lab.service.execute_tools') as agent:
            with self.assertRaises(ValueError):
                review_saved_run(report['run_id'], config=self.config)
            agent.assert_not_called()

    def test_model_action_is_first_step_of_its_plan(self):
        from app.lab.agent import ollama_decision
        reply = io.BytesIO(json.dumps({'done': True, 'done_reason': 'stop',
            'response': json.dumps({'plan': ['validate', 'profile']})}).encode())
        with patch('urllib.request.urlopen', return_value=reply):
            choice = ollama_decision({'available_tools': ['profile','validate'], 'observations':{}})
        self.assertEqual(choice, {'plan':['validate','profile'], 'tool':'validate'})

    def test_dataset_selection_rejects_cross_connection_and_unknown_tables(self):
        from app.lab.datasets import dataset_config
        customers = dataset_config('customer_source', 'public', 'customers')
        products = dataset_config('customer_source', 'public', 'products')
        self.assertEqual((customers['table'], products['key']), ('customers', 'product_id'))
        self.assertFalse(customers['warehouse_enabled'])
        for args in [('customer_source','guardian_demo','historical_quality_fixture'),
                     ('historical_source','guardian_demo','historical_quality_fixture'),
                     ('historical_source','public','customers'),
                     ('reconciliation_target','public','customers'),
                     ('unknown','public','customers')]:
            with self.assertRaises(ValueError):
                dataset_config(*args)

    def test_api_ai_failure_returns_completed_standard_results(self):
        from app.api.quality_lab_api import RunRequest, run
        with patch('app.api.quality_lab_api.dataset_config', return_value=self.config), \
             patch('app.api.quality_lab_api.review_saved_run', side_effect=AIReviewError('Model unavailable')):
            report = run(RunRequest(use_ai=True))
        self.assertEqual(report['status'], 'completed')
        self.assertEqual(report['validation']['issue_count'], 13)
        self.assertFalse(report['agent']['ai_used'])
        self.assertEqual(report['ai_review']['status'], 'unavailable')
        self.assertTrue((Path(self.config['output_dir'])/report['run_id']/'masked.csv').is_file())

    def test_customer_connection_never_uses_quality_database_url(self):
        from app.lab.datasets import dataset_config
        config = dataset_config('customer_source','public','customers')
        fake_db = unittest.mock.MagicMock()
        with patch.dict(os.environ, {'QUALITY_DATABASE_URL':'postgresql://wrong-database'}), \
             patch('app.validation.customer_rules.reader_database_config', return_value={'dbname':'selected_customer_db'}), \
             patch('psycopg.connect', return_value=fake_db) as connect:
            with Source(config).snapshot():
                pass
        self.assertEqual(connect.call_args.kwargs['dbname'], 'selected_customer_db')
        self.assertFalse(connect.call_args.args)

    def test_api_run_and_row_use_same_selected_dataset(self):
        from app.api.quality_lab_api import RunRequest, RowRequest, run, validate_row
        config = {**self.config, 'connection_id':'customer_source', 'connection_name':'Selected database'}
        with patch('app.api.quality_lab_api.dataset_config', return_value=config) as resolve:
            report = run(RunRequest(connection_id='customer_source', schema_name='public', table_name='quality_fixture'))
            resolve.assert_called_with('customer_source','public','quality_fixture')
            self.assertEqual(report['dataset']['connection_id'], 'customer_source')
            row = validate_row(RowRequest(connection_id='customer_source', schema_name='public', table_name='quality_fixture', key='5'))
            self.assertEqual(row['validation']['issue_count'], 1)

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
                self.assertEqual(client.post('/api/v1/quality/runs/00000000-0000-0000-0000-000000000000/validate-reference',
                    json={'row_ref':'a'*24},headers={'Authorization':'Bearer unit-test-reader'}).status_code,403)
                with patch('app.api.quality_lab_api.run_quality', return_value={'status':'completed'}), \
                     patch('app.api.quality_lab_api.dataset_config', return_value=self.config):
                    self.assertEqual(client.post('/api/v1/quality/runs', json={},
                        headers={'Authorization': 'Bearer unit-test-operator'}).status_code, 200)


if __name__ == '__main__':
    unittest.main()
