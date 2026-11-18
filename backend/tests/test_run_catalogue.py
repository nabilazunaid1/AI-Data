import json
import sqlite3
import tempfile
import unittest
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from pathlib import Path
from unittest.mock import patch
from app.lab.config import load_config
from app.lab.datasets import dataset_config
from app.lab.engine import digest
from app.lab.fixture import COLUMNS, fixture_rows
from app.lab.service import run_quality, review_saved_run
from app.lab.source import Source
from app.lab.catalogue import list_runs, read_report, verified_artifact


class CatalogueTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.config=load_config()
        self.config.update(adapter='sqlite',sqlite_path=str(Path(self.temp.name)/'source.sqlite'),
            output_dir=str(Path(self.temp.name)/'runs'),sample_size=50)
        db=sqlite3.connect(self.config['sqlite_path'])
        try:
            db.execute('CREATE TABLE quality_fixture ('+','.join('"'+c+'"'+(' INTEGER PRIMARY KEY' if c=='record_id' else '') for c in COLUMNS)+')')
            db.executemany('INSERT INTO quality_fixture VALUES ('+','.join('?' for _ in COLUMNS)+')',
                [tuple(r[c] for c in COLUMNS) for r in fixture_rows()])
            db.execute('CREATE TABLE customers(customer_id TEXT PRIMARY KEY,name TEXT,email TEXT,phone TEXT,region TEXT,updated_at TEXT)')
            db.execute("INSERT INTO customers VALUES('C1','Synthetic Person',NULL,'bad','Central',NULL)")
            db.commit()
        finally:db.close()

    def test_all_origins_share_catalogue_and_ai_does_not_count_as_extraction(self):
        standard=run_quality(self.config)
        pipeline=run_quality({**self.config,'run_origin':'pipeline'})
        def decide(obs):return {'plan':obs['available_tools'],'tool':obs['available_tools'][0]}
        child=review_saved_run(standard['run_id'],decide=decide,config=self.config)
        with patch.object(Source,'snapshot',side_effect=AssertionError('Catalogue must not access source')):
            catalogue=list_runs('quality_source',self.config['schema'],self.config['table'],config=self.config)
        self.assertEqual(catalogue['summary']['saved_results'],3)
        self.assertEqual(catalogue['summary']['source_extractions'],2)
        self.assertEqual(catalogue['summary']['ai_reviews'],1)
        self.assertEqual(catalogue['latest']['run_id'],pipeline['run_id'])
        self.assertEqual({r['origin'] for r in catalogue['runs']},{'data_check','pipeline','ai_review'})
        self.assertEqual(child['validation'],standard['validation'])
        self.assertEqual(verified_artifact(pipeline['run_id'],'masked.csv',self.config).read_bytes(),
                         (Path(self.config['output_dir'])/pipeline['run_id']/'masked.csv').read_bytes())

    def test_delayed_ai_cannot_replace_a_newer_source_extraction(self):
        original=run_quality(self.config)
        db=sqlite3.connect(self.config['sqlite_path'])
        try:
            db.execute('UPDATE quality_fixture SET email=NULL');db.commit()
        finally:db.close()
        newer=run_quality({**self.config,'run_origin':'pipeline'})
        def decide(obs):return {'plan':obs['available_tools'],'tool':obs['available_tools'][0]}
        old_review=review_saved_run(original['run_id'],decide=decide,config=self.config)
        catalogue=list_runs('quality_source',self.config['schema'],self.config['table'],config=self.config)
        self.assertNotEqual(original['validation']['score'],newer['validation']['score'])
        self.assertEqual(catalogue['latest']['run_id'],newer['run_id'])
        self.assertEqual(catalogue['runs'][0]['run_id'],old_review['run_id'])
        new_review=review_saved_run(newer['run_id'],decide=decide,config=self.config)
        catalogue=list_runs('quality_source',self.config['schema'],self.config['table'],config=self.config)
        self.assertEqual(catalogue['latest']['run_id'],new_review['run_id'])
        self.assertEqual(catalogue['latest']['root_run_id'],newer['run_id'])
        self.assertEqual(new_review['extracted_at'],newer['extracted_at'])

    def publish_metadata(self, report):
        root=Path(self.config['output_dir'])/report['run_id'];root.mkdir()
        data=json.dumps(report).encode();(root/'report.json').write_bytes(data)
        (root/'manifest.json').write_text(json.dumps({'report.json':{'sha256':digest(data),'bytes':len(data)}}))

    def test_nested_schema_failures_are_skipped_without_breaking_good_runs(self):
        original=run_quality(self.config)
        invalid=[('validation',{}),('agent',{}),('sample_count',True),('created_at',100),('profiles',{})]
        for field,value in invalid:
            report=deepcopy(original);report.update(run_id=str(uuid4()),root_run_id=None)
            report[field]=value
            self.publish_metadata(report)
            with self.assertRaises(ValueError):read_report(report['run_id'],self.config)
        catalogue=list_runs('quality_source',self.config['schema'],self.config['table'],config=self.config)
        self.assertEqual(catalogue['latest']['run_id'],original['run_id'])
        self.assertEqual(catalogue['skipped_artifacts'],len(invalid))
        self.assertTrue(catalogue['warnings'])

    def test_cursor_pages_cover_more_than_100_results_without_duplicates(self):
        original=run_quality(self.config)
        for index in range(105):
            report=deepcopy(original);run_id=str(uuid4())
            stamp=(datetime.now(timezone.utc)+timedelta(seconds=index)).isoformat()
            report.update(run_id=run_id,root_run_id=run_id,created_at=stamp,extracted_at=stamp,row_reference_lookup=False)
            self.publish_metadata(report)
        seen=[];cursor=None
        while True:
            page=list_runs('quality_source',self.config['schema'],self.config['table'],limit=20,config=self.config,cursor=cursor)
            seen.extend(r['run_id'] for r in page['runs'])
            cursor=page['page']['next_cursor']
            if not cursor:break
        self.assertEqual(len(seen),106);self.assertEqual(len(set(seen)),106)
        first=list_runs('quality_source',self.config['schema'],self.config['table'],limit=1,config=self.config)
        with self.assertRaises(ValueError):
            list_runs('customer_source','public','products',config=self.config,cursor=first['page']['next_cursor'])

    def test_unassigned_legacy_reports_are_explained_without_hiding_current_verification_failures(self):
        current=run_quality(self.config)
        old=deepcopy(current);old.update(run_id=str(uuid4()),root_run_id=None)
        old.pop('dataset');old.pop('schema_version');self.publish_metadata(old)
        malformed=deepcopy(current);malformed.update(run_id=str(uuid4()),root_run_id=None)
        malformed.pop('dataset');self.publish_metadata(malformed)
        selected=list_runs('quality_source',self.config['schema'],self.config['table'],config=self.config)
        self.assertEqual(selected['latest']['run_id'],current['run_id'])
        self.assertEqual(selected['archive']['unassigned_reports'],[{'run_id':old['run_id'],'reason':'dataset_not_recorded'}])
        self.assertEqual(selected['archive']['unassigned_count'],1)
        self.assertEqual(selected['skipped_artifacts'],1)
        self.assertIn('failed verification',selected['warnings'][0])
        self.assertNotIn('inactive',selected['warnings'][0])
        path=Path(self.config['output_dir'])/old['run_id']/'report.json'
        content=path.read_bytes();path.write_bytes(content+b' ')
        selected=list_runs('quality_source',self.config['schema'],self.config['table'],config=self.config)
        self.assertEqual(selected['archive']['unassigned_count'],0)
        self.assertEqual(selected['skipped_artifacts'],2)
        self.assertTrue(path.exists())

    def test_assessment_hash_changes_only_with_assessment_criteria(self):
        first=run_quality(self.config)
        pipeline=run_quality({**self.config,'run_origin':'pipeline'})
        changed=run_quality({**self.config,'sample_seed':999})
        self.assertEqual(first['assessment']['hash'],pipeline['assessment']['hash'])
        self.assertNotEqual(first['assessment']['hash'],changed['assessment']['hash'])
        self.assertNotIn('sqlite_path',changed['assessment']['policy'])
        self.assertNotIn('output_dir',changed['assessment']['policy'])
        catalogue=list_runs('quality_source',self.config['schema'],self.config['table'],config=self.config)
        self.assertEqual([r['run_id'] for r in catalogue['trend']],[changed['run_id']])

    def test_api_failed_attempt_is_persisted_without_sensitive_error_text(self):
        from fastapi import HTTPException
        from app.api.quality_lab_api import RunRequest, run
        from app.lab.attempts import list_attempts
        with patch('app.api.quality_lab_api.dataset_config',return_value=self.config), \
             patch('app.api.quality_lab_api.run_quality',side_effect=RuntimeError('password=must-not-be-persisted')):
            with self.assertRaises(HTTPException):run(RunRequest())
        attempts=list_attempts('quality_source',self.config['schema'],self.config['table'],config=self.config)
        self.assertEqual(attempts['summary']['failed'],1)
        self.assertNotIn('must-not-be-persisted',json.dumps(attempts))
        self.assertEqual(attempts['attempts'][0]['error_code'],'quality_run_failed')

    def test_api_failed_ai_attempt_keeps_parent_and_records_lineage(self):
        from fastapi import HTTPException
        from app.lab.service import AIReviewError
        from app.api.quality_lab_api import ai_review
        from app.lab.attempts import list_attempts
        report=run_quality(self.config)
        with patch('app.api.quality_lab_api.load_config',return_value=self.config), \
             patch('app.api.quality_lab_api.review_saved_run',side_effect=AIReviewError('Model unavailable')):
            with self.assertRaises(HTTPException):ai_review(report['run_id'])
        attempts=list_attempts('quality_source',self.config['schema'],self.config['table'],config=self.config)
        self.assertEqual(attempts['attempts'][0]['parent_run_id'],report['run_id'])
        self.assertEqual(attempts['attempts'][0]['status'],'failed')
        self.assertEqual(read_report(report['run_id'],self.config)['validation'],report['validation'])

    def test_dataset_filters_prevent_mixing_connections_and_tables(self):
        fixture=run_quality(self.config)
        config=dataset_config('customer_source','public','customers')
        config.update(adapter='sqlite',sqlite_path=self.config['sqlite_path'],output_dir=self.config['output_dir'])
        customer=run_quality(config)
        selected=list_runs('customer_source','public','customers',config=self.config)
        self.assertEqual([r['run_id'] for r in selected['runs']],[customer['run_id']])
        self.assertEqual(selected['latest']['population_count'],1)
        empty=list_runs('customer_source','public','products',config=self.config)
        self.assertEqual(empty['runs'],[]);self.assertIsNone(empty['latest'])
        self.assertNotEqual(customer['dataset'],fixture['dataset'])

    def test_corrupt_and_archived_runs_are_not_presented_or_downloaded(self):
        report=run_quality(self.config)
        root=Path(self.config['output_dir'])/report['run_id']
        (root/'masked.csv').write_text('corrupt')
        with self.assertRaises(ValueError):verified_artifact(report['run_id'],'masked.csv',self.config)
        report['dataset'].update(connection_id='historical_source',schema='guardian_demo',table='historical_quality_fixture')
        data=json.dumps(report).encode();(root/'report.json').write_bytes(data)
        manifest=json.loads((root/'manifest.json').read_text())
        manifest['report.json']['sha256']=digest(data)
        (root/'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):read_report(report['run_id'],self.config)
        self.assertEqual(list_runs('quality_source',self.config['schema'],self.config['table'],config=self.config)['runs'],[])

    def test_archived_connections_and_routes_are_removed_from_deployment(self):
        from app.connectors.connection_registry import list_registered_connections
        self.assertEqual({c['id'] for c in list_registered_connections()},{'customer_source','quality_source'})
        with patch.dict('os.environ',{'GUARDIAN_ENV':'development','GUARDIAN_AUTH_ENABLED':'true'}):
            from app.main import app
        paths=app.openapi()['paths']
        self.assertFalse(any('/historical' in p or '/reconciliation' in p for p in paths))
        self.assertNotIn('/api/v1/pipeline/run',paths)
        self.assertNotIn('/api/v1/history/runs',paths)
        self.assertIn('/api/v1/quality/catalogue',paths)


if __name__=='__main__':unittest.main()
