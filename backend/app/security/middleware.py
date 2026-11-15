"""
AI Data Guardian 3.0
Centralized authorization middleware.

Route resolution uses registered OpenAPI paths rather
than FastAPI's internal router wrapper objects.

Authorization is not registered in main.py yet.
"""

from functools import lru_cache

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.routing import compile_path

from app.security.enforcement import authorize_request


@lru_cache(maxsize=256)
def compile_route_template(template: str):
    """
    Compile a FastAPI route template into a matcher.
    """
    regex, _, _ = compile_path(template)
    return regex


def resolve_route_template(
    app,
    method: str,
    path: str,
) -> str | None:
    """
    Resolve a request to an explicitly registered
    OpenAPI operation.

    Unknown routes return None and are denied.
    """
    schema = app.openapi()

    for template, operations in schema.get("paths", {}).items():

        if method.lower() not in operations:
            continue

        pattern = compile_route_template(template)

        if pattern.fullmatch(path):
            return template

    return None


class GuardianAuthorizationMiddleware(BaseHTTPMiddleware):
    """
    Centralized HTTP authentication and authorization.
    """

    def __init__(self, app, enabled: bool = False):
        super().__init__(app)
        self.enabled = enabled

    async def dispatch(self, request: Request, call_next):

        if not self.enabled:
            return await call_next(request)

        # Let CORS middleware handle browser preflight.
        if request.method == "OPTIONS":
            return await call_next(request)

        route_path = resolve_route_template(
            app=request.app,
            method=request.method,
            path=request.scope["path"],
        )

        if route_path is None:
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Operation is not permitted"
                },
            )

        try:
            authorize_request(
                method=request.method,
                route_path=route_path,
                authorization=request.headers.get(
                    "Authorization"
                ),
            )

        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers=exc.headers,
            )

        return await call_next(request)
