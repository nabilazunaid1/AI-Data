"""Trusted server-side configuration; no client-supplied SQL or credentials."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_config():
    path = Path(os.getenv('QUALITY_CONFIG', ROOT / 'config' / 'quality.json'))
    config = json.loads(path.read_text(encoding='utf-8'))
    config['adapter'] = os.getenv('QUALITY_ADAPTER', config['adapter'])
    for name in ('sqlite_path', 'output_dir'):
        if not Path(config[name]).is_absolute():
            config[name] = str(ROOT / config[name])
    if config['adapter'] not in ('sqlite', 'postgresql'):
        raise ValueError('Unsupported adapter; implement the Source contract for another engine.')
    if not 1 <= config['sample_size'] <= 10000:
        raise ValueError('Sample size must be 1..10000.')
    return config
