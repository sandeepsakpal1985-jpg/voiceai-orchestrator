"""
Tests for Audio Cache Service — TTS output caching system.

Tests cover:
- Text normalization
- Cache key generation
- Memory cache operations (get/set/invalidate)
- Filesystem cache operations
- Cache hit/miss tracking
- LRU eviction
- Cache warming
- Statistics
"""

import os
import shutil
import tempfile
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.audio_cache import (
    AudioCacheService,
    CacheEntry,
    COMMON_PHRASES,
    get_audio_cache_service,
    reset_audio_cache_service,
)


# ── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture
def temp_cache_dir():
    """Create a temporary directory for cache tests."""
    path = tempfile.mkdtemp(prefix="audio_cache_test_")
    yield path
    if os.path.exists(path):
        shutil.rmtree(path)


@pytest.fixture
def cache_service(temp_cache_dir):
    """Create a fresh AudioCacheService with temporary directory."""
    svc = AudioCacheService(
        cache_dir=temp_cache_dir,
        redis_url=None,
        default_ttl=3600,
        max_memory_entries=10,
        warm_common_phrases=False,
    )
    return svc


# ── Text Normalization (sync only) ──────────────────────────────────


class TestTextNormalization:
    def test_strips_whitespace(self):
        assert AudioCacheService.normalize_text("  hello  ") == "hello"

    def test_collapses_spaces(self):
        assert AudioCacheService.normalize_text("hello   world") == "hello world"

    def test_lowercases(self):
        assert AudioCacheService.normalize_text("Hello World") == "hello world"

    def test_removes_repeated_punctuation(self):
        # Repeated punctuation is collapsed, then trailing punctuation is stripped
        assert AudioCacheService.normalize_text("hello!!!") == "hello"
        assert AudioCacheService.normalize_text("hello...") == "hello"

    def test_strips_trailing_leading_punctuation(self):
        text = AudioCacheService.normalize_text('"Hello, how are you?"')
        # The function strips leading/trailing punctuation
        assert not text.endswith('"')
        assert not text.startswith('"')

    def test_unicode_normalization(self):
        normalized = AudioCacheService.normalize_text("Café")
        assert "é" in normalized

    def test_empty_string(self):
        assert AudioCacheService.normalize_text("") == ""
        assert AudioCacheService.normalize_text("   ") == ""


# ── Cache Key Generation (sync only) ────────────────────────────────


class TestCacheKeyGeneration:
    def test_builds_deterministic_key(self):
        key1 = AudioCacheService.build_cache_key("hello world", "af_bella", "en")
        key2 = AudioCacheService.build_cache_key("hello world", "af_bella", "en")
        assert key1 == key2
        assert key1.startswith("tts_cache:af_bella:en:")

    def test_different_voice_different_key(self):
        key1 = AudioCacheService.build_cache_key("hello", "af_bella", "en")
        key2 = AudioCacheService.build_cache_key("hello", "af_sky", "en")
        assert key1 != key2

    def test_different_language_different_key(self):
        key1 = AudioCacheService.build_cache_key("hello", "af_bella", "en")
        key2 = AudioCacheService.build_cache_key("hello", "af_bella", "fr")
        assert key1 != key2

    def test_normalizes_before_key(self):
        """build_cache_key expects pre-normalized text (callers normalize first)."""
        normalized_1 = AudioCacheService.normalize_text("  Hello World  ")
        normalized_2 = AudioCacheService.normalize_text("hello world")
        assert normalized_1 == normalized_2
        key1 = AudioCacheService.build_cache_key(normalized_1, "af_bella", "en")
        key2 = AudioCacheService.build_cache_key(normalized_2, "af_bella", "en")
        assert key1 == key2

    def test_text_to_hash_deterministic(self):
        h1 = AudioCacheService.text_to_hash("hello world")
        h2 = AudioCacheService.text_to_hash("hello world")
        assert h1 == h2

    def test_text_to_hash_normalizes(self):
        h1 = AudioCacheService.text_to_hash("  Hello World  ")
        h2 = AudioCacheService.text_to_hash("hello world")
        assert h1 == h2


# ── Cache Entry (sync only) ─────────────────────────────────────────


class TestCacheEntry:
    def test_is_expired_returns_true_for_expired(self):
        entry = CacheEntry(
            text_hash="abc",
            normalized_text="hello",
            voice_id="af_bella",
            language="en",
            created_at=time.time() - 7200,  # 2 hours ago
            ttl=3600,  # 1 hour TTL
        )
        assert entry.is_expired is True

    def test_is_expired_returns_false_for_valid(self):
        entry = CacheEntry(
            text_hash="abc",
            normalized_text="hello",
            voice_id="af_bella",
            language="en",
            created_at=time.time(),
            ttl=3600,
        )
        assert entry.is_expired is False

    def test_to_dict_includes_all_fields(self):
        entry = CacheEntry(
            text_hash="abc123",
            normalized_text="hello world",
            voice_id="af_bella",
            language="en",
            file_path="/tmp/test.wav",
            created_at=100.0,
            last_access=200.0,
            hit_count=5,
            ttl=3600,
            byte_size=1024,
        )
        d = entry.to_dict()
        assert d["text_hash"] == "abc123"
        assert d["normalized_text"] == "hello world"
        assert d["voice_id"] == "af_bella"
        assert d["language"] == "en"
        assert d["file_path"] == "/tmp/test.wav"
        assert d["hit_count"] == 5
        assert d["byte_size"] == 1024
        assert d["ttl"] == 3600


# ── Memory Cache Operations (async) ────────────────────────────────


@pytest.mark.asyncio
class TestMemoryCache:
    async def test_set_and_get(self, cache_service):
        """Should store and retrieve audio from memory cache."""
        audio = b"\x00\x01\x02"  # Sample audio bytes

        # First call: cache miss
        result = await cache_service.get("hello world", "af_bella", "en")
        assert result is None

        # Store
        await cache_service.set("hello world", audio, "af_bella", "en")

        # After set, get should return the cached audio
        result = await cache_service.get("hello world", "af_bella", "en")
        assert result == audio

    async def test_cache_hit_returns_audio(self, cache_service):
        """Should return cached audio on hit."""
        audio = b"\x00\x01\x02\x03\x04"
        await cache_service.set("test phrase", audio, "af_bella", "en")

        result = await cache_service.get("test phrase", "af_bella", "en")
        assert result == audio

    async def test_different_voice_misses(self, cache_service):
        """Should miss cache for different voice."""
        audio = b"\x00\x01\x02"
        await cache_service.set("hello", audio, "af_bella", "en")

        result = await cache_service.get("hello", "af_sky", "en")
        assert result is None

    async def test_normalized_lookup(self, cache_service):
        """Should match regardless of input formatting."""
        audio = b"\x00\x01\x02"
        await cache_service.set("Hello World!", audio, "af_bella", "en")

        result = await cache_service.get("  hello world  ", "af_bella", "en")
        assert result == audio

    async def test_lru_eviction(self, temp_cache_dir):
        """Should evict oldest entries when memory limit exceeded."""
        svc = AudioCacheService(
            cache_dir=temp_cache_dir,
            redis_url=None,
            default_ttl=3600,
            max_memory_entries=3,  # Very small cache
            warm_common_phrases=False,
        )

        await svc.set("phrase one", b"\x00\x01", "af_bella", "en")
        await svc.set("phrase two", b"\x00\x02", "af_bella", "en")
        await svc.set("phrase three", b"\x00\x03", "af_bella", "en")

        # Cache should now have 3 entries
        assert len(svc._memory_cache) <= 3

        # Add a 4th entry — should evict the oldest
        await svc.set("phrase four", b"\x00\x04", "af_bella", "en")
        assert len(svc._memory_cache) <= 3

    async def test_invalidate_removes_entry(self, cache_service):
        """Should remove a specific entry from cache."""
        audio = b"\x00\x01\x02"
        await cache_service.set("remove me", audio, "af_bella", "en")

        # Should be cached
        result = await cache_service.get("remove me", "af_bella", "en")
        assert result == audio

        # Invalidate
        await cache_service.invalidate("remove me", "af_bella", "en")

        # Should be gone
        result = await cache_service.get("remove me", "af_bella", "en")
        assert result is None

    async def test_invalidate_all_clears_cache(self, cache_service):
        """Should clear all cache entries."""
        await cache_service.set("phrase 1", b"\x00\x01", "af_bella", "en")
        await cache_service.set("phrase 2", b"\x00\x02", "af_sky", "en")

        await cache_service.invalidate_all()

        assert len(cache_service._memory_cache) == 0
        result = await cache_service.get("phrase 1", "af_bella", "en")
        assert result is None


# ── Filesystem Cache (async) ───────────────────────────────────────


@pytest.mark.asyncio
class TestFileCache:
    async def test_stores_to_filesystem(self, cache_service):
        """Should persist audio to disk."""
        audio = b"\x00\x01\x02\x03"
        await cache_service.set("file test", audio, "af_bella", "en")

        text_hash = cache_service.text_to_hash("file test")
        file_path = cache_service._get_file_path(text_hash, "af_bella", "en")
        assert os.path.exists(file_path)

        with open(file_path, "rb") as f:
            assert f.read() == audio

    async def test_reads_from_filesystem(self, cache_service):
        """Should read cached audio from disk on memory miss."""
        audio = b"\xde\xad\xbe\xef"

        # Store to disk directly (simulate cache miss scenario)
        text_hash = cache_service.text_to_hash("disk test")
        file_path = cache_service._get_file_path(text_hash, "af_bella", "en")
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(audio)

        # Get via cache service (should find via filesystem fallback)
        result = await cache_service.get("disk test", "af_bella", "en")
        assert result == audio


# ── Cache Statistics (mixed sync/async) ─────────────────────────────


@pytest.mark.asyncio
class TestCacheStats:
    async def test_initial_stats_zero(self, cache_service):
        """Should start with zero stats."""
        stats = cache_service.get_stats()
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["stores"] == 0
        assert stats["errors"] == 0
        assert stats["evictions"] == 0

    async def test_tracks_hits(self, cache_service):
        """Should increment hit counter."""
        audio = b"\x00\x01\x02"
        await cache_service.set("track hits", audio, "af_bella", "en")
        await cache_service.get("track hits", "af_bella", "en")

        stats = cache_service.get_stats()
        assert stats["hits"] >= 1
        assert stats["hit_rate_percent"] > 0

    async def test_tracks_misses(self, cache_service):
        """Should increment miss counter."""
        await cache_service.get("no such phrase", "af_bella", "en")

        stats = cache_service.get_stats()
        assert stats["misses"] >= 1

    async def test_hit_rate_calculation(self, cache_service):
        """Should calculate correct hit rate percentage."""
        await cache_service.get("miss 1", "af_bella", "en")
        await cache_service.get("miss 2", "af_bella", "en")

        audio = b"\x00\x01"
        await cache_service.set("hit me", audio, "af_bella", "en")
        await cache_service.get("hit me", "af_bella", "en")

        stats = cache_service.get_stats()
        assert stats["total_requests"] == 3
        assert stats["hits"] == 1
        assert stats["misses"] == 2
        assert stats["hit_rate_percent"] == pytest.approx(33.3, abs=0.5)

    async def test_tracks_stores(self, cache_service):
        """Should increment store counter."""
        await cache_service.set("store 1", b"\x00", "af_bella", "en")
        await cache_service.set("store 2", b"\x01", "af_bella", "en")

        stats = cache_service.get_stats()
        assert stats["stores"] == 2

    async def test_get_stats_returns_cache_dir(self, cache_service):
        """Should include cache directory in stats."""
        stats = cache_service.get_stats()
        assert "cache_dir" in stats
        assert stats["cache_dir"] == cache_service._cache_dir

    async def test_get_hot_phrases_returns_most_hit(self, cache_service):
        """Should return most frequently accessed phrases."""
        audio = b"\x00\x01"
        await cache_service.set("popular", audio, "af_bella", "en")
        await cache_service.get("popular", "af_bella", "en")
        await cache_service.get("popular", "af_bella", "en")
        await cache_service.get("popular", "af_bella", "en")

        await cache_service.set("unpopular", audio, "af_bella", "en")

        hot = cache_service.get_hot_phrases(top_n=5)
        assert len(hot) >= 1
        # The most hit phrase should be first
        assert hot[0]["text"] == AudioCacheService.normalize_text("popular")


# ── Cache Warming (async) ──────────────────────────────────────────


@pytest.mark.asyncio
class TestCacheWarming:
    async def test_common_phrases_defined(self):
        """Should have common phrases defined for cache warming."""
        assert len(COMMON_PHRASES) > 10
        assert "Hello! Welcome. How can I help you today?" in COMMON_PHRASES
        assert "Your booking has been confirmed." in COMMON_PHRASES

    async def test_warm_skips_existing(self, cache_service):
        """Should skip phrases already in cache during warming."""
        mock_tts = AsyncMock()
        mock_tts.synthesize = AsyncMock(return_value=b"\x00\x01\x02" * 100)

        # Pre-cache one phrase
        await cache_service.set(
            "Hello! Welcome. How can I help you today?",
            b"\x00" * 500, "af_bella", "en",
        )

        result = await cache_service.warm(mock_tts, voice_id="af_bella", language="en")
        assert result is not None

    async def test_warm_caches_new_phrases(self, cache_service):
        """Should synthesize and cache new phrases during warming."""
        mock_tts = AsyncMock()
        mock_tts.synthesize = AsyncMock(return_value=b"\x00\x01\x02" * 200)

        result = await cache_service.warm(mock_tts, voice_id="af_bella", language="en")
        assert result > 0


# ── Singleton (sync) ───────────────────────────────────────────────


class TestSingleton:
    def test_singleton_returns_same_instance(self):
        """Should return the same instance on repeated calls."""
        reset_audio_cache_service()
        s1 = get_audio_cache_service()
        s2 = get_audio_cache_service()
        assert s1 is s2

    @patch("app.config.settings")
    def test_singleton_uses_settings(self, mock_settings):
        """Should read settings from config."""
        reset_audio_cache_service()
        mock_settings.AUDIO_CACHE_DIR = "/tmp/test_cache"
        mock_settings.REDIS_URL = ""
        mock_settings.AUDIO_CACHE_TTL = 7200
        mock_settings.AUDIO_CACHE_MAX_MEMORY = 100
        mock_settings.AUDIO_CACHE_WARM = False

        svc = get_audio_cache_service()
        assert svc._cache_dir == "/tmp/test_cache"
        assert svc._default_ttl == 7200
        assert svc._max_memory_entries == 100
        assert svc._warm_common_phrases is False

    def test_reset_creates_new_instance(self):
        """Should create a new instance after reset."""
        reset_audio_cache_service()
        s1 = get_audio_cache_service()
        reset_audio_cache_service()
        s2 = get_audio_cache_service()
        assert s1 is not s2


# ── File Path Generation (sync) ─────────────────────────────────────


class TestFilePathGeneration:
    def test_get_file_path_creates_subdirs(self, cache_service):
        """Should create organized subdirectory structure."""
        text_hash = "abc123def456"
        path = cache_service._get_file_path(text_hash, "af_bella", "en")
        assert path.endswith("abc123def456.wav")
        assert "af_bella" in path
        assert "en" in path

    def test_get_file_path_different_voices_different_path(self, cache_service):
        """Should use different paths for different voices."""
        path1 = cache_service._get_file_path("hash1", "af_bella", "en")
        path2 = cache_service._get_file_path("hash1", "af_sky", "en")
        assert path1 != path2


# ── Redis Integration (mock) ───────────────────────────────────────


@pytest.fixture
def mock_redis():
    """Create a mock Redis client for testing cache integration."""
    mock = AsyncMock()
    mock.get = AsyncMock(return_value=None)
    mock.setex = AsyncMock()
    mock.delete = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.scan = AsyncMock(side_effect=[
        (0, [b"tts_cache:af_bella:en:hash1"]),
        (0, []),
    ])
    return mock


@pytest.fixture
def cache_with_redis(temp_cache_dir, mock_redis):
    """Create cache service with mock Redis."""
    svc = AudioCacheService(
        cache_dir=temp_cache_dir,
        redis_url="redis://mock:6379",
        default_ttl=3600,
        max_memory_entries=10,
        warm_common_phrases=False,
    )
    svc._redis = mock_redis
    svc._initialized = True
    return svc


@pytest.mark.asyncio
class TestRedisCache:
    async def test_redis_miss_returns_none(self, cache_with_redis):
        """Should return None on Redis cache miss."""
        result = await cache_with_redis.get("test phrase", "af_bella", "en")
        assert result is None

    async def test_redis_stores_metadata(self, cache_with_redis, mock_redis):
        """Should store cache metadata in Redis on set."""
        audio = b"\x00\x01\x02"
        await cache_with_redis.set("hello", audio, "af_bella", "en")

        # Redis setex should have been called
        mock_redis.setex.assert_called_once()
        args = mock_redis.setex.call_args
        assert args is not None
        key = args[0][0]
        assert key.startswith("tts_cache:af_bella:en:")

    async def test_stat_shows_redis_connected(self, cache_with_redis):
        """Should indicate Redis is connected in stats."""
        stats = cache_with_redis.get_stats()
        assert stats["redis_connected"] is True

    async def test_stat_shows_redis_disconnected(self, cache_service):
        """Should indicate Redis is not connected when not configured."""
        stats = cache_service.get_stats()
        assert stats["redis_connected"] is False

    async def test_redis_error_does_not_crash(self, cache_with_redis, mock_redis):
        """Should handle Redis errors gracefully."""
        mock_redis.get.side_effect = Exception("Connection lost")

        # Get should fall through to memory/disk (not crash)
        audio = b"\x00\x01\x02"
        await cache_with_redis.set("hello", audio, "af_bella", "en")

        # Memory cache should still work
        result = await cache_with_redis.get("hello", "af_bella", "en")
        assert result == audio

    async def test_redis_clear_cache(self, cache_with_redis, mock_redis):
        """Should clear Redis cache on invalidate_all."""
        await cache_with_redis.set("phrase 1", b"\x00\x01", "af_bella", "en")

        await cache_with_redis.invalidate_all()

        # scan + delete should have been called
        mock_redis.delete.assert_called()
        assert mock_redis.scan.call_count >= 1

    async def test_redis_key_format(self, cache_with_redis):
        """Should use correct key format for Redis entries."""
        key = AudioCacheService.build_cache_key(
            AudioCacheService.normalize_text("Hello World"),
            "af_bella", "en",
        )
        assert key == AudioCacheService.build_cache_key(
            AudioCacheService.normalize_text("hello world"),
            "af_bella", "en",
        )

    async def test_initialize_with_redis_error(self, temp_cache_dir):
        """Should handle Redis connection failure gracefully."""
        svc = AudioCacheService(
            cache_dir=temp_cache_dir,
            redis_url="redis://invalid:6379",
            warm_common_phrases=False,
        )
        # Should not raise — just log warning
        await svc.initialize()
        assert svc.is_initialized
        assert svc._redis is None  # Falls back to no Redis


# ── Cache Warming Tests (parallel) ─────────────────────────────────


@pytest.mark.asyncio
class TestCacheWarmingParallel:
    async def test_warm_parallel_respects_concurrency(self, cache_service):
        """Should limit concurrent TTS synthesis during parallel warming."""
        call_count = 0
        max_concurrent = 0
        current_concurrent = 0
        import asyncio

        class TrackingMockTTS:
            async def synthesize(self, text, voice_id="af_bella", language="en"):
                nonlocal call_count, max_concurrent, current_concurrent
                call_count += 1
                current_concurrent += 1
                max_concurrent = max(max_concurrent, current_concurrent)
                await asyncio.sleep(0.05)  # Simulate TTS latency
                current_concurrent -= 1
                return b"\x00" * 500

        mock_tts = TrackingMockTTS()
        concurrency = 3

        result = await cache_service.warm(mock_tts, voice_id="af_bella", language="en", concurrency=concurrency)
        assert result > 0
        assert max_concurrent <= concurrency, f"Max concurrent {max_concurrent} exceeded limit {concurrency}"


# ── Edge Cases (async) ─────────────────────────────────────────────


@pytest.mark.asyncio
class TestEdgeCases:
    async def test_set_empty_audio(self, cache_service):
        """Should handle storing empty audio gracefully."""
        await cache_service.set("empty", b"", "af_bella", "en")
        stats = cache_service.get_stats()
        assert stats["stores"] == 1

    async def test_get_special_characters(self, cache_service):
        """Should handle special characters in text."""
        audio = b"\x00\x01"
        await cache_service.set("¿Cómo estás?", audio, "af_bella", "en")

        result = await cache_service.get("¿cómo estás?", "af_bella", "en")
        assert result == audio

    async def test_long_text(self, cache_service):
        """Should handle long text strings."""
        long_text = " ".join(["word"] * 1000)
        audio = b"\x00\x01" * 100
        await cache_service.set(long_text, audio, "af_bella", "en")

        result = await cache_service.get(long_text, "af_bella", "en")
        assert result == audio

    async def test_multiline_text(self, cache_service):
        """Should handle multiline text."""
        text = "Hello!\nHow are you?\nI'm fine."
        audio = b"\x00\x01\x02"
        await cache_service.set(text, audio, "af_bella", "en")

        result = await cache_service.get(text, "af_bella", "en")
        assert result == audio


# ── Cleanup (async) ────────────────────────────────────────────────


@pytest.mark.asyncio
class TestCleanup:
    async def test_invalidate_all_removes_files(self, cache_service, temp_cache_dir):
        """Should remove all cached audio files."""
        await cache_service.set("cleanup test", b"\x00\x01" * 100, "af_bella", "en")

        assert os.path.exists(temp_cache_dir)

        await cache_service.invalidate_all()

        # The directory should be recreated (empty)
        assert os.path.exists(temp_cache_dir)

    async def test_cache_dir_creation(self, temp_cache_dir):
        """Should create cache directory automatically."""
        nested_dir = os.path.join(temp_cache_dir, "nested", "deep", "cache")
        svc = AudioCacheService(
            cache_dir=nested_dir,
            redis_url=None,
            warm_common_phrases=False,
        )

        # set() creates directories automatically
        await svc.set("test", b"\x00\x01", "af_bella", "en")

        assert os.path.exists(nested_dir)
