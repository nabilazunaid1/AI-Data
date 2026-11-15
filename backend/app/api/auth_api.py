"""
AI Data Guardian 3.0
Authentication API.

Provides an authenticated identity endpoint.
"""

from fastapi import (
    APIRouter,
    Security,
)

from app.security.auth import (
    GuardianIdentity,
    get_current_identity,
)

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["Authentication"],
)


@router.get("/me")
async def get_my_identity(
    identity: GuardianIdentity = Security(
        get_current_identity
    ),
):
    return {
        "authenticated": True,
        "role": identity.role,
    }
