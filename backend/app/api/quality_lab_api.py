"""Evidence Lab API; uses only server-approved dataset configuration."""
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from app.lab.config import load_config
from app.lab.engine import classify, mask_rows, validate
from app.lab.service import artifact_path, run_quality
from app.lab.source import Source

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/v1/quality', tags=['Evidence Lab'])


class RunRequest(BaseModel):
    use_ai: bool = False


@router.post('/runs')
def run(request: RunRequest):
    try:
        return run_quality(use_ai=request.use_ai)
    except Exception as error:
        logger.warning('Quality run failed type=%s', type(error).__name__)
        raise HTTPException(503, 'Run failed. Check source configuration or local model availability; no successful run was published.') from None


@router.get('/runs/{run_id}/{artifact}')
def download(run_id: str, artifact: str):
    try:
        path = artifact_path(run_id, artifact)
        if not path.is_file():
            raise ValueError('Missing artifact')
        return FileResponse(path, filename=artifact, headers={'Cache-Control': 'no-store'})
    except ValueError:
        raise HTTPException(404, 'Artifact not found') from None


class RowRequest(BaseModel):
    key: str


@router.post('/validate-row')
def validate_row(request: RowRequest):
    try:
        config = load_config()
        row = Source(config).lookup(request.key)
        if row is None:
            raise HTTPException(404, 'Row not found')
        # Uniqueness needs population context; never call a singleton unique check proof.
        config = {**config, 'rules': [r for r in config['rules'] if r['kind'] != 'unique']}
        result = validate([row], config)
        for issue in result['issues']:
            issue.pop('sample_row')
        return {'method': 'parameterized_sql_where', 'validation': result,
            'masked_row': mask_rows([row], classify([row], config))[0],
            'limitation': 'Single-row rules only. Use sample validation for duplicates.'}
    except HTTPException:
        raise
    except Exception as error:
        logger.warning('Row validation failed type=%s', type(error).__name__)
        raise HTTPException(503, 'Row validation unavailable') from None
