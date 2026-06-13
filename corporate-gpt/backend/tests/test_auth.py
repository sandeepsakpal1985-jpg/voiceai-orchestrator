"""Auth endpoint tests."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "test@corpgpt.local",
        "password": "testpassword123",
        "full_name": "Test User",
        "organization_name": "TestCorp",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data

    resp = await client.post("/api/v1/auth/login", json={
        "email": "test@corpgpt.local",
        "password": "testpassword123",
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_invalid(client: AsyncClient):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "wrong@email.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401
