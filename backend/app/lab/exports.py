"""Stable, descriptive export names without changing saved evidence bytes."""
import re
import unicodedata

CHANGE_FIELDS = ('row_ref', 'column', 'rule', 'before', 'after', 'applied_to')
LABELS = {'report.json': 'quality-report.json', 'masked.csv': 'protected-data.csv',
          'changes.csv': 'correction-log.csv', 'agent_trace.json': 'execution-trace.json',
          'manifest.json': 'integrity-manifest.json'}


def slug(value):
    text = unicodedata.normalize('NFKD', str(value))
    return re.sub(r'[^a-zA-Z0-9_-]+', '-', text).strip('-')[:72] or 'dataset'


def export_filename(report, artifact):
    dataset = report['dataset']
    context = f"{slug(dataset['connection_id'])}_{slug(dataset['schema'])}-{slug(dataset['table'])}"
    date = report['created_at'][:10].replace('-', '')
    return f"ai-data-guardian_{context}_{date}_{slug(report['run_id'])[:8]}_{LABELS[artifact]}"
