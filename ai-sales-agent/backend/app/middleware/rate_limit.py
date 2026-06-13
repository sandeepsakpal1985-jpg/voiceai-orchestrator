"""
Rate Limiting Middleware — Token bucket algorithm with in-memory tracking.
"""

import logging
import os
import time
from collections import defaultdict
from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("ai_sales_agent.middleware.rate_limit")

_RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
_RATE_LIMIT_WINDOW_SEC = int(os.getenv("RATE_LIMIT_WINDOW_SEC", "60"))
_RATE_LIMIT_EXCLUDED = {"/health", "/docs", "/redoc", "/openapi.json", "/twilio"}


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._buckets: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path
        for prefix in _RATE_LIMIT_EXCLUDED:
            if path.startswith(prefix):
                return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()

        key = f"ratelimit:{client_ip}"
        now = time.time()
        cutoff = now - _RATE_LIMIT_WINDOW_SEC
        self._buckets[key] = [t for t in self._buckets[key] if t > cutoff]

        if len(self._buckets[key]) >= _RATE_LIMIT_REQUESTS:
            logger.warning("Rate limit exceeded for %s", client_ip)
            return JSONResponse(status_code=429, content={"error": "Too many requests", "detail": f"Limit: {_RATE_LIMIT_REQUESTS} requests per {_RATE_LIMIT_WINDOW_SEC}s"})

        self._buckets[key].append(now)
        response = await call_next(request)
        remaining = _RATE_LIMIT_REQUESTS - len(self._buckets[key])
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
