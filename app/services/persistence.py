"""
Persistence Layer — Redis-backed storage with in-memory fallback.

Provides persistent storage for:
  - Active SIP calls (call_id → SipCallInfo)
  - Usage tracking (per-user/org request counts)
  - Voice profile metadata
  - Rate limit state (distributed via Redis)

Architecture:
  Redis is preferred for production deployments with multiple workers.
  Falls back to in-memory dicts when Redis is unavailable (dev mode).

Usage:
    from app.services.persistence import get_persistence
    store = get_persistence()
    await store.save_sip_call(call_info)
    calls = await store.get_active_sip_calls()
"""

import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger("voiceai.persistence")

_REDIS_URL = os.getenv("REDIS_URL", "")

# ── Redis Client (lazy init) ─────────────────────────────────────────

_redis_client = None


def _get_redis():
    """Get or create a Redis connection (async)."""
    global _redis_client
    if _redis_client is None and _REDIS_URL:
        try:
            import redis.asyncio as aioredis

            _redis_client = aioredis.from_url(
                _REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=True,
            )
            logger.info("Redis connected: %s", _REDIS_URL.replace("://", "://***@"))
        except ImportError:
            logger.warning("redis-py not installed — using in-memory persistence")
        except Exception as e:
            logger.warning("Redis connection failed — using in-memory: %s", e)
    return _redis_client


# ── In-Memory Fallback Store ────────────────────────────────────────


class _InMemoryStore:
    """Thread-safe in-memory store as fallback when Redis is unavailable."""

    def __init__(self):
        self._sip_calls: dict[str, dict] = {}
        self._usage: dict[str, list[float]] = {}  # key → [timestamps]
        self._voice_profiles: dict[str, dict] = {}
        self._rate_limit_buckets: dict[str, list[float]] = {}

    # ── SIP Calls ──

    async def save_sip_call(self, call_id: str, call_data: dict) -> None:
        self._sip_calls[call_id] = {**call_data, "updated_at": time.time()}

    async def get_sip_call(self, call_id: str) -> dict | None:
        return self._sip_calls.get(call_id)

    async def get_active_sip_calls(self) -> list[dict]:
        return [
            c for c in self._sip_calls.values()
            if c.get("status") in ("active", "ringing")
        ]

    async def end_sip_call(self, call_id: str) -> bool:
        call = self._sip_calls.get(call_id)
        if call:
            call["status"] = "completed"
            call["ended_at"] = time.time()
            return True
        return False

    async def cleanup_stale_calls(self, max_age_sec: int = 3600) -> int:
        now = time.time()
        stale = [
            cid for cid, c in self._sip_calls.items()
            if c.get("status") == "completed"
            and now - c.get("ended_at", now) > max_age_sec
        ]
        for cid in stale:
            del self._sip_calls[cid]
        return len(stale)

    # ── Usage Tracking ──

    async def record_usage(self, key: str) -> int:
        now = time.time()
        if key not in self._usage:
            self._usage[key] = []
        self._usage[key].append(now)
        # Trim entries older than 1 hour
        cutoff = now - 3600
        self._usage[key] = [t for t in self._usage[key] if t > cutoff]
        return len(self._usage[key])

    async def get_usage_count(self, key: str, window_sec: int = 3600) -> int:
        cutoff = time.time() - window_sec
        timestamps = self._usage.get(key, [])
        return sum(1 for t in timestamps if t > cutoff)

    async def get_all_usage_keys(self) -> list[str]:
        return list(self._usage.keys())

    # ── Voice Profiles ──

    async def save_voice_profile(self, profile_id: str, profile: dict) -> None:
        self._voice_profiles[profile_id] = {**profile, "updated_at": time.time()}

    async def get_voice_profile(self, profile_id: str) -> dict | None:
        return self._voice_profiles.get(profile_id)

    async def list_voice_profiles(self) -> list[dict]:
        return list(self._voice_profiles.values())

    async def delete_voice_profile(self, profile_id: str) -> bool:
        if profile_id in self._voice_profiles:
            del self._voice_profiles[profile_id]
            return True
        return False

    # ── Health ──

    async def ping(self) -> bool:
        return True

    async def get_stats(self) -> dict:
        return {
            "sip_calls_stored": len(self._sip_calls),
            "active_sip_calls": len([c for c in self._sip_calls.values() if c.get("status") == "active"]),
            "usage_keys": len(self._usage),
            "voice_profiles": len(self._voice_profiles),
            "backend": "memory",
        }


# ── Redis Store ─────────────────────────────────────────────────────


class _RedisStore:
    """Redis-backed persistent store."""

    def __init__(self, redis_client):
        self._r = redis_client
        self._prefix = "voiceai:"

    def _k(self, key: str) -> str:
        return f"{self._prefix}{key}"

    # ── SIP Calls ──

    async def save_sip_call(self, call_id: str, call_data: dict) -> None:
        key = self._k(f"sip:{call_id}")
        await self._r.hset(key, mapping={
            k: str(v) if isinstance(v, (int, float)) and k in ("started_at", "ended_at")
            else json.dumps(v) if isinstance(v, (dict, list))
            else v
            for k, v in {**call_data, "updated_at": time.time()}.items()
        })
        await self._r.expire(key, 86400)  # Auto-expire after 24h

    async def get_sip_call(self, call_id: str) -> dict | None:
        key = self._k(f"sip:{call_id}")
        data = await self._r.hgetall(key)
        if not data:
            return None
        return self._deserialize_sip(data)

    async def get_active_sip_calls(self) -> list[dict]:
        keys = await self._r.keys(self._k("sip:*"))
        calls = []
        for key in keys:
            data = await self._r.hgetall(key)
            if data and data.get("status") in ("active", "ringing"):
                calls.append(self._deserialize_sip(data))
        return calls

    async def end_sip_call(self, call_id: str) -> bool:
        key = self._k(f"sip:{call_id}")
        exists = await self._r.exists(key)
        if exists:
            await self._r.hset(key, "status", "completed")
            await self._r.hset(key, "ended_at", time.time())
            return True
        return False

    async def cleanup_stale_calls(self, max_age_sec: int = 3600) -> int:
        keys = await self._r.keys(self._k("sip:*"))
        now = time.time()
        cleaned = 0
        for key in keys:
            ended_at = await self._r.hget(key, "ended_at")
            if ended_at and now - float(ended_at) > max_age_sec:
                await self._r.delete(key)
                cleaned += 1
        return cleaned

    # ── Usage Tracking ──

    async def record_usage(self, key: str) -> int:
        redis_key = self._k(f"usage:{key}")
        now = time.time()
        await self._r.zadd(redis_key, {str(now): now})
        # Trim entries older than 1 hour
        cutoff = now - 3600
        await self._r.zremrangebyscore(redis_key, 0, cutoff)
        await self._r.expire(redis_key, 7200)
        return await self._r.zcard(redis_key)

    async def get_usage_count(self, key: str, window_sec: int = 3600) -> int:
        redis_key = self._k(f"usage:{key}")
        cutoff = time.time() - window_sec
        await self._r.zremrangebyscore(redis_key, 0, cutoff)
        return await self._r.zcard(redis_key)

    async def get_all_usage_keys(self) -> list[str]:
        keys = await self._r.keys(self._k("usage:*"))
        prefix_len = len(self._k("usage:"))
        return [k[prefix_len:] for k in keys]

    # ── Voice Profiles ──

    async def save_voice_profile(self, profile_id: str, profile: dict) -> None:
        key = self._k(f"vp:{profile_id}")
        await self._r.hset(key, mapping={
            k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) if not isinstance(v, str) else v
            for k, v in {**profile, "updated_at": time.time()}.items()
        })
        await self._r.expire(key, 604800)  # 7 days

    async def get_voice_profile(self, profile_id: str) -> dict | None:
        key = self._k(f"vp:{profile_id}")
        data = await self._r.hgetall(key)
        if not data:
            return None
        return self._deserialize_vp(data)

    async def list_voice_profiles(self) -> list[dict]:
        keys = await self._r.keys(self._k("vp:*"))
        profiles = []
        for key in keys:
            data = await self._r.hgetall(key)
            if data:
                profiles.append(self._deserialize_vp(data))
        return profiles

    async def delete_voice_profile(self, profile_id: str) -> bool:
        key = self._k(f"vp:{profile_id}")
        result = await self._r.delete(key)
        return result > 0

    # ── Health ──

    async def ping(self) -> bool:
        try:
            return await self._r.ping()
        except Exception:
            return False

    async def get_stats(self) -> dict:
        sip_keys = await self._r.keys(self._k("sip:*"))
        usage_keys = await self._r.keys(self._k("usage:*"))
        vp_keys = await self._r.keys(self._k("vp:*"))
        return {
            "sip_calls_stored": len(sip_keys),
            "usage_keys": len(usage_keys),
            "voice_profiles": len(vp_keys),
            "backend": "redis",
            "redis_ping": await self.ping(),
        }

    # ── Helpers ──

    def _deserialize_sip(self, data: dict) -> dict:
        result = {}
        for k, v in data.items():
            if k in ("started_at", "ended_at", "updated_at"):
                try:
                    result[k] = float(v)
                except (ValueError, TypeError):
                    result[k] = v
            elif k == "duration_seconds":
                try:
                    result[k] = int(v)
                except (ValueError, TypeError):
                    result[k] = v
            else:
                result[k] = v
        return result

    def _deserialize_vp(self, data: dict) -> dict:
        result = {}
        for k, v in data.items():
            if k in ("updated_at",):
                try:
                    result[k] = float(v)
                except (ValueError, TypeError):
                    result[k] = v
            elif k == "metadata":
                try:
                    result[k] = json.loads(v)
                except (json.JSONDecodeError, TypeError):
                    result[k] = v
            else:
                result[k] = v
        return result


# ── Global Persistence Instance ─────────────────────────────────────

_persistence_instance: _InMemoryStore | _RedisStore | None = None


async def get_persistence():
    """Get the global persistence store (Redis if available, else in-memory)."""
    global _persistence_instance
    if _persistence_instance is not None:
        return _persistence_instance

    redis_client = _get_redis()
    if redis_client:
        _persistence_instance = _RedisStore(redis_client)
        logger.info("Persistence: Redis (distributed)")
    else:
        _persistence_instance = _InMemoryStore()
        logger.info("Persistence: In-memory (single-worker)")

    return _persistence_instance


async def reset_persistence():
    """Reset the persistence store (for testing)."""
    global _persistence_instance
    _persistence_instance = None
