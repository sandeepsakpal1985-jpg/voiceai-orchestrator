"""
Tests for the AssemblyAI STT Provider.

Covers both the real provider (with mocked SDK) and the stub provider.
"""

import pytest

from app.providers.stt.assemblyai_stub import AssemblyAISTTProvider as StubProvider
from app.providers.stt.assemblyai_real import AssemblyAISTTProvider as RealProvider
from app.providers.base import STTProvider


class TestAssemblyAIStub:
    """Tests for the AssemblyAI stub provider."""

    @pytest.fixture
    def provider(self):
        return StubProvider(api_key="test-key")

    def test_provider_name(self, provider):
        assert provider.provider_name == "assemblyai"

    def test_supports_streaming(self, provider):
        assert provider.supports_streaming is True

    def test_is_stt_provider(self, provider):
        assert isinstance(provider, STTProvider)

    @pytest.mark.asyncio
    async def test_transcribe_raises_not_implemented(self, provider):
        with pytest.raises(NotImplementedError, match="not yet implemented"):
            await provider.transcribe(b"fake audio")

    @pytest.mark.asyncio
    async def test_transcribe_stream_raises_not_implemented(self, provider):
        # The stub raises NotImplementedError before yielding,
        # so it returns a coroutine (not an async generator).
        with pytest.raises(NotImplementedError, match="not yet implemented"):
            await provider.transcribe_stream(b"")  # type: ignore


class TestAssemblyAIRealInit:
    """Tests for the real AssemblyAI provider initialization."""

    @pytest.fixture
    def provider(self):
        return RealProvider(api_key="test-real-key")

    def test_provider_name(self, provider):
        assert provider.provider_name == "assemblyai"

    def test_supports_streaming(self, provider):
        assert provider.supports_streaming is True

    def test_is_stt_provider(self, provider):
        assert isinstance(provider, STTProvider)

    @pytest.mark.asyncio
    async def test_transcribe_requires_api_key(self):
        """Without API key, transcribe should raise ValueError."""
        provider = RealProvider(api_key="")  # no key
        with pytest.raises(ValueError, match="API key is not configured"):
            await provider.transcribe(b"test audio")

    @pytest.mark.asyncio
    async def test_transcribe_stream_requires_api_key(self):
        """Without API key, stream should raise ValueError."""
        provider = RealProvider(api_key="")  # no key

        async def empty_stream():
            yield b""

        with pytest.raises(ValueError, match="API key is required"):
            async for _ in provider.transcribe_stream(empty_stream()):
                pass

    @pytest.mark.asyncio
    async def test_with_api_key_does_not_raise_on_init(self):
        """Setting an API key in __init__ should not raise if assemblyai is installed."""
        provider = RealProvider(api_key="test-key")
        assert provider._api_key == "test-key"
        assert provider.provider_name == "assemblyai"
