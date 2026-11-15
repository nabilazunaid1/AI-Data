"""
AI Data Guardian 3.0
Backend-managed browser session API.

Development prototype.
Not registered in main.py yet.
"""

import os

from fastapi import (
    APIRouter,
    HTTPException,
    Request,
    Response,
    status,
)
from pydantic import BaseModel, Field

from app.security.session_store import session_store
from app.security.user_store import user_store

router = APIRouter(
    prefix="/api/v1/session",
    tags=["Browser Sessions"],
)

COOKIE_NAME = "guardian_session"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=1024)


def cookie_secure() -> bool:
    return os.getenv(
        "GUARDIAN_ENV",
        "production",
    ).strip().lower() != "development"


@router.post("/login")
def login(
    payload: LoginRequest,
    response: Response,
):
    account = user_store.authenticate(
        payload.username,
        payload.password,
    )

    if account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    session_token, csrf_token = session_store.create(
        user_id=account.username,
        role=account.role,
    )

    response.set_cookie(
        key=COOKIE_NAME,
        value=session_token,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        max_age=session_store.ttl_seconds,
        path="/",
    )

    return {
        "authenticated": True,
        "username": account.username,
        "role": account.role,
        "csrf_token": csrf_token,
    }


@router.get("/me")
def session_identity(request: Request):
    session_token = request.cookies.get(COOKIE_NAME)

    identity = session_store.get(session_token)

    if identity is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    return {
        "authenticated": True,
        "username": identity.user_id,
        "role": identity.role,
    }


@router.post("/logout")
def logout(request: Request, response: Response):
    session_token = request.cookies.get(COOKIE_NAME)

    csrf_token = request.headers.get(
        "X-CSRF-Token"
    )

    if not session_store.verify_csrf(
        session_token,
        csrf_token,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF verification failed",
        )

    session_store.revoke(session_token)

    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        samesite="lax",
        secure=cookie_secure(),
        httponly=True,
    )

    return {"logged_out": True}
