"""
Tests for Persistence Layer — Redis-backed storage with in-memory fallback.

Tests cover both _InMemoryStore and _RedisStore for:
- SIP call persistence (save, get, end, cleanup)
- Conversation persistence (save, get, update status, list active)
- Semantic cache (get, set, invalidate)
- Session state (save, get, delete, TTL expiry)
- Stats and ping
"""

import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.persistence import (
    _InMemoryStore,
    _RedisStore,
    SemanticCache,
    get_persistence,
    reset_persistence,
)


# ── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture
def memory_store():
    """Create a fresh in-memory store for each test."""
    store = _InMemoryStore()
    return store


@pytest.fixture
def mock_redis():
    """Create a mock Redis client for testing _RedisStore."""
    mock = AsyncMock()
    # Default: all keys operations return empty
    mock.hgetall = AsyncMock(return_value={})
    mock.hset = AsyncMock()
    mock.exists = AsyncMock(return_value=False)
    mock.keys = AsyncMock(return_value=[])
    mock.get = AsyncMock(return_value=None)
    mock.setex = AsyncMock()
    mock.set = AsyncMock()
    mock.delete = AsyncMock(return_value=1)
    mock.expire = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.zadd = AsyncMock()
    mock.zcard = AsyncMock(return_value=0)
    mock.zremrangebyscore = AsyncMock()
    return mock


@pytest.fixture
def redis_store(mock_redis):
    """Create a Redis store with mock Redis client."""
    store = _RedisStore(mock_redis)
    store._r = mock_redis
    return store


# ═══════════════════════════════════════════════════════════════════════
# SIP Call Persistence
# ═══════════════════════════════════════════════════════════════════════


class TestSipCallPersistence:
    """Tests for SIP call CRUD operations on both stores."""

    @pytest.mark.asyncio
    async def test_save_and_get_sip_call(self, memory_store):
        """Should store and retrieve a SIP call."""
        call_data = {
            "call_id": "call-123",
            "from_number": "+15551234567",
            "to_number": "+15559876543",
            "status": "active",
            "started_at": time.time(),
        }
        await memory_store.save_sip_call("call-123", call_data)
        result = await memory_store.get_sip_call("call-123")
        assert result is not None
        assert result["status"] == "active"
        assert result["from_number"] == "+15551234567"

    @pytest.mark.asyncio
    async def test_get_nonexistent_call(self, memory_store):
        """Should return None for a call that doesn't exist."""
        result = await memory_store.get_sip_call("no-such-call")
        assert result is None

    @pytest.mark.asyncio
    async def test_end_sip_call(self, memory_store):
        """Should mark a call as completed when ended."""
        call_data = {"status": "active", "started_at": time.time()}
        await memory_store.save_sip_call("call-123", call_data)
        result = await memory_store.end_sip_call("call-123")
        assert result is True

        updated = await memory_store.get_sip_call("call-123")
        assert updated["status"] == "completed"
        assert "ended_at" in updated

    @pytest.mark.asyncio
    async def test_end_nonexistent_call(self, memory_store):
        """Should return False when ending a non-existent call."""
        result = await memory_store.end_sip_call("no-such-call")
        assert result is False

    @pytest.mark.asyncio
    async def test_get_active_sip_calls(self, memory_store):
        """Should return only active/ringing calls."""
        await memory_store.save_sip_call("call-1", {"status": "active"})
        await memory_store.save_sip_call("call-2", {"status": "ringing"})
        await memory_store.save_sip_call("call-3", {"status": "completed"})
        await memory_store.save_sip_call("call-4", {"status": "failed"})

        active = await memory_store.get_active_sip_calls()
        assert len(active) == 2
        statuses = {c["status"] for c in active}
        assert statuses == {"active", "ringing"}

    @pytest.mark.asyncio
    async def test_cleanup_stale_calls(self, memory_store):
        """Should remove completed calls older than max_age."""
        now = time.time()
        await memory_store.save_sip_call("old-call", {
            "status": "completed", "ended_at": now - 7200,
        })
        await memory_store.save_sip_call("recent-call", {
            "status": "completed", "ended_at": now - 300,
        })
        await memory_store.save_sip_call("active-call", {
            "status": "active", "started_at": now,
        })

        cleaned = await memory_store.cleanup_stale_calls(max_age_sec=3600)
        assert cleaned == 1  # Only the old call should be removed

    @pytest.mark.asyncio
    async def test_sip_call_updated_at(self, memory_store):
        """Should set updated_at timestamp on save."""
        await memory_store.save_sip_call("call-1", {"status": "active"})
        result = await memory_store.get_sip_call("call-1")
        assert "updated_at" in result
        assert isinstance(result["updated_at"], float)

    # ── Redis Store SIP Tests ──

    @pytest.mark.asyncio
    async def test_redis_save_and_get_sip_call(self, redis_store, mock_redis):
        """Redis: Should store SIP call hash and retrieve it."""
        mock_redis.hgetall.return_value = {
            "status": "active",
            "from_number": "+15551234567",
            "started_at": "1000000.0",
            "updated_at": "1000001.0",
        }
        mock_redis.exists.return_value = True

        await redis_store.save_sip_call("call-123", {
            "status": "active", "from_number": "+15551234567",
        })
        mock_redis.hset.assert_called_once()

        result = await redis_store.get_sip_call("call-123")
        assert result is not None
        assert result["status"] == "active"

    @pytest.mark.asyncio
    async def test_redis_get_active_sip_calls(self, redis_store, mock_redis):
        """Redis: Should return only active calls."""
        mock_redis.keys.return_value = ["voiceai:sip:call-1", "voiceai:sip:call-2", "voiceai:sip:call-3"]
        mock_redis.hgetall.side_effect = [
            {"status": "active"},
            {"status": "completed"},
            {"status": "ringing"},
        ]

        active = await redis_store.get_active_sip_calls()
        assert len(active) == 2

    @pytest.mark.asyncio
    async def test_redis_end_sip_call(self, redis_store, mock_redis):
        """Redis: Should update status to completed."""
        mock_redis.exists.return_value = True
        result = await redis_store.end_sip_call("call-123")
        assert result is True
        mock_redis.hset.assert_called()

    @pytest.mark.asyncio
    async def test_redis_end_nonexistent_call(self, redis_store, mock_redis):
        """Redis: Should return False if call doesn't exist."""
        mock_redis.exists.return_value = False
        result = await redis_store.end_sip_call("no-such-call")
        assert result is False

    @pytest.mark.asyncio
    async def test_redis_cleanup_stale_calls(self, redis_store, mock_redis):
        """Redis: Should clean up calls older than max_age."""
        mock_redis.keys.return_value = ["voiceai:sip:old-call"]
        mock_redis.hget.return_value = str(time.time() - 7200)  # 2 hours ago

        cleaned = await redis_store.cleanup_stale_calls(max_age_sec=3600)
        assert cleaned == 1
        mock_redis.delete.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════
# Conversation Persistence
# ═══════════════════════════════════════════════════════════════════════


class TestConversationPersistence:
    """Tests for conversation persistence on both stores."""

    @pytest.mark.asyncio
    async def test_save_and_get_conversation(self, memory_store):
        """Should store and retrieve a conversation."""
        data = {
            "contact_phone": "+15551234567",
            "contact_name": "John Doe",
            "status": "in_progress",
            "started_at": time.time(),
        }
        await memory_store.save_conversation("conv-123", data)
        result = await memory_store.get_conversation("conv-123")
        assert result is not None
        assert result["contact_name"] == "John Doe"
        assert result["status"] == "in_progress"

    @pytest.mark.asyncio
    async def test_get_nonexistent_conversation(self, memory_store):
        """Should return None for non-existent conversation."""
        result = await memory_store.get_conversation("no-such-conv")
        assert result is None

    @pytest.mark.asyncio
    async def test_update_conversation_status(self, memory_store):
        """Should update status and set ended_at for completed."""
        await memory_store.save_conversation("conv-123", {"status": "in_progress"})

        result = await memory_store.update_conversation_status("conv-123", "completed")
        assert result is True

        updated = await memory_store.get_conversation("conv-123")
        assert updated["status"] == "completed"
        assert "ended_at" in updated

    @pytest.mark.asyncio
    async def test_update_nonexistent_conversation(self, memory_store):
        """Should return False for non-existent conversation."""
        result = await memory_store.update_conversation_status("no-such-conv", "completed")
        assert result is False

    @pytest.mark.asyncio
    async def test_list_active_conversations(self, memory_store):
        """Should return only in_progress/initializing conversations."""
        await memory_store.save_conversation("conv-1", {"status": "in_progress"})
        await memory_store.save_conversation("conv-2", {"status": "initializing"})
        await memory_store.save_conversation("conv-3", {"status": "completed"})
        await memory_store.save_conversation("conv-4", {"status": "failed"})

        active = await memory_store.list_active_conversations()
        assert len(active) == 2
        statuses = {c["status"] for c in active}
        assert statuses == {"in_progress", "initializing"}

    @pytest.mark.asyncio
    async def test_conversation_stores_metadata(self, memory_store):
        """Should preserve all metadata fields."""
        data = {
            "contact_phone": "+15551234567",
            "room": "sip-room",
            "source": "livekit",
            "status": "in_progress",
        }
        await memory_store.save_conversation("conv-123", data)
        result = await memory_store.get_conversation("conv-123")
        assert result["room"] == "sip-room"
        assert result["source"] == "livekit"

    @pytest.mark.asyncio
    async def test_conversation_updated_at(self, memory_store):
        """Should set updated_at on save and update."""
        await memory_store.save_conversation("conv-1", {"status": "in_progress"})
        result = await memory_store.get_conversation("conv-1")
        assert "updated_at" in result

    # ── Redis Store Conversation Tests ──

    @pytest.mark.asyncio
    async def test_redis_save_and_get_conversation(self, redis_store, mock_redis):
        """Redis: Should store and retrieve a conversation."""
        mock_redis.hgetall.return_value = {
            "contact_phone": "+15551234567",
            "contact_name": "John Doe",
            "status": "in_progress",
            "updated_at": "1000000.0",
        }

        await redis_store.save_conversation("conv-123", {
            "contact_phone": "+15551234567",
            "contact_name": "John Doe",
            "status": "in_progress",
        })
        mock_redis.hset.assert_called_once()

        result = await redis_store.get_conversation("conv-123")
        assert result is not None
        assert result["contact_name"] == "John Doe"
        assert result["status"] == "in_progress"

    @pytest.mark.asyncio
    async def test_redis_update_conversation_status(self, redis_store, mock_redis):
        """Redis: Should update status to completed."""
        mock_redis.exists.return_value = True
        result = await redis_store.update_conversation_status("conv-123", "completed")
        assert result is True
        # hset should have been called at least once (for status + updated_at + ended_at)
        assert mock_redis.hset.call_count >= 2

    @pytest.mark.asyncio
    async def test_redis_list_active_conversations(self, redis_store, mock_redis):
        """Redis: Should return only in_progress/initializing conversations."""
        mock_redis.keys.return_value = [
            "voiceai:conv:conv-1",
            "voiceai:conv:conv-2",
            "voiceai:conv:conv-3",
        ]
        mock_redis.hgetall.side_effect = [
            {"status": "in_progress", "contact_phone": "+1"},
            {"status": "completed", "contact_phone": "+2"},
            {"status": "initializing", "contact_phone": "+3"},
        ]

        active = await redis_store.list_active_conversations()
        assert len(active) == 2
        statuses = {c["status"] for c in active}
        assert statuses == {"in_progress", "initializing"}


# ═══════════════════════════════════════════════════════════════════════
# Semantic Cache
# ═══════════════════════════════════════════════════════════════════════


class TestSemanticCache:
    """Tests for Redis-backed semantic cache for RAG."""

    @pytest.mark.asyncio
    async def test_cache_set_and_get(self, memory_store):
        """Should store and retrieve cached data."""
        await memory_store.semantic_cache_set("query:abc123", b"result data", ttl_sec=300)
        result = await memory_store.semantic_cache_get("query:abc123")
        assert result == b"result data"

    @pytest.mark.asyncio
    async def test_cache_miss_returns_none(self, memory_store):
        """Should return None for uncached queries."""
        result = await memory_store.semantic_cache_get("no-such-key")
        assert result is None

    @pytest.mark.asyncio
    async def test_cache_expiry(self, memory_store):
        """Should return None for expired cache entries."""
        cache_key = "query:expired"
        # Set with a TTL of -1 (already expired)
        memory_store._sip_calls[cache_key] = {
            "data": b"stale data",
            "expires_at": time.time() - 100,
            "created_at": time.time() - 200,
        }
        result = await memory_store.semantic_cache_get(cache_key)
        assert result is None

    @pytest.mark.asyncio
    async def test_cache_invalidate(self, memory_store):
        """Should invalidate cache entries matching a pattern."""
        await memory_store.semantic_cache_set("query:abc", b"data1", ttl_sec=300)
        await memory_store.semantic_cache_set("query:xyz", b"data2", ttl_sec=300)
        await memory_store.semantic_cache_set("other:key", b"data3", ttl_sec=300)

        # Invalidate all query: entries
        count = await memory_store.semantic_cache_invalidate("query:")
        assert count == 2

        assert await memory_store.semantic_cache_get("query:abc") is None

    @pytest.mark.asyncio
    async def test_redis_cache_set_and_get(self, redis_store, mock_redis):
        """Redis: Should set and get cache data."""
        mock_redis.get.return_value = b"cached result"
        mock_redis.setex.return_value = True

        await redis_store.semantic_cache_set("query:hash123", b"cached result", ttl_sec=300)
        mock_redis.setex.assert_called_once()

        result = await redis_store.semantic_cache_get("query:hash123")
        assert result == b"cached result"
        mock_redis.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_redis_cache_invalidate(self, redis_store, mock_redis):
        """Redis: Should invalidate entries matching pattern."""
        mock_redis.keys.return_value = ["voiceai:rag_cache:query:abc", "voiceai:rag_cache:query:xyz"]
        mock_redis.delete.return_value = 2

        count = await redis_store.semantic_cache_invalidate("query:")
        assert count == 2
        mock_redis.keys.assert_called_once()
        mock_redis.delete.assert_called_once()

    # ── SemanticCache wrapper class ──

    @pytest.mark.asyncio
    async def test_semantic_cache_class(self):
        """SemanticCache wrapper should delegate to persistence store."""
        await reset_persistence()
        store = await get_persistence()
        cache = SemanticCache(store=store)

        await cache.set("test:key", b"test data", ttl_sec=60)
        result = await cache.get("test:key")
        assert result == b"test data"

        count = await cache.invalidate("test:")
        assert count >= 1

    @pytest.mark.asyncio
    async def test_semantic_cache_no_store(self):
        """SemanticCache should return None without a store."""
        cache = SemanticCache()
        # No store set — should not crash
        result = await cache.get("any-key")
        assert result is None


# ═══════════════════════════════════════════════════════════════════════
# Session State
# ═══════════════════════════════════════════════════════════════════════


class TestSessionState:
    """Tests for session state persistence."""

    @pytest.mark.asyncio
    async def test_save_and_get_session(self, memory_store):
        """Should store and retrieve session state."""
        data = {"user_id": "user-1", "context": "active_call", "turn_count": 5}
        await memory_store.save_session_state("session-123", data, ttl_sec=3600)
        result = await memory_store.get_session_state("session-123")
        assert result is not None
        assert result["user_id"] == "user-1"
        assert result["turn_count"] == 5

    @pytest.mark.asyncio
    async def test_session_ttl_expiry(self, memory_store):
        """Should return None for expired sessions."""
        # Manually set an expired session
        memory_store._sip_calls["session:expired"] = {
            "user_id": "user-1",
            "_expires_at": time.time() - 100,
            "_updated_at": time.time() - 200,
        }
        result = await memory_store.get_session_state("session:expired")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_session(self, memory_store):
        """Should delete a session state."""
        await memory_store.save_session_state("session-123", {"user_id": "user-1"})
        result = await memory_store.delete_session_state("session-123")
        assert result is True

        # Should not exist anymore
        got = await memory_store.get_session_state("session-123")
        assert got is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_session(self, memory_store):
        """Should return False for non-existent session."""
        result = await memory_store.delete_session_state("no-such-session")
        assert result is False

    @pytest.mark.asyncio
    async def test_session_strips_internal_fields(self, memory_store):
        """Should not expose internal fields (prefixed with _) in get."""
        await memory_store.save_session_state("session-1", {"user_id": "user-1"}, ttl_sec=3600)
        result = await memory_store.get_session_state("session-1")
        # Internal fields should not be in result
        for key in result:
            assert not key.startswith("_"), f"Internal field '{key}' exposed"

    @pytest.mark.asyncio
    async def test_redis_session_crud(self, redis_store, mock_redis):
        """Redis: Should perform full session lifecycle."""
        # Save
        mock_redis.hset.return_value = True
        await redis_store.save_session_state("session-123", {"user_id": "user-1"}, ttl_sec=3600)
        mock_redis.hset.assert_called_once()
        mock_redis.expire.assert_called_once()

        # Get
        mock_redis.hgetall.return_value = {"user_id": "user-1", "_updated_at": "1000000.0"}
        result = await redis_store.get_session_state("session-123")
        assert result == {"user_id": "user-1"}

        # Delete
        mock_redis.delete.return_value = 1
        deleted = await redis_store.delete_session_state("session-123")
        assert deleted is True


# ═══════════════════════════════════════════════════════════════════════
# Ping / Stats
# ═══════════════════════════════════════════════════════════════════════


class TestPingAndStats:
    """Tests for health check and stats."""

    @pytest.mark.asyncio
    async def test_memory_ping(self, memory_store):
        """In-memory store should always ping successfully."""
        assert await memory_store.ping() is True

    @pytest.mark.asyncio
    async def test_redis_ping(self, redis_store, mock_redis):
        """Redis store ping should delegate to Redis."""
        mock_redis.ping.return_value = True
        assert await redis_store.ping() is True
        mock_redis.ping.assert_called_once()

    @pytest.mark.asyncio
    async def test_memory_stats(self, memory_store):
        """Stats should show memory backend."""
        await memory_store.save_sip_call("call-1", {"status": "active"})
        await memory_store.save_conversation("conv-1", {"status": "in_progress"})
        await memory_store.save_session_state("session-1", {"user_id": "user-1"})
        await memory_store.semantic_cache_set("query:key", b"data")

        stats = await memory_store.get_stats()
        assert stats["backend"] == "memory"
        assert stats["conversations"] >= 1
        assert stats["sessions"] >= 1
        assert stats["semantic_cache_entries"] >= 1

    @pytest.mark.asyncio
    async def test_redis_stats(self, redis_store, mock_redis):
        """Stats should show redis backend."""
        mock_redis.keys.return_value = ["voiceai:sip:call-1"]
        mock_redis.ping.return_value = True

        stats = await redis_store.get_stats()
        assert stats["backend"] == "redis"
        assert stats["redis_ping"] is True


# ═══════════════════════════════════════════════════════════════════════
# Persistence Store Selection
# ═══════════════════════════════════════════════════════════════════════


class TestPersistenceSelection:
    """Tests for persistence store selection."""

    @pytest.mark.asyncio
    async def test_get_persistence_returns_memory_by_default(self):
        """Should return in-memory store when no Redis configured."""
        await reset_persistence()
        with patch.dict("os.environ", {"REDIS_URL": ""}, clear=True):
            store = await get_persistence()
            assert isinstance(store, _InMemoryStore)

    @pytest.mark.asyncio
    async def test_get_persistence_reuses_instance(self):
        """Should return the same instance on repeated calls."""
        await reset_persistence()
        with patch.dict("os.environ", {"REDIS_URL": ""}, clear=True):
            s1 = await get_persistence()
            s2 = await get_persistence()
            assert s1 is s2

    @pytest.mark.asyncio
    async def test_reset_creates_new_instance(self):
        """Should create new instance after reset."""
        with patch.dict("os.environ", {"REDIS_URL": ""}, clear=True):
            s1 = await get_persistence()
            await reset_persistence()
            s2 = await get_persistence()
            assert s1 is not s2
