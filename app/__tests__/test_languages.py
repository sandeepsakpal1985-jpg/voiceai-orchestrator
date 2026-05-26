"""Tests for the Languages API endpoint."""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.providers import reset_default_registry


@pytest.fixture(autouse=True)
def reset():
    """Reset the registry before each test."""
    reset_default_registry()


@pytest.mark.asyncio
async def test_get_languages_returns_all():
    """GET /api/languages should return all 8 supported languages."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/languages")
        assert response.status_code == 200
        data = response.json()

        assert "languages" in data
        assert "total" in data
        assert data["total"] == 8
        assert len(data["languages"]) == 8


@pytest.mark.asyncio
async def test_get_languages_structure():
    """Each language should have the correct fields."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/languages")
        data = response.json()

        for lang in data["languages"]:
            assert "code" in lang
            assert "name" in lang
            assert "native" in lang
            assert "flag" in lang
            assert "voice" in lang
            assert "sttProviders" in lang
            assert "llmProviders" in lang
            assert "ttsProviders" in lang
            assert "rtl" in lang
            assert "samples" in lang

            # Provider arrays should have at least one provider
            assert len(lang["sttProviders"]) >= 1
            assert len(lang["llmProviders"]) >= 1
            assert len(lang["ttsProviders"]) >= 1

            # Samples should be a non-empty list of strings
            assert len(lang["samples"]) >= 1
            assert all(isinstance(s, str) for s in lang["samples"])


@pytest.mark.asyncio
async def test_get_languages_includes_english():
    """English should be the first language with correct defaults."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/languages")
        data = response.json()

        en = data["languages"][0]
        assert en["code"] == "en"
        assert en["name"] == "English"
        assert en["rtl"] is False
        assert "Whisper" in en["sttProviders"]
        assert "Ollama" in en["llmProviders"]
        assert "Kokoro" in en["ttsProviders"]


@pytest.mark.asyncio
async def test_get_languages_includes_hindi():
    """Hindi should have correct native name and RTL flag."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/languages")
        data = response.json()

        hi = None
        for lang in data["languages"]:
            if lang["code"] == "hi":
                hi = lang
                break

        assert hi is not None
        assert hi["name"] == "Hindi"
        assert hi["native"] == "हिन्दी"
        assert hi["rtl"] is False


@pytest.mark.asyncio
async def test_get_languages_includes_arabic():
    """Arabic should have correct fields including RTL flag."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/languages")
        data = response.json()

        ar = None
        for lang in data["languages"]:
            if lang["code"] == "ar":
                ar = lang
                break

        assert ar is not None
        assert ar["name"] == "Arabic"
        assert ar["native"] == "العربية"
        assert ar["rtl"] is True
        assert "ElevenLabs" in ar["ttsProviders"]


@pytest.mark.asyncio
async def test_get_language_by_code():
    """GET /api/languages/{code} should return a single language."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/languages/es")
        assert response.status_code == 200
        data = response.json()

        assert data["code"] == "es"
        assert data["name"] == "Spanish"
        assert data["native"] == "Español"
        assert data["rtl"] is False
        assert "Whisper" in data["sttProviders"]


@pytest.mark.asyncio
async def test_get_language_not_found():
    """GET /api/languages/{code} with unknown code should return 404."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/languages/xx")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data


@pytest.mark.asyncio
async def test_get_language_case_sensitive():
    """Language codes should be case-sensitive (lowercase)."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/languages/EN")
        assert response.status_code == 404


@pytest.mark.asyncio
async def test_all_provider_arrays_non_empty():
    """Every language should have non-empty STT, LLM, and TTS providers."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/languages")
        data = response.json()

        for lang in data["languages"]:
            assert len(lang["sttProviders"]) > 0, f"{lang['code']} has no STT providers"
            assert len(lang["llmProviders"]) > 0, f"{lang['code']} has no LLM providers"
            assert len(lang["ttsProviders"]) > 0, f"{lang['code']} has no TTS providers"
