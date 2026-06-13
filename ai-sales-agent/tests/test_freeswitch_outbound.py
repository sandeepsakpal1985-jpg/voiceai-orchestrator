"""Tests for POST /fs/outbound — outbound call initiation via ESL."""

import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from telephony.freeswitch.http_api import router as freeswitch_router
from telephony.freeswitch.bridge_service import get_freeswitch_bridge, reset_freeswitch_bridge

# Build minimal test app
app = FastAPI()
app.include_router(freeswitch_router)


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
class TestOutboundCall:
    async def test_outbound_returns_error_when_esl_down(self, client):
        """POST /fs/outbound should return error when ESL bridge is not connected."""
        reset_freeswitch_bridge()

        resp = await client.post("/fs/outbound", json={
            "to_number": "+15551234567",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "error"
        assert "not connected" in data["message"].lower()

    async def test_outbound_validates_to_number(self, client):
        """POST /fs/outbound should reject missing to_number."""
        resp = await client.post("/fs/outbound", json={})
        assert resp.status_code == 422  # Validation error

    async def test_outbound_accepts_optional_from_number(self, client):
        """POST /fs/outbound should accept optional from_number."""
        reset_freeswitch_bridge()

        resp = await client.post("/fs/outbound", json={
            "to_number": "+15551234567",
            "from_number": "+15559876543",
        })
        # ESL is down, but the request format should be valid
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "error"  # ESL not connected

    async def test_outbound_accepts_optional_prompt(self, client):
        """POST /fs/outbound should accept optional prompt."""
        reset_freeswitch_bridge()

        resp = await client.post("/fs/outbound", json={
            "to_number": "+15551234567",
            "prompt": "Hello, I'm calling about your enquiry.",
        })
        assert resp.status_code == 200

    async def test_outbound_healthcheck_doesnt_affect(self, client):
        """Calling /fs/outbound shouldn't break /fs/health."""
        resp = await client.post("/fs/outbound", json={
            "to_number": "+15551234567",
        })
        assert resp.status_code == 200

        resp = await client.get("/fs/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
