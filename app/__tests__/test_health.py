"""Tests for the FastAPI application and health endpoint."""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.providers import reset_default_registry


@pytest.fixture(autouse=True)
def reset():
    """Reset the registry before each test."""
    reset_default_registry()


@pytest.mark.asyncio
async def test_health_endpoint():
    """GET /health should return 200 with status 'ok'."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "uptime_seconds" in data


@pytest.mark.asyncio
async def test_providers_endpoint():
    """GET /providers should list all registered providers."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/providers")
        assert response.status_code == 200
        data = response.json()
        assert "stt_providers" in data
        assert "llm_providers" in data
        assert "tts_providers" in data
        assert "active_stt" in data
        assert "active_llm" in data
        assert "active_tts" in data
