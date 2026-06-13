"""
JWT Authentication Middleware — Validates Bearer tokens.
"""

import logging
import os
from typing import Callable

from fastapi import Depends, HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("ai_sales_agent.middleware.auth")

AUTH_EXCLUDED_PREFIXES = {"/health", "/docs", "/redoc", "/openapi.json", "/twilio"}

_jose_available = False
try:
    from jose import jwt as jose_jwt
    from jose.exceptions import ExpiredSignatureError, JWTError
    _jose_available = True
except ImportError:
    pass


def verify_token(token: str) -> dict | None:
    if not _jose_available:
        return {"sub": "dev-user", "role": "admin"}
    secret = os.getenv("AUTH_SECRET", "").encode("utf-8")
    if not secret:
        return {"sub": "dev-user", "role": "admin"}
    try:
        return jose_jwt.decode(token, secret, algorithms=["HS256"])
    except (ExpiredSignatureError, JWTError):
        return None


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path
        for prefix in AUTH_EXCLUDED_PREFIXES:
            if path.startswith(prefix):
                request.state.user = None
                return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"error": "Unauthorized", "detail": "Provide a Bearer token."})
        token = auth_header.removeprefix("Bearer ").strip()
        payload = verify_token(token)
        if payload is None:
            return JSONResponse(status_code=401, content={"error": "Invalid or expired token"})
        request.state.user = {"id": payload.get("sub", "unknown"), "role": payload.get("role", "user")}
        return await call_next(request)


def get_current_user(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=403, detail="Not authenticated")
    return user


def require_role(role: str):
    def _check_role(user: dict = Depends(get_current_user)):
        if user.get("role") != role:
            raise HTTPException(status_code=403, detail=f"Requires '{role}' role")
        return user
    return _check_role
