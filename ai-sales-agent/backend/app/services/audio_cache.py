"""
Audio Cache Service — Multi-level TTS audio cache for instant replay of repeated phrases.
Uses memory → filesystem hierarchy. Optionally Redis.
"""

import asyncio
import hashlib
import logging
import os
import re
import shutil
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any

from app.config import settings

logger = logging.getLogger("ai_sales_agent.audio_cache")


@dataclass
class CacheEntry:
    text_hash: str
    normalized_text: str
    voice_id: str
    language: str
    file_path: str | None = None
    audio_bytes: bytes | None = None
    created_at: float = 0.0
    last_access: float = 0.0
    hit_count: int = 0
    ttl: int = 3600
    byte_size: int = 0


COMMON_PHRASES: list[str] = [
    "Hello! Welcome. How can I help you today?",
    "Hi there! Thanks for reaching out.",
    "Good morning! How can I assist you today?",
    "Thank you for your time! Have a great day.",
    "Is there anything else I can help you with?",
    "Let me look into that for you.",
    "One moment please.",
    "I'm sorry to hear that.",
    "I understand. Let me check that for you.",
    "Your booking has been confirmed.",
    "You're all set! Is there anything else I can help with?",
]


class AudioCacheService:
    """Multi-level audio cache for TTS output: Memory → Filesystem → (optional Redis)."""

    def __init__(self, cache_dir: str = "data/audio/cache", default_ttl: int = 3600, max_memory_entries: int = 500):
        self._cache_dir = cache_dir
        self._default_ttl = default_ttl
        self._max_memory_entries = max_memory_entries
        self._memory_cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._stats = {"hits": 0, "misses": 0, "stores": 0, "errors": 0, "evictions": 0, "warmed_entries": 0}
        self._initialized = False

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    async def initialize(self) -> None:
        os.makedirs(self._cache_dir, exist_ok=True)
        self._initialized = True
        logger.info("Audio cache initialized (dir=%s)", self._cache_dir)

    @staticmethod
    def normalize_text(text: str) -> str:
        text = text.strip()
        text = re.sub(r'\s+', ' ', text)
        text = text.lower()
        import unicodedata
        text = unicodedata.normalize('NFKC', text)
        return text.strip('.,;:!?\'"()[]{} ')

    @staticmethod
    def text_to_hash(text: str) -> str:
        normalized = AudioCacheService.normalize_text(text)
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

    def _get_file_path(self, text_hash: str, voice_id: str, language: str) -> str:
        return os.path.join(self._cache_dir, voice_id, language, f"{text_hash}.wav")

    async def get(self, text: str, voice_id: str = "default", language: str = "en") -> bytes | None:
        text_hash = self.text_to_hash(text)
        file_path = self._get_file_path(text_hash, voice_id, language)

        if os.path.exists(file_path):
            self._stats["hits"] += 1
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, lambda: open(file_path, 'rb').read())

        self._stats["misses"] += 1
        return None

    async def set(self, text: str, audio_bytes: bytes, voice_id: str = "default", language: str = "en", ttl: int | None = None) -> None:
        text_hash = self.text_to_hash(text)
        file_path = self._get_file_path(text_hash, voice_id, language)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: open(file_path, 'wb').write(audio_bytes))
        self._stats["stores"] += 1

    async def invalidate_all(self) -> None:
        if os.path.exists(self._cache_dir):
            shutil.rmtree(self._cache_dir)
            os.makedirs(self._cache_dir, exist_ok=True)
        self._stats = {k: 0 for k in self._stats}
        logger.info("Audio cache cleared")

    async def close(self) -> None:
        self._initialized = False
        logger.info("Audio cache closed")

    async def warm(self, tts_provider, language: str = "en", voice_id: str = "default", concurrency: int = 4) -> int:
        total = len(COMMON_PHRASES)
        logger.info("Warming audio cache with %d phrases...", total)
        semaphore = asyncio.Semaphore(concurrency)

        async def _synthesize_one(phrase: str) -> bool:
            async with semaphore:
                try:
                    existing = await self.get(phrase, voice_id=voice_id, language=language)
                    if existing is not None:
                        return True
                    audio = await tts_provider.synthesize(text=phrase, voice_id=voice_id, language=language)
                    if audio and len(audio) > 100:
                        await self.set(phrase, audio, voice_id=voice_id, language=language)
                        return True
                except Exception:
                    pass
                return False

        results = await asyncio.gather(*[_synthesize_one(p) for p in COMMON_PHRASES])
        warmed = sum(1 for r in results if r)
        self._stats["warmed_entries"] = warmed
        logger.info("Cache warm complete: %d/%d", warmed, total)
        return warmed

    def get_stats(self) -> dict[str, Any]:
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = (self._stats["hits"] / total * 100) if total > 0 else 0.0
        return {"hits": self._stats["hits"], "misses": self._stats["misses"], "hit_rate_percent": round(hit_rate, 1), "stores": self._stats["stores"], "warmed_entries": self._stats["warmed_entries"]}


_cache_service: AudioCacheService | None = None


def get_audio_cache_service() -> AudioCacheService:
    global _cache_service
    if _cache_service is None:
        _cache_service = AudioCacheService(cache_dir=settings.AUDIO_CACHE_DIR, default_ttl=settings.AUDIO_CACHE_TTL, max_memory_entries=settings.AUDIO_CACHE_MAX_MEMORY)
    return _cache_service


def reset_audio_cache_service() -> None:
    global _cache_service
    _cache_service = None
