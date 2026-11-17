"""Connect -> sample -> inspect -> correct output -> immutable evidence artifacts."""
import json
import logging
import os
import secrets
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from app.lab.agent import execute_tools
from app.lab.config import load_config
from app.lab.engine import (anomalies, classify, corrections, csv_bytes, digest,
                            mask_rows, profiles, validate)
from app.lab.source import Source

logger = logging.getLogger(__name__)
ARTIFACTS = ('report.json', 'masked.csv', 'changes.csv', 'agent_trace.json', 'manifest.json')


def run_quality(config=None, use_ai=False, decide=None):
    config = config or load_config()
    run_id = str(uuid4())
    source = Source(config)
    rows, population = source.sample()
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
    agent = execute_tools(tools, use_ai=use_ai, decide=decide)
    corrected, changes = corrections(rows, config, pii)
    after = validate(corrected, config)
    masked = mask_rows(corrected, pii)
    if any(isinstance(v, str) and v != '[MASKED]' for r in masked for v in r.values()):
        raise ValueError('Output privacy gate failed')
    # References are random and scoped to the saved run, not source IDs.
    refs = [secrets.token_hex(12) for _ in rows]
    masked = [{'row_ref': refs[i], **row} for i, row in enumerate(masked)]
    for collection in (state['validation']['issues'], after['issues'], state['anomalies'], changes):
        for finding in collection:
            finding['row_ref'] = refs[finding.pop('sample_row')]
    report = {'run_id': run_id, 'status': 'completed', 'created_at': datetime.now(timezone.utc).isoformat(),
        'source_engine': config['adapter'], 'scope': 'sample_only', 'population_count': population,
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
            'masked.csv': csv_bytes(masked), 'changes.csv': csv_bytes(changes),
            'agent_trace.json': json.dumps(agent, indent=2).encode()}
        manifest = {name: {'sha256': digest(data), 'bytes': len(data)} for name,data in payloads.items()}
        for name,data in payloads.items():
            (temp / name).write_bytes(data)
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
