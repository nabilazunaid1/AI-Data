
"""
AI Data Guardian 3.0
Masked Pipeline CSV Download API

Endpoint:
POST /api/v1/pipeline/download/csv

Features:
- Explicit on-demand download
- Approved customers table only
- Maximum 100 sample rows
- Reuses the existing ETL pipeline
- Reuses the masked CSV export service
- CSV generated in memory
- No automatic Ollama calls

IMPORTANT:
This endpoint reruns the pipeline.
It does not retrieve a stored execution result.

LOCAL DEVELOPMENT PROTOTYPE.
Authentication, authorization, audit logging
and stronger privacy controls are required
before production deployment.
"""

import logging

import psycopg

from fastapi import (
    APIRouter,
    HTTPException
)

from fastapi.responses import Response

from app.api.pipeline_api import (
    PipelineRunRequest,
    verify_pipeline_response
)

from app.etl.pipeline_service import (
    run_pipeline
)

from app.etl.csv_export_service import (
    generate_masked_csv
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/pipeline",
    tags=["ETL Pipeline"]
)


# =====================================================
# DOWNLOAD CSV
# =====================================================

@router.post("/download/csv")
def download_pipeline_csv(
    request: PipelineRunRequest
):
    """
    Execute the pipeline again and generate
    a CSV from its verified masked output.

    No CSV file is written to the server.
    """

    if request.table_name != "customers":
        raise HTTPException(
            status_code=404,
            detail=(
                "CSV download currently supports "
                "the customers table only."
            )
        )

    try:
        # Run the existing deterministic pipeline.
        result = run_pipeline(
            table_name=request.table_name,
            limit=request.limit
        )

        # Reuse the API response verification.
        verified = verify_pipeline_response(
            result
        )

        if (
            verified["status"] != "completed"
            or verified["read_only"] is not True
            or verified["pii_masked"] is not True
            or verified["ai_used"] is not False
        ):
            raise ValueError(
                "Pipeline safety verification failed."
            )

        rows = verified["output"]["rows"]

        # Generate in-memory masked CSV.
        csv_content = generate_masked_csv(
            rows
        )

        # UTF-8 BOM improves compatibility
        # with some spreadsheet applications.
        csv_bytes = (
            "\ufeff" + csv_content
        ).encode("utf-8")

        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": (
                    'attachment; filename="'
                    'guardian_customers_masked.csv"'
                ),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff"
            }
        )

    except (
        psycopg.Error,
        ValueError,
        KeyError,
        TypeError
    ) as error:

        logger.warning(
            "Masked CSV download failed: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Masked CSV export is unavailable "
                "or failed verification."
            )
        ) from error


# =====================================================
# DIRECT LOCAL TEST
# =====================================================

if __name__ == "__main__":

    print("PIPELINE CSV DOWNLOAD API TEST")
    print("=" * 50)

    request = PipelineRunRequest(
        table_name="customers",
        limit=5
    )

    response = download_pipeline_csv(
        request
    )

    csv_text = response.body.decode(
        "utf-8-sig"
    )

    print("HTTP status:", response.status_code)
    print(
        "Content-Type:",
        response.headers["content-type"]
    )
    print(
        "Content-Disposition:",
        response.headers["content-disposition"]
    )

    print()
    print("CSV PREVIEW")
    print("-" * 50)
    print(csv_text)

    assert response.status_code == 200

    assert (
        "attachment"
        in response.headers["content-disposition"]
    )

    assert (
        response.headers["cache-control"]
        == "no-store"
    )

    assert "[MASKED_ID]" in csv_text
    assert "[MASKED_NAME]" in csv_text

    assert len(
        csv_text.splitlines()
    ) == 6

    print(
        "PASS: Download API returned CSV."
    )
    print(
        "PASS: Five masked rows returned."
    )
    print(
        "PASS: Download headers verified."
    )
