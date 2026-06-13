"""Tests for the health endpoint."""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "providers" in data


@pytest.mark.asyncio
async def test_providers_endpoint(client):
    response = await client.get("/providers")
    assert response.status_code == 200
    data = response.json()
    assert "stt_providers" in data
    assert "llm_providers" in data
    assert "tts_providers" in data
