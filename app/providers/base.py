"""
Provider Abstraction Layer — Abstract Base Classes

All providers MUST inherit from these ABCs.
This ensures provider-independence: swap any provider without changing orchestration logic.
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional, Protocol


# ── STT Provider ────────────────────────────────────────────────────


class STTProvider(ABC):
    """Speech-to-Text provider interface."""

    @abstractmethod
    async def transcribe(
        self, audio_data: bytes, language: str = "en", **kwargs
    ) -> str:
        """Transcribe audio bytes to text."""
        ...

    @abstractmethod
    async def transcribe_stream(
        self, audio_stream: AsyncIterator[bytes], language: str = "en", **kwargs
    ) -> AsyncIterator[str]:
        """Streaming transcription from an async audio stream."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider name (e.g. 'whisper', 'deepgram')."""
        ...

    @property
    @abstractmethod
    def supports_streaming(self) -> bool:
        """Whether this provider supports streaming transcription."""
        ...


# ── LLM Provider ────────────────────────────────────────────────────


class LLMProvider(ABC):
    """Large Language Model provider interface."""

    @abstractmethod
    async def complete(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs,
    ) -> str:
        """Non-streaming completion. Returns full response text."""
        ...

    @abstractmethod
    async def complete_stream(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs,
    ) -> AsyncIterator[str]:
        """Streaming completion. Yields text chunks as they arrive."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider name (e.g. 'openai', 'ollama')."""
        ...

    @property
    @abstractmethod
    def supports_streaming(self) -> bool:
        """Whether this provider supports streaming responses."""
        ...

    @property
    @abstractmethod
    def supports_tool_calling(self) -> bool:
        """Whether this provider supports function/tool calling."""
        ...


# ── TTS Provider ────────────────────────────────────────────────────


class TTSProvider(ABC):
    """Text-to-Speech provider interface."""

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        voice_id: str = "default",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> bytes:
        """Synthesize text to audio bytes."""
        ...

    @abstractmethod
    async def synthesize_stream(
        self,
        text: str,
        voice_id: str = "default",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> AsyncIterator[bytes]:
        """Streaming TTS. Yields audio chunks as they are generated."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider name (e.g. 'elevenlabs', 'xtts')."""
        ...

    @property
    @abstractmethod
    def supports_streaming(self) -> bool:
        """Whether this provider supports streaming synthesis."""
        ...

    @property
    @abstractmethod
    def supported_voices(self) -> list[dict]:
        """List of available voices with id, name, language info."""
        ...


# ── Provider Registry ──────────────────────────────────────────────


class ProviderRegistry:
    """
    Registry for all provider implementations.

    Usage:
        registry = ProviderRegistry()
        registry.register_stt("whisper", WhisperSTTProvider())
        registry.register_llm("openai", OpenAILLMProvider())

        stt = registry.get_stt("whisper")
    """

    def __init__(self):
        self._stt_providers: dict[str, STTProvider] = {}
        self._llm_providers: dict[str, LLMProvider] = {}
        self._tts_providers: dict[str, TTSProvider] = {}

    # ── STT ──

    def register_stt(self, name: str, provider: STTProvider) -> None:
        self._stt_providers[name] = provider

    def get_stt(self, name: str | None = None) -> STTProvider:
        if name:
            if name not in self._stt_providers:
                raise ValueError(f"STT provider '{name}' not registered. Available: {list(self._stt_providers.keys())}")
            return self._stt_providers[name]
        # Return first registered as default
        if not self._stt_providers:
            raise ValueError("No STT providers registered")
        return next(iter(self._stt_providers.values()))

    def list_stt_providers(self) -> list[str]:
        return list(self._stt_providers.keys())

    # ── LLM ──

    def register_llm(self, name: str, provider: LLMProvider) -> None:
        self._llm_providers[name] = provider

    def get_llm(self, name: str | None = None) -> LLMProvider:
        if name:
            if name not in self._llm_providers:
                raise ValueError(f"LLM provider '{name}' not registered. Available: {list(self._llm_providers.keys())}")
            return self._llm_providers[name]
        if not self._llm_providers:
            raise ValueError("No LLM providers registered")
        return next(iter(self._llm_providers.values()))

    def list_llm_providers(self) -> list[str]:
        return list(self._llm_providers.keys())

    # ── TTS ──

    def register_tts(self, name: str, provider: TTSProvider) -> None:
        self._tts_providers[name] = provider

    def get_tts(self, name: str | None = None) -> TTSProvider:
        if name:
            if name not in self._tts_providers:
                raise ValueError(f"TTS provider '{name}' not registered. Available: {list(self._tts_providers.keys())}")
            return self._tts_providers[name]
        if not self._tts_providers:
            raise ValueError("No TTS providers registered")
        return next(iter(self._tts_providers.values()))

    def list_tts_providers(self) -> list[str]:
        return list(self._tts_providers.keys())

    # ── Bulk ──

    def all_providers(self) -> dict:
        return {
            "stt": self.list_stt_providers(),
            "llm": self.list_llm_providers(),
            "tts": self.list_tts_providers(),
        }


# Singleton registry for app-wide use
_default_registry: ProviderRegistry | None = None


def get_default_registry() -> ProviderRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = ProviderRegistry()
    return _default_registry


def reset_default_registry() -> None:
    """Reset the default registry (useful for testing)."""
    global _default_registry
    _default_registry = None
