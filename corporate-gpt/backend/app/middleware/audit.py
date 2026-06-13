"""
Audit Logging Middleware — Tracks all API operations for compliance.

Logs every state-changing request (POST, PUT, PATCH, DELETE) to the audit_logs table.
Supports async DB writes with minimal latency overhead.
"""
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.config import settings
from app.models.audit_log import AuditLog

logger = logging.getLogger("corpgpt.audit")


def _extract_user_info(request: Request) -> dict:
    """Extract user info from request state if available."""
    user = getattr(request.state, "user", None)
    if user:
        return {
            "user_id": user.get("id", "unknown"),
            "user_email": user.get("email", ""),
        }
    return {"user_id": None, "user_email": None}


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request headers."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class AuditMiddleware(BaseHTTPMiddleware):
    """Middleware that logs state-changing API requests to the audit_logs table.
    
    Only logs POST, PUT, PATCH, DELETE requests to avoid filling the log
    with GET/HEAD requests. Skips health checks and docs.
    """

    EXCLUDED_PATHS = {"/health", "/docs", "/redoc", "/openapi.json", "/api/v1/health"}
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip excluded paths and read-only methods
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)
        
        path = request.url.path
        if path in self.EXCLUDED_PATHS:
            return await call_next(request)

        # Process the request
        start_time = time.time()
        response = await call_next(request)
        duration_ms = int((time.time() - start_time) * 1000)

        # Log to audit table (fire-and-forget via background task)
        user_info = _extract_user_info(request)
        
        try:
            # Extract org from path: /api/v1/{org_context}/...
            path_parts = path.split("/")
            org_id = ""  # Will be enriched when auth provides org context
            
            audit_entry = AuditLog(
                id=str(uuid.uuid4()),
                organization_id=org_id,
                user_id=user_info.get("user_id"),
                action=f"{request.method.lower()}.{path_parts[-1]}",
                resource_type=path_parts[3] if len(path_parts) > 3 else "unknown",
                resource_id=path.split("/")[-1] if path.count("/") > 2 else None,
                details={
                    "method": request.method,
                    "path": path,
                    "query_params": dict(request.query_params),
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                },
                ip_address=_get_client_ip(request),
                created_at=datetime.now(timezone.utc),
            )
            
            from app.core.database import get_session_factory
            async with get_session_factory() as session:
                session.add(audit_entry)
                await session.commit()
        except Exception as e:
            logger.warning("Failed to write audit log: %s", e)

        return response


async def log_audit_entry(
    db_session,
    organization_id: str,
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str = None,
    details: dict = None,
    ip_address: str = "unknown",
):
    """Helper to manually create audit log entries from within endpoints."""
    entry = AuditLog(
        id=str(uuid.uuid4()),
        organization_id=organization_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details or {},
        ip_address=ip_address,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(entry)
