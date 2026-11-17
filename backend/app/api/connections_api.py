"""Database connection registry API.

Returns approved metadata only; no credentials or raw rows.
"""

from fastapi import APIRouter, HTTPException

from app.connectors.connection_registry import (
    get_registered_connection,
    list_registered_connections,
)

router = APIRouter(
    prefix="/api/v1/connections",
    tags=["Database Connections"],
)


@router.get("")
def list_connections():
    items = list_registered_connections()

    return {
        "status": "success",
        "connections": items,
        "total_connections": len(items),
        "credentials_included": False,
        "raw_records_included": False,
    }


@router.get("/{connection_id}")
def get_connection(connection_id: str):
    item = get_registered_connection(connection_id)

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Connection is not registered.",
        )

    return {
        "status": "success",
        "connection": item,
        "credentials_included": False,
        "raw_records_included": False,
    }
