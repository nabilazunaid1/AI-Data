"""Persistent, sanitized API execution attempts, independent of report success."""
import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from app.lab.config import load_config


def now():
    return datetime.now(timezone.utc).isoformat()


def save(record, config):
    root = Path(config['output_dir'])/'.attempts'
    root.mkdir(parents=True, exist_ok=True)
    temporary = root/(record['attempt_id']+'.'+uuid4().hex+'.tmp')
    temporary.write_text(json.dumps(record), encoding='utf-8')
    os.replace(temporary, root/(record['attempt_id']+'.json'))


@contextmanager
def execution_attempt(config, origin, dataset=None, parent_run_id=None):
    dataset = dataset or {'connection_id': config.get('connection_id','quality_source'),
        'connection_name': config.get('connection_name','Quality Sample Database'),
        'schema': config['schema'], 'table': config['table']}
    record = {'attempt_id': str(uuid4()), 'created_at': now(), 'updated_at': now(),
        'origin': origin, 'dataset': dataset, 'parent_run_id': parent_run_id,
        'status': 'running', 'run_id': None, 'error_code': None}
    save(record, config)
    try:
        yield record
    except Exception:
        record.update(status='failed', error_code='ai_review_failed' if origin=='ai_review' else 'quality_run_failed')
        raise
    else:
        record['status'] = 'completed'
    finally:
        record['updated_at'] = now()
        save(record, config)


def matching_attempts(connection_id, schema, table, config=None):
    root = Path((config or load_config())['output_dir'])/'.attempts'
    records = []
    if root.is_dir():
        for path in root.glob('*.json'):
            try:
                record = json.loads(path.read_text(encoding='utf-8'))
                dataset = record['dataset']
                if record['status'] not in ('running','completed','failed') or not isinstance(record['attempt_id'],str):
                    continue
                datetime.fromisoformat(record['created_at'])
                if (dataset['connection_id'],dataset['schema'],dataset['table']) == (connection_id,schema,table):
                    records.append(record)
            except (OSError, ValueError, TypeError, KeyError):
                continue
    return records


def attempt_summary(records):
    return {status: sum(r['status']==status for r in records) for status in ('running','completed','failed')}


def list_attempts(connection_id, schema, table, limit=20, cursor=None, config=None):
    from app.lab.catalogue import paginate, sort_key
    records = matching_attempts(connection_id,schema,table,config)
    records.sort(key=sort_key,reverse=True)
    page,paging=paginate(records,[connection_id,schema,table],limit,cursor,kind='attempts')
    return {'attempts':page,'page':paging,'summary':attempt_summary(records)}
