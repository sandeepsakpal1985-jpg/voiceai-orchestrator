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

    # ── Conversation Persistence ──

    async def save_conversation(self, conversation_id: str, data: dict) -> None:
        key = f"conv:{conversation_id}"
        self._sip_calls[key] = {**data, "updated_at": time.time()}

    async def get_conversation(self, conversation_id: str) -> dict | None:
        key = f"conv:{conversation_id}"
        return self._sip_calls.get(key)

    async def update_conversation_status(self, conversation_id: str, status: str) -> bool:
        key = f"conv:{conversation_id}"
        call = self._sip_calls.get(key)
        if call:
            call["status"] = status
            call["updated_at"] = time.time()
            if status in ("completed", "failed"):
                call["ended_at"] = time.time()
            return True
        return False

    async def list_active_conversations(self) -> list[dict]:
        return [
            {**c, "conversation_id": k.split(":", 1)[1]}
            for k, c in self._sip_calls.items()
            if k.startswith("conv:")
            and isinstance(c, dict)
            and c.get("status") in ("in_progress", "initializing")
        ]

    # ── Semantic Cache (RAG) ──

    async def semantic_cache_get(self, key: str) -> bytes | None:
        cache_key = f"rag_cache:{key}"
        if cache_key in self._sip_calls:
            val = self._sip_calls[cache_key]
            if isinstance(val, dict) and "data" in val:
                expiry = val.get("expires_at", 0)
                if time.time() < expiry:
                    return val["data"]
                else:
                    # Clean up expired entry
                    del self._sip_calls[cache_key]
        return None

    async def semantic_cache_set(self, key: str, value: bytes, ttl_sec: int = 300) -> None:
        cache_key = f"rag_cache:{key}"
        self._sip_calls[cache_key] = {
            "data": value,
            "expires_at": time.time() + ttl_sec,
            "created_at": time.time(),
        }

    async def semantic_cache_invalidate(self, pattern: str) -> int:
        """Invalidate cache entries whose key contains the pattern. Returns count invalidated."""
        full_pattern = f"rag_cache:{pattern}"
        keys = [k for k in self._sip_calls if full_pattern in k or (k.startswith("rag_cache:") and pattern in k)]
        for k in keys:
            del self._sip_calls[k]
        return len(keys)

    # ── Session State ──

    async def save_session_state(self, session_id: str, data: dict, ttl_sec: int = 3600) -> None:
        key = f"session:{session_id}"
        self._sip_calls[key] = {
            **data,
            "_expires_at": time.time() + ttl_sec,
            "_updated_at": time.time(),
        }

    async def get_session_state(self, session_id: str) -> dict | None:
        key = f"session:{session_id}"
        val = self._sip_calls.get(key)
        if val and isinstance(val, dict):
            if val.get("_expires_at", 0) > time.time():
                return {k: v for k, v in val.items() if not k.startswith("_")}
            else:
                del self._sip_calls[key]
        return None

    async def delete_session_state(self, session_id: str) -> bool:
        key = f"session:{session_id}"
        return self._sip_calls.pop(key, None) is not None

    # ── Health ──

    async def ping(self) -> bool:
        return True

    async def get_stats(self) -> dict:
        conv_count = len([k for k in self._sip_calls if k.startswith("conv:")])
        session_count = len([k for k in self._sip_calls if k.startswith("session:")])
        cache_entries = len([k for k in self._sip_calls if k.startswith("rag_cache:")])
        return {
            "sip_calls_stored": len([k for k in self._sip_calls if k.startswith("sip:")]),
            "active_sip_calls": len([c for c in self._sip_calls.values() if isinstance(c, dict) and c.get("status") == "active"]),
            "usage_keys": len(self._usage),
            "voice_profiles": len(self._voice_profiles),
            "conversations": conv_count,
            "sessions": session_count,
            "semantic_cache_entries": cache_entries,
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

    # ── Conversation Persistence ──

    async def save_conversation(self, conversation_id: str, data: dict) -> None:
        key = self._k(f"conv:{conversation_id}")
        await self._r.hset(key, mapping={
            k: str(v) if isinstance(v, (int, float)) else json.dumps(v) if isinstance(v, (dict, list)) else v
            for k, v in {**data, "updated_at": time.time()}.items()
        })
        await self._r.expire(key, 86400)  # 24h

    async def get_conversation(self, conversation_id: str) -> dict | None:
        key = self._k(f"conv:{conversation_id}")
        data = await self._r.hgetall(key)
        if not data:
            return None
        return self._deserialize_generic(data)

    async def update_conversation_status(self, conversation_id: str, status: str) -> bool:
        key = self._k(f"conv:{conversation_id}")
        exists = await self._r.exists(key)
        if exists:
            await self._r.hset(key, "status", status)
            await self._r.hset(key, "updated_at", time.time())
            if status in ("completed", "failed"):
                await self._r.hset(key, "ended_at", time.time())
            return True
        return False

    async def list_active_conversations(self) -> list[dict]:
        keys = await self._r.keys(self._k("conv:*"))
        active = []
        for key in keys:
            data = await self._r.hgetall(key)
            if data and data.get("status") in ("in_progress", "initializing"):
                active.append(self._deserialize_generic(data))
        return active

    # ── Semantic Cache (RAG) ──

    async def semantic_cache_get(self, key: str) -> bytes | None:
        redis_key = self._k(f"rag_cache:{key}")
        val = await self._r.get(redis_key)
        if val is not None:
            return val.encode("latin-1") if isinstance(val, str) else val
        return None

    async def semantic_cache_set(self, key: str, value: bytes, ttl_sec: int = 300) -> None:
        redis_key = self._k(f"rag_cache:{key}")
        await self._r.setex(redis_key, ttl_sec, value)

    async def semantic_cache_invalidate(self, pattern: str) -> int:
        keys = await self._r.keys(self._k(f"rag_cache:*{pattern}*"))
        if keys:
            await self._r.delete(*keys)
        return len(keys)

    # ── Session State ──

    async def save_session_state(self, session_id: str, data: dict, ttl_sec: int = 3600) -> None:
        key = self._k(f"session:{session_id}")
        await self._r.hset(key, mapping={
            k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) if not isinstance(v, str) else v
            for k, v in {**data, "_updated_at": time.time()}.items()
        })
        await self._r.expire(key, ttl_sec)

    async def get_session_state(self, session_id: str) -> dict | None:
        key = self._k(f"session:{session_id}")
        data = await self._r.hgetall(key)
        if not data:
            return None
        return {k: v for k, v in self._deserialize_generic(data).items() if not k.startswith("_")}

    async def delete_session_state(self, session_id: str) -> bool:
        key = self._k(f"session:{session_id}")
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
        conv_keys = await self._r.keys(self._k("conv:*"))
        session_keys = await self._r.keys(self._k("session:*"))
        cache_keys = await self._r.keys(self._k("rag_cache:*"))
        return {
            "sip_calls_stored": len(sip_keys),
            "usage_keys": len(usage_keys),
            "voice_profiles": len(vp_keys),
            "conversations": len(conv_keys),
            "sessions": len(session_keys),
            "semantic_cache_entries": len(cache_keys),
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

    def _deserialize_generic(self, data: dict) -> dict:
        """Deserialize Redis hash data with auto-detection of field types."""
        result = {}
        for k, v in data.items():
            if k in ("started_at", "ended_at", "updated_at", "_updated_at", "_expires_at"):
                try:
                    result[k] = float(v)
                except (ValueError, TypeError):
                    result[k] = v
            elif k in ("duration_seconds",):
                try:
                    result[k] = int(v)
                except (ValueError, TypeError):
                    result[k] = v
            elif isinstance(v, str) and len(v) > 2 and v[0] in ("{", "["):
                try:
                    result[k] = json.loads(v)
                except (json.JSONDecodeError, TypeError):
                    result[k] = v
            else:
                result[k] = v
        return result


# ── Global Persistence Instance ─────────────────────────────────────

_persistence_instance: _InMemoryStore | _RedisStore | None = None

# ── Redis-backed Semantic Cache for RAG ──


class SemanticCache:
    """Redis-backed semantic cache for RAG query results.

    Caches the results of expensive embedding queries so that
    repeated or similar queries return instantly.
    """

    def __init__(self, store=None):
        self._store = store

    async def get(self, key: str) -> bytes | None:
        """Get cached result for a query key.

        Args:
            key: Cache key (typically a hashed query string)

        Returns:
            Cached bytes data, or None if not found/expired
        """
        if self._store is None:
            try:
                self._store = await get_persistence()
            except Exception:
                return None
        return await self._store.semantic_cache_get(key)

    async def set(self, key: str, value: bytes, ttl_sec: int = 300) -> None:
        """Cache result for a query key.

        Args:
            key: Cache key
            value: Bytes data to cache
            ttl_sec: Time-to-live in seconds (default 5 min)
        """
        if self._store is None:
            try:
                self._store = await get_persistence()
            except Exception:
                return
        await self._store.semantic_cache_set(key, value, ttl_sec=ttl_sec)

    async def invalidate(self, pattern: str) -> int:
        """Invalidate cache entries matching a pattern."""
        if self._store is None:
            return 0
        return await self._store.semantic_cache_invalidate(pattern)


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
