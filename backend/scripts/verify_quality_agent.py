"""Real inference check; no injected decisions. Requires responsive Ollama."""
import json
import argparse
import os
from pathlib import Path
from dotenv import load_dotenv
from app.lab.service import run_quality


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--isolated', action='store_true')
    args = parser.parse_args()
    load_dotenv()
    if args.isolated:
        os.environ['OLLAMA_URL'] = 'http://127.0.0.1:11435/api/generate'
    if os.getenv('QUALITY_EVIDENCE_OLLAMA_URL'):
        os.environ['OLLAMA_URL'] = os.environ['QUALITY_EVIDENCE_OLLAMA_URL']
    report = run_quality(use_ai=True)
    evidence = {'run_id': report['run_id'], 'source_engine': report['source_engine'],
        'model': os.getenv('OLLAMA_MODEL', 'gemma3:1b'),
        'agent': report['agent'], 'sample_count': report['sample_count']}
    Path('../docs/agent-verification.json').write_text(json.dumps(evidence, indent=2))
    print(json.dumps(evidence))


if __name__ == '__main__':
    main()
