"""
Persistence Layer — Redis-backed storage with in-memory fallback.

Provides persistent storage for conversations, SIP calls, usage tracking,
voice profiles, session state, and semantic cache (RAG).

Architecture:
  Redis is preferred for production deployments with multiple workers.
  Falls back to in-memory dicts when Redis is unavailable (dev mode).
"""

import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger("ai_sales_agent.persistence")

_REDIS_URL = os.getenv("REDIS_URL", "")

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None and _REDIS_URL:
        try:
            import redis.asyncio as aioredis
            _redis_client = aioredis.from_url(_REDIS_URL, decode_responses=True, socket_connect_timeout=2, socket_timeout=2, retry_on_timeout=True)
            logger.info("Redis connected")
        except ImportError:
            logger.warning("redis-py not installed — using in-memory persistence")
        except Exception as e:
            logger.warning("Redis connection failed — using in-memory: %s", e)
    return _redis_client


class _InMemoryStore:
    """Thread-safe in-memory store as fallback when Redis is unavailable."""

    def __init__(self):
        self._data: dict[str, Any] = {}
        self._usage: dict[str, list[float]] = {}
        self._voice_profiles: dict[str, dict] = {}

    async def save_conversation(self, conversation_id: str, data: dict) -> None:
        self._data[f"conv:{conversation_id}"] = {**data, "updated_at": time.time()}

    async def get_conversation(self, conversation_id: str) -> dict | None:
        return self._data.get(f"conv:{conversation_id}")

    async def update_conversation_status(self, conversation_id: str, status: str) -> bool:
        key = f"conv:{conversation_id}"
        if key in self._data:
            self._data[key]["status"] = status
            self._data[key]["updated_at"] = time.time()
            if status in ("completed", "failed"):
                self._data[key]["ended_at"] = time.time()
            return True
        return False

    async def list_active_conversations(self) -> list[dict]:
        return [{**v, "conversation_id": k.split(":", 1)[1]} for k, v in self._data.items() if k.startswith("conv:") and v.get("status") in ("in_progress", "initializing")]

    async def record_usage(self, key: str) -> int:
        now = time.time()
        if key not in self._usage:
            self._usage[key] = []
        self._usage[key].append(now)
        cutoff = now - 3600
        self._usage[key] = [t for t in self._usage[key] if t > cutoff]
        return len(self._usage[key])

    async def get_usage_count(self, key: str, window_sec: int = 3600) -> int:
        cutoff = time.time() - window_sec
        return sum(1 for t in self._usage.get(key, []) if t > cutoff)

    async def save_sip_call(self, call_id: str, call_data: dict) -> None:
        self._data[f"sip:{call_id}"] = {**call_data, "updated_at": time.time()}

    async def get_sip_call(self, call_id: str) -> dict | None:
        return self._data.get(f"sip:{call_id}")

    async def end_sip_call(self, call_id: str) -> bool:
        key = f"sip:{call_id}"
        if key in self._data:
            self._data[key]["status"] = "completed"
            self._data[key]["ended_at"] = time.time()
            return True
        return False

    async def save_voice_profile(self, profile_id: str, profile: dict) -> None:
        self._voice_profiles[profile_id] = {**profile, "updated_at": time.time()}

    async def get_voice_profile(self, profile_id: str) -> dict | None:
        return self._voice_profiles.get(profile_id)

    async def list_voice_profiles(self) -> list[dict]:
        return list(self._voice_profiles.values())

    async def save_session_state(self, session_id: str, data: dict, ttl_sec: int = 3600) -> None:
        self._data[f"session:{session_id}"] = {**data, "_expires_at": time.time() + ttl_sec, "_updated_at": time.time()}

    async def get_session_state(self, session_id: str) -> dict | None:
        val = self._data.get(f"session:{session_id}")
        if val and isinstance(val, dict):
            if val.get("_expires_at", 0) > time.time():
                return {k: v for k, v in val.items() if not k.startswith("_")}
        return None

    async def semantic_cache_get(self, key: str) -> bytes | None:
        val = self._data.get(f"rag_cache:{key}")
        if val and isinstance(val, dict) and val.get("expires_at", 0) > time.time():
            return val["data"]
        return None

    async def semantic_cache_set(self, key: str, value: bytes, ttl_sec: int = 300) -> None:
        self._data[f"rag_cache:{key}"] = {"data": value, "expires_at": time.time() + ttl_sec, "created_at": time.time()}

    async def close(self) -> None:
        pass

    async def ping(self) -> bool:
        return True

    async def get_stats(self) -> dict:
        return {"backend": "memory", "objects_stored": len(self._data), "usage_keys": len(self._usage), "voice_profiles": len(self._voice_profiles)}


class _RedisStore:
    """Redis-backed persistent store."""

    def __init__(self, redis_client):
        self._r = redis_client
        self._prefix = "salesai:"

    def _k(self, key: str) -> str:
        return f"{self._prefix}{key}"

    async def save_conversation(self, conversation_id: str, data: dict) -> None:
        key = self._k(f"conv:{conversation_id}")
        mapping = {}
        for k, v in {**data, "updated_at": time.time()}.items():
            if isinstance(v, (dict, list)):
                mapping[k] = json.dumps(v)
            else:
                mapping[k] = str(v) if not isinstance(v, str) else v
        await self._r.hset(key, mapping=mapping)
        await self._r.expire(key, 86400)

    async def get_conversation(self, conversation_id: str) -> dict | None:
        data = await self._r.hgetall(self._k(f"conv:{conversation_id}"))
        return data if data else None

    async def update_conversation_status(self, conversation_id: str, status: str) -> bool:
        key = self._k(f"conv:{conversation_id}")
        if await self._r.exists(key):
            await self._r.hset(key, mapping={"status": status, "updated_at": time.time()})
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
                active.append(data)
        return active

    async def record_usage(self, key: str) -> int:
        redis_key = self._k(f"usage:{key}")
        now = time.time()
        await self._r.zadd(redis_key, {str(now): now})
        cutoff = now - 3600
        await self._r.zremrangebyscore(redis_key, 0, cutoff)
        await self._r.expire(redis_key, 7200)
        return await self._r.zcard(redis_key)

    async def get_usage_count(self, key: str, window_sec: int = 3600) -> int:
        cutoff = time.time() - window_sec
        return await self._r.zcard(self._k(f"usage:{key}"))

    async def save_sip_call(self, call_id: str, call_data: dict) -> None:
        key = self._k(f"sip:{call_id}")
        mapping = {}
        for k, v in {**call_data, "updated_at": time.time()}.items():
            if isinstance(v, (dict, list)):
                mapping[k] = json.dumps(v)
            elif isinstance(v, (int, float)):
                mapping[k] = str(v)
            else:
                mapping[k] = v
        await self._r.hset(key, mapping=mapping)
        await self._r.expire(key, 86400)

    async def get_sip_call(self, call_id: str) -> dict | None:
        data = await self._r.hgetall(self._k(f"sip:{call_id}"))
        return data if data else None

    async def end_sip_call(self, call_id: str) -> bool:
        key = self._k(f"sip:{call_id}")
        if await self._r.exists(key):
            await self._r.hset(key, mapping={"status": "completed", "ended_at": time.time()})
            return True
        return False

    async def semantic_cache_get(self, key: str) -> bytes | None:
        val = await self._r.get(self._k(f"rag_cache:{key}"))
        if val is not None:
            return val.encode("latin-1") if isinstance(val, str) else val
        return None

    async def semantic_cache_set(self, key: str, value: bytes, ttl_sec: int = 300) -> None:
        await self._r.setex(self._k(f"rag_cache:{key}"), ttl_sec, value)

    async def close(self) -> None:
        try:
            await self._r.close()
        except Exception:
            pass

    async def ping(self) -> bool:
        try:
            return await self._r.ping()
        except Exception:
            return False

    async def get_stats(self) -> dict:
        return {"backend": "redis", "redis_ping": await self.ping()}


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
