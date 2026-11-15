"""
AI Data Guardian 3.0
Centralized authentication foundation.

This module is not connected to existing routes yet.
"""

import hashlib
import hmac
import os
from dataclasses import dataclass
from typing import Literal

from fastapi import (
    HTTPException,
    Security,
    status,
)
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)

Role = Literal["reader", "operator", "admin"]

bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="GuardianBearer",
    description="AI Data Guardian API access token",
)


@dataclass(frozen=True)
class GuardianIdentity:
    role: Role


def hash_token(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def verify_token(
    provided_token: str,
    expected_hash: str,
) -> bool:
    if not provided_token or not expected_hash:
        return False

    actual_hash = hash_token(provided_token)

    return hmac.compare_digest(
        actual_hash,
        expected_hash.lower(),
    )


def authenticate_token(token: str) -> GuardianIdentity:
    role_hashes = {
        "reader": os.getenv("GUARDIAN_READER_TOKEN_HASH", ""),
        "operator": os.getenv("GUARDIAN_OPERATOR_TOKEN_HASH", ""),
        "admin": os.getenv("GUARDIAN_ADMIN_TOKEN_HASH", ""),
    }

    for role, expected_hash in role_hashes.items():
        if verify_token(token, expected_hash):
            return GuardianIdentity(role=role)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_identity(
    credentials: HTTPAuthorizationCredentials | None = Security(
        bearer_scheme
    ),
) -> GuardianIdentity:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return authenticate_token(credentials.credentials)


def require_role(
    identity: GuardianIdentity,
    minimum_role: Role,
) -> GuardianIdentity:
    rank = {
        "reader": 1,
        "operator": 2,
        "admin": 3,
    }

    if rank[identity.role] < rank[minimum_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    return identity
