"""Private run-scoped HMAC references; no source keys are written to reports."""
import hashlib
import hmac
import json
import os
import secrets
from pathlib import Path


def secret(config):
    directory = Path(config['output_dir']) / '.private'
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / 'row-reference.key'
    try:
        with path.open('xb') as stream:
            stream.write(secrets.token_bytes(32))
        os.chmod(path, 0o600)
    except FileExistsError:
        pass
    key = path.read_bytes()
    if len(key) != 32:
        raise ValueError('Private reference key is unavailable')
    return key


def packed(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), default=str).encode()


def signature(key, value):
    return hmac.new(key, packed(value), hashlib.sha256).hexdigest()


def dataset_identity(config):
    return [config.get('connection_id', 'quality_source'), config['schema'], config['table']]


def key_hash(key, config, value):
    return signature(key, ['source-key', dataset_identity(config), str(value)])


def reference_document(config, run_id, rows, references):
    key = secret(config)
    mapping = {reference: {'key_hash': key_hash(key, config, row[config['key']]),
                          'row_hash': signature(key, ['source-row', row])}
               for reference, row in zip(references, rows)}
    payload = {'run_id': run_id, 'dataset': dataset_identity(config), 'rows': mapping}
    return packed({'payload': payload, 'mac': signature(key, payload)})


def resolve_reference(config, root_id, row_ref):
    from app.lab.source import Source
    path = Path(config['output_dir']) / root_id / '.row-references.json'
    if not path.is_file():
        raise FileNotFoundError('This older extraction has no protected row mapping. Run a new review.')
    key = secret(config)
    document = json.loads(path.read_text(encoding='utf-8'))
    payload = document['payload']
    if not hmac.compare_digest(document['mac'], signature(key, payload)) or payload['run_id'] != root_id or payload['dataset'] != dataset_identity(config):
        raise ValueError('Protected reference integrity check failed')
    entry = payload['rows'].get(row_ref)
    if not entry:
        raise KeyError('Row reference is not part of this extraction')
    row = Source(config).lookup_hashed_key(entry['key_hash'], lambda value: key_hash(key, config, value))
    if row is None:
        return None, False
    return row, not hmac.compare_digest(entry['row_hash'], signature(key, ['source-row', row]))
