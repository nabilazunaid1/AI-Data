"""Sample-scoped checks and privacy-safe output. Standard library only."""
import csv
import hashlib
import io
import json
import math
import re
from collections import Counter
from datetime import date
from statistics import median

MASKED_VALUE = '*****'

PATTERNS = {
    'email': r'[^\s@]+@[^\s@]+\.[^\s@]+',
    'national_id': r'\d{6}-\d{2}-\d{4}',
    'phone': r'\+?\d[\d ()-]{8,14}',
    'card': r'\d{13,19}',
}


def missing(value):
    return value is None or isinstance(value, str) and not value.strip()


def numeric(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def canonical(value):
    return str(value).strip().lower() if value is not None else None


def classify(rows, config):
    result = {}
    for column in rows[0] if rows else []:
        labels = set()
        if column == config['key']:
            labels.add('source_identifier')
        if column in config['pii_columns']:
            labels.add(config['pii_columns'][column])
        if re.search(r'name|address|account|passport|ic_number|phone|email|card', column, re.I):
            labels.add('sensitive_column_name')
        for kind, pattern in PATTERNS.items():
            if any(re.fullmatch(pattern, str(r[column])) for r in rows if not missing(r[column])):
                labels.add(kind)
        if labels:
            result[column] = {'categories': sorted(labels),
                'nonempty_count': sum(not missing(r[column]) for r in rows),
                'method': 'configured_policy_and_patterns', 'confidence': 'heuristic'}
    return result


def mask_rows(rows, pii):
    # Unknown text is also redacted: patterns cannot prove absence of PII.
    return [{k: (None if v is None else MASKED_VALUE if k in pii or isinstance(v, str) else v)
             for k, v in row.items()} for row in rows]


def profiles(rows, pii):
    output = {}
    for col in rows[0] if rows else []:
        vals = [r[col] for r in rows if not missing(r[col])]
        nums = [numeric(v) for v in vals]
        stats = {'missing': len(rows) - len(vals),
            'distinct': len({canonical(v) for v in vals}),
            'types': sorted({type(v).__name__ for v in vals}), 'pii': col in pii}
        if vals and col not in pii and all(n is not None for n in nums):
            stats.update(min=min(nums), max=max(nums), mean=sum(nums)/len(nums))
        output[col] = stats
    return output


def validate(rows, config):
    issues, checks = [], 0
    for rule in config['rules']:
        col, kind = rule['column'], rule['kind']
        counts = Counter(canonical(r[col]) for r in rows if not missing(r[col]))
        seen = set()
        for index, row in enumerate(rows):
            checks += 1
            value = row[col]
            bad = False
            if kind == 'required':
                bad = missing(value)
            elif not missing(value):
                if kind == 'unique':
                    key = canonical(value)
                    bad = counts[key] > 1 and key in seen
                    seen.add(key)
                elif kind == 'regex':
                    bad = re.fullmatch(rule['pattern'], str(value)) is None
                elif kind == 'number':
                    number = numeric(value)
                    bad = number is None or not rule['min'] <= number <= rule['max']
                elif kind in ('enum', 'reference'):
                    bad = value not in rule['values']
                elif kind == 'date':
                    try:
                        date.fromisoformat(str(value))
                    except ValueError:
                        bad = True
                elif kind == 'product':
                    left, right, total = numeric(row[rule['left']]), numeric(row[rule['right']]), numeric(value)
                    bad = None in (left, right, total) or abs(total - left * right) > 0.01
                else:
                    raise ValueError('Unknown rule kind')
            if bad:
                issues.append({'sample_row': index, 'column': col, 'rule': kind,
                    'recommendation': f'Review {col}: enforce {kind} rule at ingestion.'})
    seen = set()
    for index, row in enumerate(rows):
        checks += 1
        key = json.dumps({k: canonical(v) for k, v in row.items() if k not in config['duplicate_exclude']}, sort_keys=True)
        if key in seen:
            issues.append({'sample_row': index, 'column': '*', 'rule': 'duplicate_record',
                           'recommendation': 'Review duplicate business record before merging.'})
        seen.add(key)
    return {'issues': issues, 'checks': checks, 'issue_count': len(issues),
            'score': round(100 * (checks-len(issues))/checks, 2) if checks else None}


def anomalies(rows, config):
    findings = []
    for col in config['outlier_columns']:
        values = [numeric(r[col]) for r in rows]
        numbers = [n for n in values if n is not None]
        if len(numbers) < 5:
            continue
        center = median(numbers)
        mad = median(abs(n-center) for n in numbers)
        if mad == 0:
            continue
        for i, value in enumerate(values):
            if value is not None and 0.6745 * abs(value-center)/mad > 3.5:
                findings.append({'sample_row': i, 'column': col, 'method': 'median_mad',
                    'recommendation': f'Investigate unusual {col}; do not automatically replace outliers.'})
    return findings


def corrections(rows, config, pii):
    corrected = [dict(r) for r in rows]
    changes = []
    for i, row in enumerate(corrected):
        for col, mapping in config['normalize'].items():
            old = row[col]
            new = mapping.get(canonical(old), old)
            if new != old:
                row[col] = new
                changes.append({'sample_row': i, 'column': col, 'rule': 'normalize_label',
                    'before': MASKED_VALUE if col in pii else old,
                    'after': MASKED_VALUE if col in pii else new,
                    'applied_to': 'output_only'})
    return corrected, changes


def csv_bytes(rows, fieldnames=None):
    out = io.StringIO(newline='')
    fields = list(fieldnames) if fieldnames is not None else list(rows[0]) if rows else []
    if fields:
        writer = csv.DictWriter(out, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: "'"+v if isinstance(v, str) and v.lstrip().startswith(('=', '+', '-', '@')) else v for k,v in row.items()})
    return out.getvalue().encode('utf-8-sig')


def digest(data):
    return hashlib.sha256(data).hexdigest()
