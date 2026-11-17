"""Deterministic synthetic data. No real personal information."""
import csv
import json
from pathlib import Path

BASE_COLUMNS = ['record_id', 'name', 'ic_number', 'phone', 'email', 'address',
                'bank_account', 'card_number', 'age', 'amount', 'region', 'status',
                'product_id', 'quantity', 'unit_price', 'order_total', 'event_date',
                'country', 'currency', 'notes']
COLUMNS = BASE_COLUMNS + [f'metric_{i:02}' for i in range(1, 31)]


def fixture_rows():
    rows = []
    for i in range(1, 151):
        row = dict(zip(BASE_COLUMNS, [i, f'Synthetic Person {i}',
            f'900101-14-{i:04}', f'010{i:08}', f'person{i}@example.invalid',
            f'{i} Example Street, Demo Town', f'999000{i:06}', '4111111111111111',
            20 + i % 50, 100 + i % 30, 'Central', 'active', f'P{i % 5}',
            2, 50, 100, '2026-11-01', 'MY', 'MYR', 'Synthetic fixture']))
        row.update({f'metric_{n:02}': i % 20 + n for n in range(1, 31)})
        rows.append(row)
    rows[1]['email'] = None
    rows[2]['email'] = rows[0]['email']
    rows[3]['phone'] = 'bad-phone'
    rows[4]['age'] = -8
    rows[5]['amount'] = 1000000
    rows[6]['region'] = ' central '
    rows[7]['status'] = 'UNKNOWN'
    rows[8]['product_id'] = 'MISSING'
    rows[9]['order_total'] = 12
    rows[10]['email'] = 'invalid-email'
    rows[11]['age'] = 'not-a-number'
    rows[12]['event_date'] = '2026-99-99'
    rows[13]['name'] = ''
    # Duplicate business record (surrogate ID differs).
    rows[14] = {**rows[0], 'record_id': 15}
    return rows


def write_fixture(root):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    rows = fixture_rows()
    with (root / 'quality_fixture.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    manifest = {'synthetic': True, 'rows': 150, 'columns': 50,
        'expected': {'missing_email': [2], 'invalid_phone': [4], 'age_min': [5],
            'age_type': [12], 'invalid_status': [8], 'orphan_product': [9],
            'order_total': [10], 'invalid_email': [11], 'event_date': [13],
            'missing_name': [14], 'duplicate_email_extra_rows': [3, 15],
            'duplicate_business_extra_rows': [15], 'amount_outlier': [6],
            'region_normalization': [7]},
        'pii_columns': ['name', 'ic_number', 'phone', 'email', 'address',
                        'bank_account', 'card_number']}
    (root / 'expected.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return rows
