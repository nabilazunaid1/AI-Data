"""Versioned, non-secret assessment criteria used for score comparisons."""
from app.lab.engine import digest
from app.lab.row_references import packed

ENGINE_VERSION = 'quality-rules-v2'
FIELDS = ('key', 'rules', 'duplicate_exclude', 'normalize', 'outlier_columns',
          'pii_columns', 'sample_size', 'sample_seed')


def assessment(config):
    policy = {field: config[field] for field in FIELDS}
    criteria = {'engine_version': ENGINE_VERSION, 'sampling_version': 'bounded-seeded-random-v1', 'policy': policy}
    return {**criteria, 'hash': digest(packed(criteria))}
