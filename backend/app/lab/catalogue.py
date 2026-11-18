"""Canonical catalogue of immutable, integrity-checked quality run artifacts."""
import json
import logging
import base64
from datetime import datetime
from pathlib import Path
from app.lab.config import load_config
from app.lab.engine import digest
from app.lab.service import ARTIFACTS, artifact_path
from app.connectors.connection_registry import list_registered_connections
from app.lab.report_schema import validate_report

logger = logging.getLogger(__name__)


class InactiveDatasetError(ValueError):
    pass


class UnassignedReportError(ValueError):
    """An older verified report cannot be assigned without dataset metadata."""
    pass


def active_dataset(dataset):
    return any(connection['id'] == dataset.get('connection_id') and
        any(table['schema'] == dataset.get('schema') and table['name'] == dataset.get('table')
            for table in connection['tables']) for connection in list_registered_connections())


def _read_report(run_id, config=None):
    path = artifact_path(run_id, 'report.json', config)
    data = path.read_bytes()
    manifest = json.loads((path.parent/'manifest.json').read_text(encoding='utf-8'))
    if digest(data) != manifest['report.json']['sha256']:
        raise ValueError('Report integrity check failed.')
    report = json.loads(data)
    if isinstance(report, dict) and 'dataset' not in report and 'schema_version' not in report:
        raise UnassignedReportError('Saved report has no dataset metadata')
    if not isinstance(report, dict) or not isinstance(report.get('dataset'), dict):
        raise ValueError('Invalid report structure')
    if not active_dataset(report['dataset']):
        raise InactiveDatasetError('Dataset is archived or inactive')
    if report.get('run_id') != run_id or report.get('status') != 'completed':
        raise ValueError('Run is not in the active catalogue.')
    validate_report(report)
    return report


def read_report(run_id, config=None):
    try:
        return _read_report(run_id, config)
    except (OSError, KeyError, TypeError, AttributeError, OverflowError):
        raise ValueError('Saved report is missing or structurally invalid') from None


def root_report(report, config=None):
    seen = set()
    identity = lambda r: tuple(r['dataset'][k] for k in ('connection_id','schema','table'))
    target = identity(report)
    node = report
    while node.get('parent_run_id'):
        if node['run_id'] in seen:
            raise ValueError('Cyclic report lineage')
        seen.add(node['run_id'])
        node = read_report(node['parent_run_id'], config)
        if identity(node) != target:
            raise ValueError('Report lineage crosses datasets')
    if report.get('root_run_id', node['run_id']) != node['run_id']:
        raise ValueError('Invalid extraction lineage')
    return node


def assessment_hash(report):
    return (report.get('assessment') or {}).get('hash', 'legacy-unversioned')


def sort_key(record):
    return (datetime.fromisoformat(record['created_at']).timestamp(), record.get('attempt_id') or record.get('run_id', ''))


def paginate(records, dataset, limit, cursor=None, kind='runs'):
    if not 1 <= limit <= 100:
        raise ValueError('Page size must be 1..100')
    scope = [kind, *dataset]
    if cursor:
        try:
            if len(cursor) > 4096:
                raise ValueError()
            value = json.loads(base64.urlsafe_b64decode(cursor.encode()))
            if value['scope'] != scope or len(value['before']) != 2:
                raise ValueError()
            before = tuple(value['before'])
            records = [r for r in records if sort_key(r) < before]
        except Exception:
            raise ValueError('Invalid cursor for the selected dataset') from None
    page = records[:limit]
    next_cursor = None
    if len(records) > limit and page:
        next_cursor = base64.urlsafe_b64encode(json.dumps({'scope': scope, 'before': sort_key(page[-1])}).encode()).decode()
    return page, {'limit': limit, 'returned_count': len(page), 'has_more': next_cursor is not None, 'next_cursor': next_cursor}


def summary_record(report):
    return {'run_id': report['run_id'], 'parent_run_id': report.get('parent_run_id'),
        'root_run_id': report.get('root_run_id'), 'extracted_at': report.get('extracted_at', report['created_at']),
        'assessment_hash': assessment_hash(report),
        'origin': report.get('origin', 'ai_review' if report.get('parent_run_id') else 'data_check'),
        'created_at': report['created_at'], 'status': report['status'], 'dataset': report['dataset'],
        'quality_score': report['validation']['score'], 'issue_count': report['validation']['issue_count'],
        'sample_count': report['sample_count'], 'population_count': report['population_count'],
        'column_count': report['column_count'], 'ai_used': report['agent']['ai_used'],
        'anomaly_count': len(report['anomalies']), 'correction_count': len(report['changes'])}


def list_runs(connection_id, schema, table, limit=100, config=None, cursor=None):
    if not 1 <= limit <= 100:
        raise ValueError('Catalogue limit must be 1..100.')
    root = Path((config or load_config())['output_dir'])
    reports = []
    skipped = 0
    unassigned = []
    if root.is_dir():
        for directory in root.iterdir():
            if not directory.is_dir() or directory.name.startswith('.'):
                continue
            try:
                report = read_report(directory.name, config)
            except InactiveDatasetError:
                continue
            except UnassignedReportError:
                unassigned.append({'run_id':directory.name,'reason':'dataset_not_recorded'})
                continue
            except (ValueError, OSError, KeyError, TypeError):
                skipped += 1
                continue
            dataset = report['dataset']
            if (dataset['connection_id'], dataset['schema'], dataset['table']) == (connection_id, schema, table):
                reports.append(report)
    reports.sort(key=sort_key, reverse=True)
    extractions = [r for r in reports if not r.get('parent_run_id')]
    extractions.sort(key=lambda r: (datetime.fromisoformat(r.get('extracted_at',r['created_at'])).timestamp(),r['run_id']), reverse=True)
    by_id = {r['run_id']:r for r in reports}
    lineage = {}
    orphaned = 0
    for report in reports:
        node, seen = report, set()
        while node.get('parent_run_id') and node['run_id'] not in seen:
            seen.add(node['run_id'])
            node = by_id.get(node['parent_run_id'])
            if node is None:
                break
        if node is not None and not node.get('parent_run_id'):
            lineage[report['run_id']] = node['run_id']
        else:
            orphaned += 1
    latest = None
    if extractions:
        newest = extractions[0]
        latest = next(r for r in reports if lineage.get(r['run_id']) == newest['run_id'] and assessment_hash(r) == assessment_hash(newest))
        latest = {**latest, 'root_run_id': newest['run_id'], 'extracted_at': newest.get('extracted_at',newest['created_at'])}
    trend_version = assessment_hash(extractions[0]) if extractions else None
    trend = [summary_record(r) for r in extractions if assessment_hash(r) == trend_version][:20]
    page, paging = paginate(reports, [connection_id,schema,table], limit, cursor)
    warnings = []
    if skipped:
        warnings.append(f'{skipped} saved reports failed verification and were excluded. Valid results remain available; this is a report-archive issue, not a source-data finding.')
    if orphaned:
        warnings.append(f'{orphaned} reviews have missing or invalid extraction lineage and cannot become the latest result.')
    from app.lab.attempts import matching_attempts, attempt_summary
    return {'status': 'success', 'dataset': {'connection_id': connection_id, 'schema': schema, 'table': table},
        'runs': [summary_record(r) for r in page], 'latest': latest, 'page': paging,
        'trend': trend, 'trend_assessment': trend_version, 'warnings': warnings,
        'archive': {'unassigned_count':len(unassigned),'unassigned_reports':sorted(unassigned,key=lambda r:r['run_id'])},
        'summary': {'saved_results': len(reports), 'source_extractions': len(extractions),
            'ai_reviews': len(reports) - len(extractions),
            'latest_completed_at': latest['created_at'] if latest else None},
        'skipped_artifacts': skipped,
        'attempt_summary': attempt_summary(matching_attempts(connection_id,schema,table,config)),
        'limitations': 'Results contain completed runs; running/failed API attempts are recorded separately. CLI attempts and pre-existing failures are not reconstructed.'}


def verified_artifact(run_id, name, config=None):
    read_report(run_id, config)
    if name not in ARTIFACTS:
        raise ValueError('Unknown artifact')
    path = artifact_path(run_id, name, config)
    if name != 'manifest.json':
        manifest = json.loads((path.parent/'manifest.json').read_text(encoding='utf-8'))
        if digest(path.read_bytes()) != manifest[name]['sha256']:
            raise ValueError('Artifact integrity check failed.')
    return path
