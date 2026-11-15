"""
AI Data Guardian 3.0
Reusable role-based authorization dependencies.
"""

from typing import Annotated

from fastapi import Depends

from app.security.auth import (
    GuardianIdentity,
    get_current_identity,
    require_role,
)


async def require_reader(
    identity: Annotated[
        GuardianIdentity,
        Depends(get_current_identity),
    ],
) -> GuardianIdentity:
    return require_role(identity, "reader")


async def require_operator(
    identity: Annotated[
        GuardianIdentity,
        Depends(get_current_identity),
    ],
) -> GuardianIdentity:
    return require_role(identity, "operator")


async def require_admin(
    identity: Annotated[
        GuardianIdentity,
        Depends(get_current_identity),
    ],
) -> GuardianIdentity:
    return require_role(identity, "admin")
