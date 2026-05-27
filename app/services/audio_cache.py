"""
Audio Cache Service — Caches TTS audio output for instant replay of repeated phrases.

Cache flow:
    Text → normalize → hash → check cache (memory → Redis → filesystem) →
        hit: return cached audio bytes
        miss: synthesize TTS → store in cache → return

Storage hierarchy (fastest → slowest):
    Level 1: In-memory LRU dict (hot phrases, session-scoped)
    Level 2: Redis (metadata + optional audio for small phrases)
    Level 3: Local filesystem (persistent WAV files)

Cache key format:
    tts_cache:{voice_id}:{language}:{text_hash}

This is critical for latency reduction:
  - Greetings, confirmations, "please wait", FAQs → instant playback
  - Repeated phrases → zero TTS computation
  - CPU/GPU reduction for local inference
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("voiceai.audio_cache")


@dataclass
class CacheEntry:
    """Metadata for a cached audio entry."""
    text_hash: str
    normalized_text: str
    voice_id: str
    language: str
    file_path: str | None = None
    audio_bytes: bytes | None = None
    created_at: float = 0.0
    last_access: float = 0.0
    hit_count: int = 0
    ttl: int = 3600  # seconds
    byte_size: int = 0

    @property
    def is_expired(self) -> bool:
        return time.time() > self.created_at + self.ttl

    def to_dict(self) -> dict:
        return {
            "text_hash": self.text_hash,
            "normalized_text": self.normalized_text[:100],
            "voice_id": self.voice_id,
            "language": self.language,
            "file_path": self.file_path,
            "created_at": self.created_at,
            "last_access": self.last_access,
            "hit_count": self.hit_count,
            "ttl": self.ttl,
            "byte_size": self.byte_size,
        }


# ── Common Phrases for Cache Warming ────────────────────────────────

COMMON_PHRASES: list[str] = [
    # Greetings
    "Hello! Welcome. How can I help you today?",
    "Hi there! Thanks for reaching out.",
    "Good morning! How can I assist you today?",
    "Good afternoon! How may I help you?",
    "Good evening! Thanks for calling.",

    # Confirmations
    "Yes, I understand.",
    "I see. Let me look into that for you.",
    "Of course. One moment please.",
    "Absolutely. Let me check that for you.",
    "Sure thing! Let me find that information.",

    # Onboarding / Transitions
    "Please hold while I look that up.",
    "Thanks for your patience.",
    "I appreciate your time.",
    "Let me transfer you to the right department.",
    "One moment while I process that.",

    # "Please wait" variants
    "Please hold for just a moment.",
    "Just a moment please.",
    "Bear with me for a second.",
    "This will just take a moment.",
    "I'll be right with you.",

    # Booking / Reservation confirmations
    "Your booking has been confirmed.",
    "Your reservation is all set.",
    "I've confirmed your appointment.",
    "Everything has been scheduled successfully.",
    "You're all set! Is there anything else I can help with?",

    # Common support responses
    "I'm sorry to hear that.",
    "I apologize for the inconvenience.",
    "I understand how frustrating that must be.",
    "Let me make sure I understand your concern.",
    "Thank you for bringing this to our attention.",
    "I'm happy to help you with that.",
    "Let me explain how that works.",
    "That's a great question!",

    # Closing
    "Thank you for your time! Have a great day.",
    "It was a pleasure speaking with you. Goodbye!",
    "Is there anything else I can help you with?",
    "Thanks for calling! Have a wonderful day.",
    "If you need anything else, don't hesitate to reach out.",
]


class AudioCacheService:
    """Multi-level audio cache for TTS output.

    Reduces latency, CPU/GPU usage, and API costs by caching
    synthesized speech for reuse across conversations.

    Usage:
        cache = AudioCacheService(cache_dir="audio/cache", redis_url="redis://...")
        await cache.initialize()

        # On TTS request:
        audio = await cache.get("Hello, how can I help?", voice_id="af_bella")
        if audio is None:
            audio = await tts.synthesize(...)
            await cache.set("Hello, how can I help?", audio, voice_id="af_bella")
    """

    def __init__(
        self,
        cache_dir: str = "audio/cache",
        redis_url: str | None = None,
        default_ttl: int = 3600,
        max_memory_entries: int = 500,
        warm_common_phrases: bool = True,
    ):
        self._cache_dir = cache_dir
        self._redis_url = redis_url
        self._default_ttl = default_ttl
        self._max_memory_entries = max_memory_entries
        self._warm_common_phrases = warm_common_phrases

        # Level 1: In-memory LRU cache
        self._memory_cache: OrderedDict[str, CacheEntry] = OrderedDict()

        # Level 2: Redis client (lazy-initialized)
        self._redis: Any = None

        # Stats
        self._stats = {
            "hits": 0,
            "misses": 0,
            "memory_hits": 0,
            "redis_hits": 0,
            "disk_hits": 0,
            "stores": 0,
            "errors": 0,
            "evictions": 0,
            "warmed_entries": 0,
        }

        self._initialized = False

    @property
    def is_initialized(self) -> bool:
        """Whether the cache service has been initialized."""
        return self._initialized

    async def initialize(self) -> None:
        """Initialize the cache service including directories and Redis connection."""
        if self._initialized:
            return

        # Ensure cache directory exists
        os.makedirs(self._cache_dir, exist_ok=True)
        logger.info("Audio cache directory: %s", self._cache_dir)

        # Connect to Redis if configured
        if self._redis_url:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.from_url(
                    self._redis_url,
                    decode_responses=True,
                    socket_connect_timeout=3,
                )
                await self._redis.ping()
                logger.info("Audio cache connected to Redis: %s", self._redis_url)
            except Exception as e:
                logger.warning("Failed to connect to Redis for audio cache: %s", e)
                self._redis = None

        self._initialized = True

        # Warm cache with common phrases
        if self._warm_common_phrases:
            logger.info("Audio cache warming configured (%d common phrases)", len(COMMON_PHRASES))
            # (warm is done by the TTS provider pipeline — just log readiness here)

        logger.info("Audio cache initialized (max_memory=%d, default_ttl=%ds)", self._max_memory_entries, self._default_ttl)

    # ── Text Normalization ──────────────────────────────────────────

    @staticmethod
    def normalize_text(text: str) -> str:
        """Normalize text for consistent hashing.

        Steps:
        1. Strip leading/trailing whitespace
        2. Collapse multiple spaces
        3. Lowercase
        4. Normalize unicode (NFKC)
        5. Remove extraneous punctuation (keep sentence-essential)
        6. Strip leading/trailing punctuation
        """
        text = text.strip()
        text = re.sub(r'\s+', ' ', text)
        text = text.lower()
        import unicodedata
        text = unicodedata.normalize('NFKC', text)
        # Remove repeated punctuation like "..." or "!!!"
        text = re.sub(r'([.!?]){2,}', r'\1', text)
        # Remove trailing/leading punctuation not part of sentence structure
        text = text.strip('.,;:!?\'"()[]{} ')
        return text

    @staticmethod
    def build_cache_key(normalized_text: str, voice_id: str, language: str) -> str:
        """Build a unique cache key from normalized text + voice + language."""
        text_hash = hashlib.sha256(normalized_text.encode('utf-8')).hexdigest()
        return f"tts_cache:{voice_id}:{language}:{text_hash}"

    @staticmethod
    def text_to_hash(text: str) -> str:
        """Direct text → hash (for standards-based keys)."""
        normalized = AudioCacheService.normalize_text(text)
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

    # ── Redis Key Management ────────────────────────────────────────

    async def _redis_get(self, key: str) -> dict | None:
        """Get cached entry metadata from Redis."""
        if not self._redis:
            return None
        try:
            data = await self._redis.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            logger.debug("Redis cache read error: %s", e)
            self._stats["errors"] += 1
            return None

    async def _redis_set(self, key: str, entry: CacheEntry, ttl: int | None = None) -> None:
        """Store cached entry metadata in Redis."""
        if not self._redis:
            return
        try:
            data = json.dumps(entry.to_dict())
            await self._redis.setex(key, ttl or self._default_ttl, data)
        except Exception as e:
            logger.debug("Redis cache write error: %s", e)
            self._stats["errors"] += 1

    async def _redis_del(self, key: str) -> None:
        """Delete a cached entry from Redis."""
        if not self._redis:
            return
        try:
            await self._redis.delete(key)
        except Exception:
            pass

    # ── File System Cache ───────────────────────────────────────────

    def _get_file_path(self, text_hash: str, voice_id: str, language: str) -> str:
        """Get the filesystem path for a cached audio file."""
        # Create subdirectories by voice/language for organization
        return os.path.join(self._cache_dir, voice_id, language, f"{text_hash}.wav")

    async def _file_get(self, file_path: str) -> bytes | None:
        """Read audio bytes from the filesystem cache."""
        try:
            loop = None
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                pass

            def _read():
                with open(file_path, 'rb') as f:
                    return f.read()

            if loop:
                return await loop.run_in_executor(None, _read)
            else:
                return _read()
        except FileNotFoundError:
            return None
        except Exception as e:
            logger.debug("File cache read error: %s", e)
            self._stats["errors"] += 1
            return None

    async def _file_set(self, file_path: str, audio_bytes: bytes) -> None:
        """Write audio bytes to the filesystem cache."""
        try:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)

            loop = None
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                pass

            def _write():
                with open(file_path, 'wb') as f:
                    f.write(audio_bytes)

            if loop:
                await loop.run_in_executor(None, _write)
            else:
                _write()
        except Exception as e:
            logger.debug("File cache write error: %s", e)
            self._stats["errors"] += 1

    async def _file_del(self, file_path: str) -> None:
        """Delete a cached audio file."""
        try:
            if os.path.exists(file_path):
                os.unlink(file_path)
        except Exception:
            pass

    # ── Cache Operations ────────────────────────────────────────────

    async def get(
        self,
        text: str,
        voice_id: str = "default",
        language: str = "en",
    ) -> bytes | None:
        """Get cached audio for the given text.

        Checks cache levels in order: memory → Redis → filesystem.
        Returns None on cache miss.

        Args:
            text: The text to look up
            voice_id: Voice ID used for synthesis
            language: Language code

        Returns:
            Audio bytes if cached, None if miss
        """
        normalized = self.normalize_text(text)
        text_hash = self.text_to_hash(text)
        cache_key = self.build_cache_key(normalized, voice_id, language)
        file_path = self._get_file_path(text_hash, voice_id, language)

        # ── Level 1: In-memory cache ──
        if cache_key in self._memory_cache:
            entry = self._memory_cache[cache_key]
            entry.last_access = time.time()
            entry.hit_count += 1
            self._memory_cache.move_to_end(cache_key)
            self._stats["hits"] += 1
            self._stats["memory_hits"] += 1

            # If we have the audio bytes in memory, return directly
            if entry.audio_bytes is not None:
                logger.debug("Audio cache HIT (memory): '%s...' → %s", normalized[:40], text_hash[:8])
                return entry.audio_bytes

            # Otherwise, load from filesystem
            audio = await self._file_get(entry.file_path or file_path)
            if audio:
                entry.audio_bytes = audio
                logger.debug("Audio cache HIT (memory+disk): '%s...' → %s", normalized[:40], text_hash[:8])
                return audio

        # ── Level 2: Redis cache ──
        redis_data = await self._redis_get(cache_key)
        if redis_data:
            redis_path = redis_data.get("file_path") or file_path
            audio = await self._file_get(redis_path)
            if audio:
                # Promote to memory cache
                entry = CacheEntry(
                    text_hash=text_hash,
                    normalized_text=normalized,
                    voice_id=voice_id,
                    language=language,
                    file_path=redis_path,
                    audio_bytes=audio,
                    created_at=redis_data.get("created_at", time.time()),
                    last_access=time.time(),
                    hit_count=redis_data.get("hit_count", 0) + 1,
                    ttl=redis_data.get("ttl", self._default_ttl),
                    byte_size=len(audio),
                )
                self._memory_cache[cache_key] = entry
                self._memory_cache.move_to_end(cache_key)
                self._trim_memory_cache()

                self._stats["hits"] += 1
                self._stats["redis_hits"] += 1
                logger.debug("Audio cache HIT (redis): '%s...' → %s", normalized[:40], text_hash[:8])
                return audio

        # ── Level 3: Direct filesystem lookup (if we guessed the path) ──
        audio = await self._file_get(file_path)
        if audio:
            # Promote to memory cache
            entry = CacheEntry(
                text_hash=text_hash,
                normalized_text=normalized,
                voice_id=voice_id,
                language=language,
                file_path=file_path,
                audio_bytes=audio,
                created_at=time.time(),
                last_access=time.time(),
                hit_count=1,
                ttl=self._default_ttl,
                byte_size=len(audio),
            )
            self._memory_cache[cache_key] = entry
            self._memory_cache.move_to_end(cache_key)
            self._trim_memory_cache()

            self._stats["hits"] += 1
            self._stats["disk_hits"] += 1
            logger.debug("Audio cache HIT (disk): '%s...' → %s", normalized[:40], text_hash[:8])
            return audio

        # ── Cache Miss ──
        self._stats["misses"] += 1
        logger.debug("Audio cache MISS: '%s...' → %s", normalized[:40], text_hash[:8])
        return None

    async def set(
        self,
        text: str,
        audio_bytes: bytes,
        voice_id: str = "default",
        language: str = "en",
        ttl: int | None = None,
    ) -> None:
        """Store audio in the cache after TTS synthesis.

        Stores in all available levels: memory, filesystem, and optionally Redis.

        Args:
            text: The original text that was synthesized
            audio_bytes: The synthesized audio
            voice_id: Voice ID used
            language: Language code
            ttl: Optional TTL override (defaults to service default)
        """
        normalized = self.normalize_text(text)
        text_hash = self.text_to_hash(text)
        cache_key = self.build_cache_key(normalized, voice_id, language)
        file_path = self._get_file_path(text_hash, voice_id, language)
        entry_ttl = ttl or self._default_ttl

        # Write to filesystem
        await self._file_set(file_path, audio_bytes)

        # Store in memory
        entry = CacheEntry(
            text_hash=text_hash,
            normalized_text=normalized,
            voice_id=voice_id,
            language=language,
            file_path=file_path,
            audio_bytes=audio_bytes,
            created_at=time.time(),
            last_access=time.time(),
            hit_count=0,
            ttl=entry_ttl,
            byte_size=len(audio_bytes),
        )
        self._memory_cache[cache_key] = entry
        self._memory_cache.move_to_end(cache_key)
        self._trim_memory_cache()

        # Store metadata in Redis
        await self._redis_set(cache_key, entry, ttl=entry_ttl)

        self._stats["stores"] += 1
        logger.debug(
            "Audio cache STORE: '%s...' → %s (%d bytes, ttl=%ds)",
            normalized[:40], text_hash[:8], len(audio_bytes), entry_ttl,
        )

    async def invalidate(self, text: str, voice_id: str = "default", language: str = "en") -> None:
        """Remove a specific entry from all cache levels."""
        normalized = self.normalize_text(text)
        text_hash = self.text_to_hash(text)
        cache_key = self.build_cache_key(normalized, voice_id, language)
        file_path = self._get_file_path(text_hash, voice_id, language)

        # Remove from memory
        self._memory_cache.pop(cache_key, None)

        # Remove from filesystem
        await self._file_del(file_path)

        # Remove from Redis
        await self._redis_del(cache_key)

        logger.debug("Audio cache INVALIDATE: %s (%s)", text_hash[:8], normalized[:40])

    async def invalidate_all(self) -> None:
        """Clear all cached audio entries."""
        # Clear memory
        self._memory_cache.clear()

        # Clear filesystem
        import shutil
        if os.path.exists(self._cache_dir):
            loop = None
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
            if loop:
                await loop.run_in_executor(None, shutil.rmtree, self._cache_dir)
            else:
                shutil.rmtree(self._cache_dir)
            os.makedirs(self._cache_dir, exist_ok=True)

        # Clear Redis
        if self._redis:
            try:
                cursor = 0
                while True:
                    cursor, keys = await self._redis.scan(cursor, match="tts_cache:*")
                    if keys:
                        await self._redis.delete(*keys)
                    if cursor == 0:
                        break
            except Exception:
                pass

        self._stats = {k: 0 for k in self._stats}
        logger.info("Audio cache cleared from all levels")

    async def close(self) -> None:
        """Close cache connections and release resources."""
        if self._redis:
            try:
                await self._redis.close()
            except Exception:
                pass
            self._redis = None
        self._memory_cache.clear()
        self._initialized = False
        logger.info("Audio cache closed")

    # ── Memory Management ───────────────────────────────────────────

    def _trim_memory_cache(self) -> None:
        """Evict oldest entries when memory cache exceeds max size."""
        while len(self._memory_cache) > self._max_memory_entries:
            key, entry = self._memory_cache.popitem(last=False)
            entry.audio_bytes = None  # Free memory for evicted entries
            self._stats["evictions"] += 1

    # ── Cache Warming ───────────────────────────────────────────────

    async def warm(
        self,
        tts_provider,
        language: str = "en",
        voice_id: str = "default",
        concurrency: int = 4,
    ) -> int:
        """Warm the cache by pre-synthesizing common phrases in parallel.

        Uses asyncio.gather with a semaphore to limit concurrent TTS synthesis.
        Skips phrases already in cache for instant reuse.

        Args:
            tts_provider: A TTSProvider instance to use for warming
            language: Language code for synthesis
            voice_id: Voice ID for synthesis
            concurrency: Maximum concurrent TTS synthesis calls (default: 4)

        Returns:
            Number of phrases successfully cached
        """
        total = len(COMMON_PHRASES)
        logger.info("Warming audio cache with %d common phrases (voice=%s, lang=%s, concurrency=%d)...",
                     total, voice_id, language, concurrency)

        # First pass: check which phrases are already cached
        cached_phrases: list[str] = []
        uncached_phrases: list[str] = []

        for phrase in COMMON_PHRASES:
            existing = await self.get(phrase, voice_id=voice_id, language=language)
            if existing is not None:
                cached_phrases.append(phrase)
            else:
                uncached_phrases.append(phrase)

        already_warmed = len(cached_phrases)
        logger.info("Cache warm: %d/%d already cached, %d to synthesize",
                     already_warmed, total, len(uncached_phrases))

        if not uncached_phrases:
            self._stats["warmed_entries"] = already_warmed
            return already_warmed

        # Second pass: synthesize uncached phrases in parallel with concurrency limit
        semaphore = asyncio.Semaphore(concurrency)

        async def _synthesize_one(phrase: str) -> bool:
            """Synthesize a single phrase and store in cache."""
            async with semaphore:
                try:
                    audio = await tts_provider.synthesize(
                        text=phrase,
                        voice_id=voice_id,
                        language=language,
                    )
                    if audio and len(audio) > 100:
                        await self.set(phrase, audio, voice_id=voice_id, language=language)
                        return True
                except Exception as e:
                    logger.debug("Cache warm failed for '%s...': %s", phrase[:30], e)
                return False

        # Process in batches for progress reporting
        batch_size = max(concurrency * 2, 10)
        total_warmed = already_warmed

        for batch_start in range(0, len(uncached_phrases), batch_size):
            batch = uncached_phrases[batch_start:batch_start + batch_size]
            results = await asyncio.gather(*[
                _synthesize_one(phrase) for phrase in batch
            ])
            batch_warmed = sum(1 for r in results if r)
            total_warmed += batch_warmed

            progress = min(batch_start + batch_size, len(uncached_phrases))
            logger.info(
                "Cache warm progress: +%d/%d synthesized (cumulative: %d/%d total)",
                batch_warmed, len(batch), total_warmed, total,
            )

        self._stats["warmed_entries"] = total_warmed
        logger.info("Audio cache warm complete: %d/%d phrases cached", total_warmed, total)
        return total_warmed

    # ── Stats & Monitoring ──────────────────────────────────────────

    def get_stats(self) -> dict[str, Any]:
        """Get cache performance statistics."""
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = (self._stats["hits"] / total * 100) if total > 0 else 0.0

        return {
            "hits": self._stats["hits"],
            "misses": self._stats["misses"],
            "total_requests": total,
            "hit_rate_percent": round(hit_rate, 1),
            "memory_hits": self._stats["memory_hits"],
            "redis_hits": self._stats["redis_hits"],
            "disk_hits": self._stats["disk_hits"],
            "stores": self._stats["stores"],
            "errors": self._stats["errors"],
            "evictions": self._stats["evictions"],
            "warmed_entries": self._stats["warmed_entries"],
            "memory_cache_size": len(self._memory_cache),
            "memory_cache_max": self._max_memory_entries,
            "redis_connected": self._redis is not None,
            "cache_dir": self._cache_dir,
        }

    def get_hot_phrases(self, top_n: int = 20) -> list[dict]:
        """Get the most frequently accessed cached phrases."""
        entries = []
        for key, entry in self._memory_cache.items():
            if entry.hit_count > 0:
                entries.append({
                    "text": entry.normalized_text[:80],
                    "voice_id": entry.voice_id,
                    "language": entry.language,
                    "hit_count": entry.hit_count,
                    "last_access": entry.last_access,
                    "byte_size": entry.byte_size,
                })
        entries.sort(key=lambda e: e["hit_count"], reverse=True)
        return entries[:top_n]


# ── Singleton ───────────────────────────────────────────────────────

_cache_service: AudioCacheService | None = None


def get_audio_cache_service() -> AudioCacheService:
    """Get or create the global AudioCacheService singleton."""
    global _cache_service
    if _cache_service is None:
        from app.config import settings

        _cache_service = AudioCacheService(
            cache_dir=settings.AUDIO_CACHE_DIR,
            redis_url=settings.REDIS_URL or None,
            default_ttl=settings.AUDIO_CACHE_TTL,
            max_memory_entries=settings.AUDIO_CACHE_MAX_MEMORY,
            warm_common_phrases=settings.AUDIO_CACHE_WARM,
        )
    return _cache_service


def reset_audio_cache_service() -> None:
    """Reset the singleton (for testing)."""
    global _cache_service
    _cache_service = None

