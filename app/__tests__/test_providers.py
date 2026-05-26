"""Tests for the provider abstraction layer."""

import pytest
from app.providers import ProviderRegistry, get_default_registry, reset_default_registry


def test_registry_creation():
    """ProviderRegistry should start empty."""
    registry = ProviderRegistry()
    assert registry.list_stt_providers() == []
    assert registry.list_llm_providers() == []
    assert registry.list_tts_providers() == []


def test_registry_raises_on_empty_get():
    """Getting a provider from an empty registry should raise ValueError."""
    registry = ProviderRegistry()
    with pytest.raises(ValueError, match="No STT providers registered"):
        registry.get_stt()
    with pytest.raises(ValueError, match="No LLM providers registered"):
        registry.get_llm()
    with pytest.raises(ValueError, match="No TTS providers registered"):
        registry.get_tts()


def test_get_nonexistent_provider():
    """Getting a provider by a name that doesn't exist should raise ValueError."""
    registry = ProviderRegistry()
    with pytest.raises(ValueError, match="STT provider 'nonexistent' not registered"):
        registry.get_stt("nonexistent")


def test_all_providers_empty():
    """all_providers() should return empty lists when nothing is registered."""
    registry = ProviderRegistry()
    result = registry.all_providers()
    assert result == {"stt": [], "llm": [], "tts": []}


def test_reset_default_registry():
    """reset_default_registry should clear the singleton."""
    reset_default_registry()
    registry = get_default_registry()
    assert isinstance(registry, ProviderRegistry)
    reset_default_registry()
