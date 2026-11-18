"""Connect -> sample -> inspect -> correct output -> immutable evidence artifacts."""
import json
import logging
import os
import secrets
import time
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from app.lab.agent import execute_tools
from app.lab.config import load_config
from app.lab.engine import (MASKED_VALUE, anomalies, classify, corrections, csv_bytes, digest,
                            mask_rows, profiles, validate)
from app.lab.source import Source
from app.lab.assessment import assessment
from app.lab.row_references import reference_document
from app.lab.exports import CHANGE_FIELDS

logger = logging.getLogger(__name__)
ARTIFACTS = ('report.json', 'masked.csv', 'changes.csv', 'agent_trace.json', 'manifest.json')


class AIReviewError(RuntimeError):
    """AI tools failed after source extraction; standard review is independent."""


def review_saved_run(run_id, decide=None, config=None):
    """Let AI inspect verified, saved evidence without re-extracting source rows.

    Publish a separate child run only after every selected tool succeeds.
    The original Standard run and downloads stay available on failure.
    """
    from app.lab.catalogue import read_report, root_report
    report = read_report(run_id, config)
    root_report_data = root_report(report, config)
    path = artifact_path(run_id, 'report.json', config)
    manifest = json.loads((path.parent / 'manifest.json').read_text(encoding='utf-8'))
    def column_tool():
        return {'finding_count': sum(p['missing'] for p in report['profiles'].values()),
                'column_count': report['column_count']}
    tools = {
        'inspect_profiles': column_tool,
        'inspect_rule_failures': lambda: {'finding_count': report['validation']['issue_count']},
        'inspect_sensitive_fields': lambda: {'finding_count': len(report['pii'])},
        'inspect_anomalies': lambda: {'finding_count': len(report['anomalies'])},
        'inspect_corrections': lambda: {'finding_count': len(report['changes'])},
    }
    try:
        agent = execute_tools(tools, use_ai=True, decide=decide)
    except Exception as error:
        logger.warning('AI evidence review failed run_id=%s type=%s', run_id, type(error).__name__)
        if isinstance(error, (TimeoutError, OSError)):
            message = 'Local AI did not respond in time. Check Ollama and the configured model, then retry AI review.'
        else:
            message = 'Local AI returned an invalid or incomplete tool plan. Retry AI review.'
        raise AIReviewError(message) from error
    agent['evidence_run_id'] = run_id
    agent['scope'] = 'saved_verified_evidence'
    agent['requested_model'] = os.getenv('OLLAMA_MODEL', 'gemma3:1b')
    agent['provider'] = 'ollama_local'
    new_id = str(uuid4())
    report.update(run_id=new_id, parent_run_id=run_id, agent=agent, origin='ai_review',
                  root_run_id=root_report_data['run_id'],
                  extracted_at=root_report_data.get('extracted_at', root_report_data['created_at']),
                  created_at=datetime.now(timezone.utc).isoformat())
    payloads = {'report.json': json.dumps(report, indent=2).encode(),
                'agent_trace.json': json.dumps(agent, indent=2).encode()}
    for name in ('masked.csv', 'changes.csv'):
        content = (path.parent / name).read_bytes()
        if digest(content) != manifest[name]['sha256']:
            raise ValueError('Saved output integrity check failed.')
        payloads[name] = content
    root = path.parent.parent
    temp = root / ('.' + new_id)
    temp.mkdir()
    try:
        for name, content in payloads.items():
            (temp / name).write_bytes(content)
        (temp / 'manifest.json').write_text(json.dumps({name: {'sha256': digest(content), 'bytes': len(content)}
            for name, content in payloads.items()}, indent=2), encoding='utf-8')
        temp.rename(root / new_id)
    except Exception:
        shutil.rmtree(temp)
        raise
    return report


def run_quality(config=None, use_ai=False, decide=None):
    started = time.perf_counter()
    config = config or load_config()
    run_id = str(uuid4())
    source = Source(config)
    rows, population = source.sample()
    extracted_at = datetime.now(timezone.utc).isoformat()
    if not rows:
        raise ValueError('Source is empty; no sample available.')
    if any(set(r) != set(rows[0]) for r in rows):
        raise ValueError('Extraction schema mismatch')
    required = {r['column'] for r in config['rules']} | set(config['normalize']) | set(config['outlier_columns'])
    if not required <= set(rows[0]):
        raise ValueError('Configured columns missing from source')
    pii = classify(rows, config)
    state = {}

    def profile_tool():
        state['profiles'] = profiles(rows, pii)
        return {'column_count': len(state['profiles']), 'finding_count': sum(p['missing'] for p in state['profiles'].values())}

    def validate_tool():
        state['validation'] = validate(rows, config)
        return {'finding_count': state['validation']['issue_count'], 'checks': state['validation']['checks']}

    def pii_tool():
        state['pii'] = pii
        return {'finding_count': len(pii)}

    def anomaly_tool():
        state['anomalies'] = anomalies(rows, config)
        return {'finding_count': len(state['anomalies'])}

    def evidence_tool():
        # Query the actual source by bound primary key, never generated SQL.
        # A different transaction is intentionally flagged as a fresh read.
        row = source.lookup(rows[0][config['key']])
        state['sql_evidence'] = {'method': 'parameterized_primary_key_lookup',
            'matched': row == rows[0], 'scope': 'fresh_read_outside_sample_snapshot'}
        if row != rows[0]:
            raise ValueError('Source changed after sample extraction; rerun required')
        return {'finding_count': 0, 'matched': True}

    def warehouse_tool():
        state['warehouse'] = source.warehouse_summary()
        return state['warehouse']

    tools = {'profile': profile_tool, 'validate': validate_tool,
        'detect_pii': pii_tool, 'detect_anomalies': anomaly_tool,
        'verify_sql_row': evidence_tool}
    if config.get('warehouse_enabled') and config['adapter'] == 'postgresql':
        tools['query_warehouse'] = warehouse_tool
    try:
        agent = execute_tools(tools, use_ai=use_ai, decide=decide)
    except Exception as error:
        if use_ai:
            raise AIReviewError('Local AI review failed; standard checks remain available.') from error
        raise
    corrected, changes = corrections(rows, config, pii)
    after = validate(corrected, config)
    masked = mask_rows(corrected, pii)
    if any(isinstance(v, str) and v != MASKED_VALUE for r in masked for v in r.values()):
        raise ValueError('Output privacy gate failed')
    # References are random and scoped to the saved run, not source IDs.
    refs = [secrets.token_hex(12) for _ in rows]
    masked = [{'row_ref': refs[i], **row} for i, row in enumerate(masked)]
    for collection in (state['validation']['issues'], after['issues'], state['anomalies'], changes):
        for finding in collection:
            finding['row_ref'] = refs[finding.pop('sample_row')]
    report = {'run_id': run_id, 'status': 'completed', 'created_at': datetime.now(timezone.utc).isoformat(),
        'schema_version': 2, 'root_run_id': run_id, 'extracted_at': extracted_at,
        'assessment': assessment(config), 'row_reference_lookup': True,
        'origin': config.get('run_origin', 'data_check'),
        'duration_ms': round((time.perf_counter() - started) * 1000, 2),
        'source_engine': config['adapter'],
        'dataset': {'connection_id': config.get('connection_id', 'quality_source'),
                    'connection_name': config.get('connection_name', 'Quality Sample Database'),
                    'schema': config['schema'], 'table': config['table']},
        'scope': 'sample_only', 'population_count': population,
        'sample_count': len(rows), 'sample_seed': config['sample_seed'], 'column_count': len(rows[0]),
        'sample_fingerprint': digest(json.dumps(sorted(str(r[config['key']]) for r in rows)).encode()),
        'profiles': state['profiles'], 'pii': pii, 'validation': state['validation'],
        'after_validation': after, 'anomalies': state['anomalies'], 'sql_evidence': state['sql_evidence'],
        'changes': changes, 'agent': agent, 'warehouse': state.get('warehouse'),
        'recommendations': sorted({i['recommendation'] for i in state['validation']['issues'] + state['anomalies']}),
        'stages': ['connect', 'extract_sample', 'profile_validate_detect', 'correct_output', 'privacy_gate', 'report'],
        'limitations': ['Scores and duplicates describe the sample, not the population.',
            'Heuristic PII discovery is not a guarantee of anonymization; all text output is redacted.',
            'Corrections apply only to exported output. No source records were changed.',
            'Reference rules use a configured allowed-key snapshot; refresh it for your application.',
            'The source population is bounded to 10000 rows for this prototype.']}
    root = Path(config['output_dir'])
    root.mkdir(parents=True, exist_ok=True)
    temp = root / ('.' + run_id)
    temp.mkdir()
    try:
        payloads = {'report.json': json.dumps(report, indent=2, default=str).encode(),
            'masked.csv': csv_bytes(masked), 'changes.csv': csv_bytes(changes, CHANGE_FIELDS),
            'agent_trace.json': json.dumps(agent, indent=2).encode()}
        manifest = {name: {'sha256': digest(data), 'bytes': len(data)} for name,data in payloads.items()}
        for name,data in payloads.items():
            (temp / name).write_bytes(data)
        # Private, authenticated pseudonymous mapping. Never a downloadable artifact.
        (temp / '.row-references.json').write_bytes(reference_document(config, run_id, rows, refs))
        (temp / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        temp.rename(root / run_id)
    except Exception:
        shutil.rmtree(temp)
        raise
    logger.info('Quality run completed run_id=%s sampled=%d issues=%d', run_id, len(rows), state['validation']['issue_count'])
    return report


def artifact_path(run_id, name, config=None):
    if str(UUID(run_id)) != run_id or name not in ARTIFACTS:
        raise ValueError('Invalid artifact identifier')
    return Path((config or load_config())['output_dir']) / run_id / name
