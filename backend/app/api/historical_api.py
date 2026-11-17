"""Privacy-safe historical monitoring API."""

import psycopg

from fastapi import APIRouter, HTTPException, Query

from app.connectors.historical_postgres import (
    historical_health,
    historical_schema,
    historical_trend,
)

router = APIRouter(prefix="/api/v1/historical")


@router.get("/health")
def get_historical_health():
    try:
        result = historical_health()
        if not result["read_only"]:
            raise RuntimeError("Read-only configuration required.")
        return result
    except (psycopg.Error, RuntimeError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Historical database is unavailable.",
        )


@router.get("/schema")
def get_historical_schema():
    try:
        return historical_schema()
    except (psycopg.Error, RuntimeError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Historical schema is unavailable.",
        )


@router.get("/trend")
def get_historical_trend(
    granularity: str = Query(
        default="month",
        pattern="^(hour|day|week|month|year)$",
    )
):
    try:
        return historical_trend(granularity)
    except (psycopg.Error, RuntimeError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Historical trend is unavailable.",
        )

from app.anomaly.historical_detector import (
    detect_monthly_outliers,
)


# Historical statistical investigation.
# SQL aggregates data; Python detects retrospective outliers.
# No raw customer records or AI inference.
@router.get("/anomalies")
def get_historical_anomalies():
    try:
        trend = historical_trend("month")
        return detect_monthly_outliers(trend)

    except (psycopg.Error, RuntimeError, ValueError, KeyError):
        raise HTTPException(
            status_code=503,
            detail="Historical anomaly analysis is unavailable.",
        )
