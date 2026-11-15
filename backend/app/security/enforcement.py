"""
AI Data Guardian 3.0
Centralized authorization enforcement engine.

This module validates access decisions independently.
It is not yet connected to FastAPI middleware.
"""

from fastapi import HTTPException, status

from app.security.auth import (
    GuardianIdentity,
    authenticate_token,
    require_role,
)
from app.security.policy import get_access_level


def authorize_request(
    method: str,
    route_path: str,
    authorization: str | None,
) -> GuardianIdentity | None:
    """
    Check authentication and authorization.

    route_path must be the registered FastAPI route
    template, not an arbitrary user-supplied URL.
    """

    try:
        access_level = get_access_level(
            method,
            route_path,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation is not permitted",
        ) from None

    if access_level == "public":
        return None

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = authorization.split()

    if (
        len(parts) != 2
        or parts[0].lower() != "bearer"
        or not parts[1]
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    identity = authenticate_token(parts[1])

    if access_level == "authenticated":
        return identity

    return require_role(identity, access_level)
