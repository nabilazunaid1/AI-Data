"""Evidence Lab API; uses only server-approved dataset configuration."""
import logging
import re
from typing import Literal
import psycopg
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from app.lab.config import load_config
from app.lab.engine import classify, mask_rows, validate
from app.lab.service import AIReviewError, artifact_path, run_quality, review_saved_run
from app.lab.datasets import dataset_config, source_context
from app.lab.source import Source
from app.lab.catalogue import list_runs, read_report, root_report, verified_artifact
from app.lab.row_references import resolve_reference
from app.lab.attempts import execution_attempt, list_attempts
from app.lab.exports import export_filename

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/v1/quality', tags=['Evidence Lab'])


class RunRequest(BaseModel):
    use_ai: bool = False
    connection_id: str = 'quality_source'
    schema_name: str | None = None
    table_name: str | None = None
    origin: Literal['data_check', 'pipeline'] = 'data_check'


def resolve(request):
    try:
        return dataset_config(request.connection_id, request.schema_name, request.table_name)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


@router.get('/context')
def context(connection_id: str, schema_name: str | None = None, table_name: str | None = None):
    config = resolve(RunRequest(connection_id=connection_id, schema_name=schema_name, table_name=table_name))
    try:
        return source_context(config)
    except Exception as error:
        logger.warning('Selected source unavailable type=%s', type(error).__name__)
        raise HTTPException(503, 'Cannot connect to the selected database/table. Check its connection settings and read permissions.') from None


@router.post('/runs')
def run(request: RunRequest):
    config = resolve(request)
    config['run_origin'] = request.origin
    try:
        with execution_attempt(config, request.origin) as attempt:
            report = run_quality(config=config, use_ai=False)
            attempt['run_id'] = report.get('run_id')
        if request.use_ai:
            try:
                return tracked_ai_review(report['run_id'], config)
            except AIReviewError as error:
                # Standard evidence is already saved; never hide it on model failure.
                report['ai_review'] = {'status': 'unavailable', 'message': str(error)}
        return report
    except Exception as error:
        logger.warning('Quality run failed type=%s', type(error).__name__)
        raise HTTPException(503, 'Data-quality review failed for the selected source. Check table access and configured rules; no successful run was published.') from None


@router.post('/runs/{run_id}/ai-review')
def ai_review(run_id: str):
    try:
        return tracked_ai_review(run_id)
    except AIReviewError as error:
        raise HTTPException(503, str(error)) from None
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, 'Saved review is missing or failed its integrity check.') from None
    except Exception as error:
        logger.warning('AI review unavailable type=%s', type(error).__name__)
        raise HTTPException(503, 'AI review could not be completed. Your saved quality results remain available.') from None


def tracked_ai_review(run_id, config=None):
    config = config or load_config()
    parent = read_report(run_id, config)
    with execution_attempt(config, 'ai_review', parent['dataset'], run_id) as attempt:
        report = review_saved_run(run_id, config=config)
        attempt['run_id'] = report['run_id']
        return report


@router.get('/runs/{run_id}/{artifact}')
def download(run_id: str, artifact: str):
    try:
        path = verified_artifact(run_id, artifact)
        if not path.is_file():
            raise ValueError('Missing artifact')
        report = read_report(run_id)
        media_type = 'text/csv; charset=utf-8' if artifact.endswith('.csv') else 'application/json'
        return FileResponse(path, filename=export_filename(report, artifact), media_type=media_type,
                            headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})
    except (ValueError, FileNotFoundError, KeyError):
        raise HTTPException(404, 'Artifact not found') from None


@router.get('/catalogue')
def catalogue(connection_id: str, schema_name: str, table_name: str,
              limit: int = Query(default=100, ge=1, le=100), cursor: str | None = None):
    config = resolve(RunRequest(connection_id=connection_id, schema_name=schema_name, table_name=table_name))
    try:
        return list_runs(config['connection_id'], config['schema'], config['table'], limit=limit, cursor=cursor)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


@router.get('/catalogue/{run_id}')
def report_detail(run_id: str):
    try:
        return read_report(run_id)
    except (ValueError, OSError, KeyError):
        raise HTTPException(404, 'Report not found in the active catalogue.') from None


@router.get('/attempts')
def attempts(connection_id: str, schema_name: str, table_name: str,
             limit: int = Query(default=20, ge=1, le=100), cursor: str | None = None):
    config = resolve(RunRequest(connection_id=connection_id,schema_name=schema_name,table_name=table_name))
    try:
        return list_attempts(config['connection_id'],config['schema'],config['table'],limit,cursor)
    except ValueError as error:
        raise HTTPException(400,str(error)) from None


class ReferenceRequest(BaseModel):
    row_ref: str = Field(pattern=r'^[a-f0-9]{24}$')


@router.post('/runs/{run_id}/validate-reference')
def validate_reference(run_id: str, request: ReferenceRequest):
    try:
        report = read_report(run_id)
        extraction = root_report(report)
        dataset = report['dataset']
        config = dataset_config(dataset['connection_id'], dataset['schema'], dataset['table'])
        # Recheck the original assessment criteria, without trusting client SQL/keys.
        config.update((extraction.get('assessment') or {}).get('policy', {}))
        row, changed = resolve_reference(config, extraction['run_id'], request.row_ref)
        if row is None:
            raise HTTPException(410, 'The original source row was removed or its key changed. Run a fresh review.')
        row_config = {**config, 'rules': [r for r in config['rules'] if r['kind'] != 'unique']}
        result = validate([row], row_config)
        for issue in result['issues']:
            issue.pop('sample_row')
        return {'run_id': run_id, 'root_run_id': extraction['run_id'], 'row_ref': request.row_ref,
            'dataset': dataset, 'changed_since_review': changed,
            'method': 'protected_reference_parameterized_sql', 'validation': result,
            'masked_row': mask_rows([row], classify([row], config))[0],
            'limitation': 'Single-row checks use the saved assessment. Rerun the sample review to verify uniqueness.'}
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(409, 'This older run has no protected row mapping. Run a new review to enable exact-row verification.') from None
    except (ValueError, KeyError):
        raise HTTPException(404, 'The saved row reference is unavailable or failed verification.') from None
    except Exception as error:
        logger.warning('Protected row lookup failed type=%s', type(error).__name__)
        raise HTTPException(503, 'The referenced source row cannot currently be checked.') from None


class RowRequest(RunRequest):
    key: str = Field(min_length=1, max_length=200)
    lookup_mode: Literal['key', 'row_number'] = 'key'


@router.post('/validate-row')
def validate_row(request: RowRequest):
    config = resolve(request)
    try:
        source = Source(config)
        value = request.key.strip()
        lookup = {'mode': request.lookup_mode, 'key_column': config['key']}
        if request.lookup_mode == 'row_number':
            if not re.fullmatch(r'[0-9]+', value) or not 1 <= int(value) <= 10000:
                raise HTTPException(400, 'Enter a whole row number between 1 and 10000.')
            row_number = int(value)
            row, total = source.lookup_row_number(row_number)
            if row is None:
                message = f'This table has {total} rows. Enter a row number from 1 to {min(total, 10000)}.' if total else 'The selected table is empty.'
                raise HTTPException(404, message)
            lookup.update(row_number=row_number, total_records=total, order_by=config['key'])
            method = 'parameterized_sql_ordered_row'
        else:
            if not value:
                raise HTTPException(400, 'Enter the exact source record key.')
            row = source.lookup(value)
            if row is None:
                raise HTTPException(404, f'No record matches {config["key"]}. Enter the exact source key, or select Row number to check a position in the table.')
            method = 'parameterized_sql_where'
        # Uniqueness needs population context; never call a singleton unique check proof.
        config = {**config, 'rules': [r for r in config['rules'] if r['kind'] != 'unique']}
        result = validate([row], config)
        for issue in result['issues']:
            issue.pop('sample_row')
        return {'method': method, 'lookup': lookup, 'validation': result,
            'masked_row': mask_rows([row], classify([row], config))[0],
            'limitation': 'Single-row rules only. Use sample validation for duplicates.'}
    except HTTPException:
        raise
    except psycopg.errors.InvalidTextRepresentation:
        raise HTTPException(400, 'The record key has the wrong format for this table. Enter the exact source key, or select Row number.') from None
    except Exception as error:
        logger.warning('Row validation failed type=%s', type(error).__name__)
        raise HTTPException(503, 'Row validation unavailable') from None
