"""
Rate Limiting Middleware — Token bucket algorithm with Redis backend support.

Protects the API from abuse by limiting requests per client IP.
Falls back to in-memory tracking when Redis is not configured.

Config:
  - RATE_LIMIT_REQUESTS: Max requests per window (default: 100)
  - RATE_LIMIT_WINDOW_SEC: Time window in seconds (default: 60)
  - Uses Redis when REDIS_URL is set for distributed rate limiting
"""

import logging
import os
import time
from collections import defaultdict
from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("voiceai.middleware.rate_limit")

# ── Rate Limit Configuration from Env ────────────────────────────────

_RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
_RATE_LIMIT_WINDOW_SEC = int(os.getenv("RATE_LIMIT_WINDOW_SEC", "60"))
_REDIS_URL = os.getenv("REDIS_URL", "")

# ── Excluded Paths ───────────────────────────────────────────────────

_RATE_LIMIT_EXCLUDED = {
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/twilio",
}


# ── Redis Client (lazy init) ─────────────────────────────────────────

_redis_client = None


def _get_redis():
    """Get or create a Redis connection."""
    global _redis_client
    if _redis_client is None and _REDIS_URL:
        try:
            import redis.asyncio as aioredis
            _redis_client = aioredis.from_url(
                _REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
        except ImportError:
            logger.warning("redis-py not installed — falling back to in-memory rate limiting")
        except Exception as e:
            logger.warning("Redis connection failed — falling back to in-memory: %s", e)
    return _redis_client


# ── In-Memory Rate Limiter (fallback) ────────────────────────────────

class _InMemoryRateLimiter:
    """Simple in-memory sliding window rate limiter."""

    def __init__(self):
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str, max_requests: int, window_sec: int) -> tuple[bool, int]:
        """Check if a request is allowed.

        Returns:
            (allowed: bool, remaining: int)
        """
        now = time.time()
        timestamps = self._buckets[key]

        # Purge old entries outside the window
        cutoff = now - window_sec
        self._buckets[key] = [t for t in timestamps if t > cutoff]

        if len(self._buckets[key]) >= max_requests:
            return False, 0

        self._buckets[key].append(now)
        remaining = max_requests - len(self._buckets[key])
        return True, remaining

    def get_remaining(self, key: str, max_requests: int, window_sec: int) -> int:
        now = time.time()
        cutoff = now - window_sec
        return max_requests - sum(1 for t in self._buckets.get(key, []) if t > cutoff)


_in_memory_limiter = _InMemoryRateLimiter()


# ── Rate Limit Middleware ────────────────────────────────────────────


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware that rate-limits requests per client IP."""

    def __init__(self, app):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path

        # ── Skip rate limiting for excluded paths ──
        for prefix in _RATE_LIMIT_EXCLUDED:
            if path.startswith(prefix):
                return await call_next(request)

        # ── Determine client key ──
        client_ip = request.client.host if request.client else "unknown"
        # Use X-Forwarded-For if behind proxy
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()

        key = f"ratelimit:{client_ip}:{path.split('/')[1] if '/' in path else 'root'}"

        # ── Try Redis first, fall back to in-memory ──
        redis_client = _get_redis()
        if redis_client:
            allowed = await self._check_redis(redis_client, key, client_ip)
        else:
            allowed, remaining = _in_memory_limiter.check(
                key, _RATE_LIMIT_REQUESTS, _RATE_LIMIT_WINDOW_SEC
            )

        if not allowed:
            logger.warning("Rate limit exceeded for %s on %s", client_ip, path)
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too many requests",
                    "detail": (
                        f"Rate limit exceeded: {_RATE_LIMIT_REQUESTS} requests "
                        f"per {_RATE_LIMIT_WINDOW_SEC}s. Try again later."
                    ),
                    "limit": _RATE_LIMIT_REQUESTS,
                    "window_seconds": _RATE_LIMIT_WINDOW_SEC,
                },
                headers={
                    "Retry-After": str(_RATE_LIMIT_WINDOW_SEC),
                    "X-RateLimit-Limit": str(_RATE_LIMIT_REQUESTS),
                },
            )

        # ── Proceed ──
        response = await call_next(request)

        # Add rate limit headers
        if not redis_client:
            remaining = _in_memory_limiter.get_remaining(
                key, _RATE_LIMIT_REQUESTS, _RATE_LIMIT_WINDOW_SEC
            )
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(
                int(time.time()) + _RATE_LIMIT_WINDOW_SEC
            )

        return response

    async def _check_redis(
        self, redis_client, key: str, client_ip: str
    ) -> bool:
        """Check rate limit using Redis."""
        try:
            current = await redis_client.get(key)
            if current is None:
                await redis_client.setex(key, _RATE_LIMIT_WINDOW_SEC, 1)
                return True

            count = int(current)
            if count >= _RATE_LIMIT_REQUESTS:
                return False

            await redis_client.incr(key)
            return True
        except Exception as e:
            logger.warning("Redis rate limit check failed: %s", e)
            # Fall back to in-memory
            remaining = _in_memory_limiter.check(
                f"{key}:fallback", _RATE_LIMIT_REQUESTS, _RATE_LIMIT_WINDOW_SEC
            )
            return remaining[0] if remaining else True
