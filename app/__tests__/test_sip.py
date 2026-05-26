"""Unit tests for the SIP dispatch module and SIP API routes.

Tests cover:
    - SIP call lifecycle (dispatch, query, end)
    - Active call tracking
    - Edge cases (missing calls, duplicate dispatches, cleanup)
    - SIP API route responses
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.livekit.sip_dispatch import (
    SipCallInfo,
    dispatch_inbound_sip_call,
    end_sip_call,
    get_active_sip_calls,
    get_sip_call,
    initialize_sip_dispatch,
)


class TestSipCallInfo:
    """Test the SipCallInfo data class."""

    def test_call_info_creation(self):
        """Test basic creation of a SipCallInfo instance."""
        call = SipCallInfo(
            call_id="test-call-1",
            from_number="+14155551212",
            to_number="+14155551234",
            room_name="sip-+14155551234",
            participant_identity="caller-14155551212",
        )

        assert call.call_id == "test-call-1"
        assert call.from_number == "+14155551212"
        assert call.to_number == "+14155551234"
        assert call.room_name == "sip-+14155551234"
        assert call.participant_identity == "caller-14155551212"
        assert call.status == "active"
        assert call.started_at > 0

    def test_call_info_to_dict(self):
        """Test that to_dict() returns the expected structure."""
        call = SipCallInfo(
            call_id="test-call-1",
            from_number="+14155551212",
            to_number="+14155551234",
            room_name="sip-+14155551234",
            participant_identity="caller-14155551212",
        )

        d = call.to_dict()
        assert d["call_id"] == "test-call-1"
        assert d["from_number"] == "+14155551212"
        assert d["to_number"] == "+14155551234"
        assert d["room_name"] == "sip-+14155551234"
        assert d["status"] == "active"
        assert d["duration_seconds"] >= 0


class TestSipDispatch:
    """Test the SIP dispatch lifecycle: dispatch → query → end."""

    @pytest.fixture(autouse=True)
    async def cleanup_calls(self):
        """Clean up any lingering calls after each test."""
        yield
        # End any remaining active calls
        active = get_active_sip_calls()
        for call in active:
            await end_sip_call(call["call_id"])

    @pytest.mark.asyncio
    async def test_dispatch_and_query(self):
        """Test dispatching a call and querying its info."""
        call = await dispatch_inbound_sip_call(
            call_id="livekit-call-001",
            from_number="+14155550001",
            to_number="+14155550002",
        )

        assert call.call_id == "livekit-call-001"
        assert call.room_name == "sip-+14155550002"
        assert call.status == "active"

        # Query by call_id
        queried = get_sip_call("livekit-call-001")
        assert queried is not None
        assert queried["from_number"] == "+14155550001"
        assert queried["status"] == "active"

    @pytest.mark.asyncio
    async def test_dispatch_and_end(self):
        """Test dispatching a call and ending it."""
        await dispatch_inbound_sip_call(
            call_id="livekit-call-002",
            from_number="+14155550003",
            to_number="+14155550004",
        )

        # End the call
        result = await end_sip_call("livekit-call-002")
        assert result is True

        # Should no longer be queryable
        queried = get_sip_call("livekit-call-002")
        assert queried is None

    @pytest.mark.asyncio
    async def test_list_active_calls(self):
        """Test listing active calls returns only non-ended calls."""
        # Pre-clean
        for cid in ["livekit-call-003", "livekit-call-004", "livekit-call-005"]:
            await end_sip_call(cid)

        await dispatch_inbound_sip_call(
            call_id="livekit-call-003",
            from_number="+14155550005",
            to_number="+14155550006",
        )
        await dispatch_inbound_sip_call(
            call_id="livekit-call-004",
            from_number="+14155550007",
            to_number="+14155550008",
        )

        active = get_active_sip_calls()
        assert len(active) == 2

        call_ids = {c["call_id"] for c in active}
        assert "livekit-call-003" in call_ids
        assert "livekit-call-004" in call_ids

        # End one and check again
        await end_sip_call("livekit-call-003")
        active = get_active_sip_calls()
        assert len(active) == 1
        assert active[0]["call_id"] == "livekit-call-004"

    @pytest.mark.asyncio
    async def test_get_nonexistent_call(self):
        """Test querying a call that doesn't exist."""
        result = get_sip_call("nonexistent-call")
        assert result is None

    @pytest.mark.asyncio
    async def test_end_nonexistent_call(self):
        """Test ending a call that doesn't exist."""
        result = await end_sip_call("nonexistent-call")
        assert result is False

    @pytest.mark.asyncio
    async def test_duplicate_dispatch_replaces(self):
        """Test dispatching with the same call_id replaces the old entry."""
        await dispatch_inbound_sip_call(
            call_id="duplicate-call",
            from_number="+14155551001",
            to_number="+14155552001",
        )
        await dispatch_inbound_sip_call(
            call_id="duplicate-call",
            from_number="+14155551002",
            to_number="+14155552002",
        )

        call = get_sip_call("duplicate-call")
        assert call is not None
        assert call["from_number"] == "+14155551002"
        assert call["to_number"] == "+14155552002"

        # Clean up
        await end_sip_call("duplicate-call")

    @pytest.mark.asyncio
    async def test_room_name_formatting(self):
        """Test that room names are formatted with the configured prefix."""
        call = await dispatch_inbound_sip_call(
            call_id="room-format-test",
            from_number="+14155553001",
            to_number="+14155554001",
        )
        assert call.room_name.startswith("sip-")
        assert "+14155554001" in call.room_name

    @pytest.mark.asyncio
    async def test_participant_identity_formatting(self):
        """Test that participant identities strip the + prefix."""
        call = await dispatch_inbound_sip_call(
            call_id="identity-test",
            from_number="+14155555001",
            to_number="+14155556001",
        )
        assert call.participant_identity == "caller-14155555001"
        assert "+" not in call.participant_identity.replace("caller-", "")


class TestSipApiRoutes:
    """Test the SIP API routes using a minimal FastAPI test app."""

    @pytest.fixture
    def client(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        from app.routers.sip import router  # noqa: PLC0415
        app.include_router(router)
        return TestClient(app)

    def test_list_sip_calls_endpoint(self, client):
        """Test GET /sip/calls returns a valid response."""
        response = client.get("/sip/calls")
        assert response.status_code == 200
        data = response.json()
        assert "active_calls" in data
        assert "calls" in data
        assert isinstance(data["calls"], list)

    def test_get_sip_config_endpoint(self, client):
        """Test GET /sip/config returns configuration."""
        response = client.get("/sip/config")
        assert response.status_code == 200
        data = response.json()
        assert "sip_enabled" in data
        assert "server_address" in data
        assert "sip_port" in data
        assert "room_prefix" in data

    def test_get_nonexistent_call_returns_404(self, client):
        """Test GET /sip/calls/nonexistent returns 404."""
        response = client.get("/sip/calls/nonexistent-call-id")
        assert response.status_code == 404


class TestInitializeSipDispatch:
    """Test the SIP dispatch initialization."""

    @pytest.mark.asyncio
    async def test_initialize_with_sip_enabled(self):
        """Test initialization with SIP enabled logs config."""
        with patch("app.config.settings.SIP_ENABLED", True):
            # Should not raise
            await initialize_sip_dispatch()

    @pytest.mark.asyncio
    async def test_initialize_with_sip_disabled(self):
        """Test initialization with SIP disabled logs skip message."""
        with patch("app.config.settings.SIP_ENABLED", False):
            # Should not raise
            await initialize_sip_dispatch()
