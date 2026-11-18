"""Optional local visual check: pip install pymupdf, then run from the repo root."""
import json
from pathlib import Path
import pymupdf as fitz

root = Path(__file__).resolve().parents[2]
directory = root / 'frontend' / 'test-results' / 'live'
files = list(directory.glob('*quality-report.pdf'))
if not files:
    raise SystemExit('Run frontend/scripts/verify-live-workspace.mjs first.')
path = max(files, key=lambda item:item.stat().st_mtime)
document = fitz.open(path)
clipped = []
text = ''
for index, page in enumerate(document):
    text += page.get_text()
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            for span in line['spans']:
                x0, y0, x1, y1 = span['bbox']
                if x0 < 0 or y0 < 0 or x1 > page.rect.width or y1 > page.rect.height:
                    clipped.append({'page': index + 1, 'bbox': span['bbox']})
for index in sorted({0, 1, len(document)-1}):
    document[index].get_pixmap(matrix=fitz.Matrix(1.25,1.25)).save(directory / f'report-page-{index+1}.png')
assert not clipped, clipped
assert all('AI DATA GUARDIAN' in page.get_text() for page in document), 'Missing running page header'
for title in ('Data quality assessment', 'Validation findings', 'Privacy and column profile', 'Output corrections', 'Scope, limitations and integrity'):
    assert title in text, title
print(json.dumps({'file': path.name, 'pages': len(document), 'clipped_text_spans': len(clipped),
                  'required_sections_present': True}, indent=2))
