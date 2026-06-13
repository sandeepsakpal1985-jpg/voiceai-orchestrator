"""Tests for the provider registry."""

import pytest
from app.providers import ProviderRegistry, get_default_registry, reset_default_registry


class MockSTTProvider:
    provider_name = "mock_stt"
    supports_streaming = False
    async def transcribe(self, audio_data, language="en", **kwargs):
        return "mock transcription"
    async def transcribe_stream(self, audio_stream, language="en", **kwargs):
        yield "mock chunk"


class MockLLMProvider:
    provider_name = "mock_llm"
    supports_streaming = False
    supports_tool_calling = False
    async def complete(self, messages, temperature=0.7, max_tokens=1024, **kwargs):
        return "mock response"
    async def complete_stream(self, messages, temperature=0.7, max_tokens=1024, **kwargs):
        yield "mock chunk"


class MockTTSProvider:
    provider_name = "mock_tts"
    supports_streaming = False
    supported_voices = [{"id": "default", "name": "Default"}]
    async def synthesize(self, text, voice_id="default", language="en", speaking_rate=1.0, pitch=0.0, **kwargs):
        return b"mock audio"
    async def synthesize_stream(self, text, voice_id="default", language="en", speaking_rate=1.0, pitch=0.0, **kwargs):
        yield b"mock audio"


@pytest.fixture
def registry():
    reset_default_registry()
    return get_default_registry()


def test_register_and_get_stt(registry):
    provider = MockSTTProvider()
    registry.register_stt("mock", provider)
    assert registry.get_stt("mock") is provider
    assert "mock" in registry.list_stt_providers()


def test_register_and_get_llm(registry):
    provider = MockLLMProvider()
    registry.register_llm("mock", provider)
    assert registry.get_llm("mock") is provider
    assert "mock" in registry.list_llm_providers()


def test_register_and_get_tts(registry):
    provider = MockTTSProvider()
    registry.register_tts("mock", provider)
    assert registry.get_tts("mock") is provider
    assert "mock" in registry.list_tts_providers()


def test_get_default_returns_first(registry):
    p1 = MockSTTProvider()
    p2 = MockSTTProvider()
    registry.register_stt("first", p1)
    registry.register_stt("second", p2)
    assert registry.get_stt() is p1


def test_get_nonexistent_raises(registry):
    with pytest.raises(ValueError):
        registry.get_stt("nonexistent")


def test_all_providers(registry):
    registry.register_stt("stt1", MockSTTProvider())
    registry.register_llm("llm1", MockLLMProvider())
    registry.register_tts("tts1", MockTTSProvider())
    result = registry.all_providers()
    assert "stt" in result
    assert "llm" in result
    assert "tts" in result
