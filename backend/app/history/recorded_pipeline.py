
"""
AI Data Guardian 3.0
Recorded Pipeline Orchestration

Purpose:
1. Execute the existing ETL pipeline.
2. Verify its response and masked output.
3. Save approved execution metadata.
4. Return processing and persistence results.

Security:
- Restricted PostgreSQL reader
- Restricted history writer
- No raw customer rows stored in history
- No automatic Ollama calls

Current limitations:
- Completed pipelines only
- No failed-run history
- No duplicate-run protection
- Local development prototype

This module does not register an API endpoint.
"""

from app.etl.pipeline_service import (
    run_pipeline
)

from app.api.pipeline_api import (
    verify_pipeline_response
)

from app.history.history_service import (
    save_pipeline_history
)


def run_recorded_pipeline(
    table_name="customers",
    limit=20
):
    """
    Execute ETL and persist its execution history.

    History is reported as saved only after
    PostgreSQL confirms the INSERT transaction.

    If history persistence fails, the exception
    is propagated to the caller.
    """

    # =========================================
    # STEP 1 — EXECUTE PIPELINE
    # =========================================

    pipeline_result = run_pipeline(
        table_name=table_name,
        limit=limit
    )

    # =========================================
    # STEP 2 — VERIFY PIPELINE OUTPUT
    # =========================================

    verified_result = (
        verify_pipeline_response(
            pipeline_result
        )
    )

    # =========================================
    # STEP 3 — SAVE EXECUTION METADATA
    # =========================================

    history_result = save_pipeline_history(
        pipeline_result
    )

    if (
        history_result.get("status") != "saved"
        or not history_result.get("run_id")
        or history_result.get("pii_stored") is not False
    ):
        raise RuntimeError(
            "History persistence was not confirmed."
        )

    # =========================================
    # STEP 4 — RETURN COMBINED RESULTS
    # =========================================

    return {
        **verified_result,
        "history": {
            "status": "saved",
            "run_id": history_result["run_id"],
            "pii_stored": False
        }
    }


# =============================================
# LOCAL INTEGRATION TEST
# =============================================

if __name__ == "__main__":

    print(
        "RECORDED PIPELINE INTEGRATION TEST"
    )

    print("=" * 50)

    result = run_recorded_pipeline(
        table_name="customers",
        limit=5
    )

    print(
        "Pipeline status:",
        result["status"]
    )

    print(
        "Stages completed:",
        result["stage_count"]
    )

    print(
        "Extracted sample:",
        result["extraction"]["extracted_records"]
    )

    print(
        "Source records:",
        result["validation"]["total_records"]
    )

    print(
        "Quality score:",
        result["validation"]["quality_score"]
    )

    print(
        "History status:",
        result["history"]["status"]
    )

    print(
        "Saved Run ID:",
        result["history"]["run_id"]
    )

    print(
        "PII stored in history:",
        result["history"]["pii_stored"]
    )

    assert result["status"] == "completed"

    assert result["stage_count"] == 3

    assert result["read_only"] is True

    assert result["ai_used"] is False

    assert result["history"]["status"] == "saved"

    assert result["history"]["pii_stored"] is False

    print()
    print("PASS: Three-stage ETL completed.")
    print("PASS: Pipeline response verified.")
    print("PASS: History record committed.")
    print("PASS: No customer rows stored in history.")
    print("PASS: No automatic AI calls.")
