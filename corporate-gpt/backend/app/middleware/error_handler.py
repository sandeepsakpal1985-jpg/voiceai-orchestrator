"""
Structured Error Handler — Ensures all API errors return consistent JSON format.

Catches unhandled exceptions and returns:
{
    "error": "Internal Server Error",
    "detail": "Something went wrong",
    "request_id": "...",
    "documentation": "/docs"
}
"""
import logging
import uuid
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger("corpgpt.error_handler")


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Middleware that catches unhandled exceptions and returns structured JSON errors."""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.exception(
                "Unhandled exception [req=%s] %s %s",
                request_id, request.method, request.url.path,
            )
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal Server Error",
                    "detail": str(e) if str(e) else "An unexpected error occurred",
                    "request_id": request_id,
                    "documentation": "/docs",
                },
            )
