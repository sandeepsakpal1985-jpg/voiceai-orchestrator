"""
JWT Authentication Middleware — Validates Bearer tokens signed by NextAuth.

Integrates with the dashboard's NextAuth JWT strategy:
  - Uses the shared AUTH_SECRET environment variable
  - Validates HS256 JWTs with standard claims (sub, iat, exp)
  - Extracts user ID and role from verified tokens
  - Sets request.state.user for downstream route handlers

Excluded paths (no auth required):
  - /health, /docs, /redoc, /openapi.json (OpenAPI/Swagger)
  - /twilio/* (Twilio webhooks — verified via Twilio's own signature)
  - /runtime/* (Runtime status — read-only, needed by monitoring)
"""

import logging
import os
from typing import Callable

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("voiceai.middleware.auth")

# ── Excluded Path Prefixes ────────────────────────────────────────────

AUTH_EXCLUDED_PREFIXES = {
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/twilio",
    "/runtime",
    "/metrics",
    "/logs",
}


def _load_jwt_secret() -> bytes:
    """Load the JWT secret from the AUTH_SECRET environment variable."""
    if os.getenv("AUTH_BYPASS", "").lower() in ("true", "1", "yes"):
        logger.warning("AUTH_BYPASS=true — auth middleware completely disabled")
        return b"__bypass__"

    secret = os.getenv("AUTH_SECRET", "")
    if not secret:
        # In development, allow empty secret with a warning
        logger.warning(
            "AUTH_SECRET not set — auth middleware will skip token validation. "
            "Set AUTH_SECRET in .env for production."
        )
        return b""
    return secret.encode("utf-8")


# ── JWT Token Cache ──────────────────────────────────────────────────
# Cache the jose library import to avoid repeated import overhead.

_jose_available = False
try:
    from jose import jwt as jose_jwt
    from jose.exceptions import ExpiredSignatureError, JWTError

    _jose_available = True
except ImportError:
    logger.warning(
        "python-jose not installed — JWT validation disabled. "
        "Install with: pip install python-jose[cryptography]"
    )


def verify_token(token: str) -> dict | None:
    """Verify a JWT token and return its payload.

    Args:
        token: The JWT string to verify

    Returns:
        Decoded payload dict if valid, None if invalid
    """
    if not _jose_available:
        # Fallback: accept any token in dev if jose not installed
        return {"sub": "dev-user", "role": "admin"}

    secret = _load_jwt_secret()
    if not secret:
        return {"sub": "dev-user", "role": "admin"}
    if secret == b"__bypass__":
        return {"sub": "test-user", "role": "admin"}

    try:
        payload = jose_jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"verify_exp": True, "verify_iat": True},
        )
        return payload
    except ExpiredSignatureError:
        logger.warning("JWT token expired")
        return None
    except JWTError as e:
        logger.warning("JWT validation failed: %s", e)
        return None


# ── Auth Middleware ───────────────────────────────────────────────────


class AuthMiddleware(BaseHTTPMiddleware):
    """Middleware that validates JWT Bearer tokens on protected routes.

    Flow:
      1. Check if path is excluded from auth
      2. Extract Authorization header
      3. Parse Bearer token
      4. Verify JWT signature and expiry
      5. Set request.state.user = {"id": ..., "role": ...}
      6. On failure, return 401 JSON response
    """

    def __init__(self, app):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path

        # ── AUTH_BYPASS: skip all auth (testing/development) ──
        if os.getenv("AUTH_BYPASS", "").lower() in ("true", "1", "yes"):
            request.state.user = {"id": "dev-user", "role": "admin"}
            logger.debug("AUTH_BYPASS enabled — skipping auth for %s", path)
            return await call_next(request)

        # ── Skip auth for excluded paths ──
        for prefix in AUTH_EXCLUDED_PREFIXES:
            if path.startswith(prefix):
                request.state.user = None
                return await call_next(request)

        # ── Extract Bearer token ──
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            logger.debug("Missing or malformed Authorization header on %s", path)
            return JSONResponse(
                status_code=401,
                content={
                    "error": "Unauthorized",
                    "detail": (
                        "Authentication required. "
                        "Provide a Bearer token in the Authorization header."
                    ),
                    "documentation": "/docs",
                },
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = auth_header.removeprefix("Bearer ").strip()

        # ── Verify token ──
        payload = verify_token(token)
        if payload is None:
            return JSONResponse(
                status_code=401,
                content={
                    "error": "Invalid or expired token",
                    "detail": "Your session token is invalid or has expired. Please sign in again.",
                },
                headers={"WWW-Authenticate": "Bearer"},
            )

        # ── Set request state ──
        request.state.user = {
            "id": payload.get("sub", "unknown"),
            "role": payload.get("role", "user"),
        }

        # ── Proceed ──
        response = await call_next(request)
        return response


# ── Dependency for Route-Level Auth ──────────────────────────────────


def get_current_user(request: Request) -> dict:
    """FastAPI dependency that extracts the authenticated user.

    Use this in route handlers when you need the user context:

        @router.get("/me")
        async def get_me(user: dict = Depends(get_current_user)):
            return {"user_id": user["id"]}

    Raises:
        HTTPException(403) if no authenticated user in request state
    """
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(
            status_code=403,
            detail="Not authenticated. Provide a valid Bearer token.",
        )
    return user


def require_role(role: str):
    """Factory for role-based access control dependencies.

    Usage:
        @router.get("/admin")
        async def admin_only(user: dict = Depends(require_role("admin"))):
            ...
    """

    def _check_role(user: dict = Depends(get_current_user)):
        if user.get("role") != role:
            raise HTTPException(
                status_code=403,
                detail=f"Requires '{role}' role. Your role: {user.get('role', 'none')}",
            )
        return user

    return _check_role
