"""Tests for telephony/freeswitch/http_api.py — FreeSWITCH HTTP API router."""

import base64
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from telephony.freeswitch.http_api import router as freeswitch_router

# Build a minimal test app with just the FS router
app = FastAPI()
app.include_router(freeswitch_router)


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
class TestFsHealth:
    async def test_health_endpoint(self, client):
        """GET /fs/health returns status ok."""
        resp = await client.get("/fs/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "active_calls" in data


@pytest.mark.asyncio
class TestFsIncoming:
    async def test_incoming_call_creates_conversation(self, client):
        """POST /fs/incoming creates conversation and returns greeting."""
        resp = await client.post("/fs/incoming", json={
            "call_uuid": "test-uuid-123",
            "caller_number": "+15551234567",
            "called_number": "+15559876543",
            "sip_call_id": "sip-test-id",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "conversation_id" in data
        assert data["conversation_id"] is not None
        assert "greeting" in data
        assert len(data["greeting"]) > 10
        assert data["action"] == "play_greeting"


@pytest.mark.asyncio
class TestFsProcess:
    async def test_process_empty_audio_returns_noop(self, client):
        """POST /fs/process with empty audio returns gracefully."""
        # First create a call
        resp = await client.post("/fs/incoming", json={
            "call_uuid": "process-test-uuid",
            "caller_number": "+15551234567",
            "called_number": "+15559876543",
        })
        conv_id = resp.json()["conversation_id"]

        # Process with empty audio
        resp = await client.post("/fs/process", json={
            "call_uuid": "process-test-uuid",
            "audio_base64": "",
            "conversation_id": conv_id,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["end_call"] is False  # Empty audio shouldn't end call

    async def test_process_invalid_audio_returns_400(self, client):
        """POST /fs/process with invalid base64 returns 400."""
        resp = await client.post("/fs/incoming", json={
            "call_uuid": "bad-audio-uuid",
            "caller_number": "+15551234567",
            "called_number": "+15559876543",
        })
        conv_id = resp.json()["conversation_id"]

        resp = await client.post("/fs/process", json={
            "call_uuid": "bad-audio-uuid",
            "audio_base64": "not-valid-base64!!!",
            "conversation_id": conv_id,
        })
        assert resp.status_code == 400

    async def test_process_no_call_returns_404(self, client):
        """POST /fs/process without creating call first returns 404."""
        resp = await client.post("/fs/process", json={
            "call_uuid": "nonexistent-uuid",
            "audio_base64": base64.b64encode(b"fake audio").decode(),
            "conversation_id": "",
        })
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestFsHangup:
    async def test_hangup_unknown_call_still_returns_ok(self, client):
        """POST /fs/hangup on unknown call still returns OK."""
        resp = await client.post("/fs/hangup", json={
            "call_uuid": "unknown-uuid",
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    async def test_hangup_active_call(self, client):
        """POST /fs/hangup after /fs/incoming cleans up call."""
        resp = await client.post("/fs/incoming", json={
            "call_uuid": "hangup-test-uuid",
            "caller_number": "+15551234567",
            "called_number": "+15559876543",
        })
        assert resp.status_code == 200

        # Hang up
        resp = await client.post("/fs/hangup", json={
            "call_uuid": "hangup-test-uuid",
        })
        assert resp.status_code == 200

        # Health check should show 0 active calls
        from telephony.freeswitch.http_api import _call_state
        assert "hangup-test-uuid" not in _call_state
