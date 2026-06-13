"""Tests for telephony/freeswitch/bridge_service.py — FreeSWITCH bridge."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from telephony.freeswitch.bridge_service import (
    FreeSwitchBridgeService,
    get_freeswitch_bridge,
    reset_freeswitch_bridge,
)
from telephony.freeswitch.types import CallState, FreeswitchCall
from telephony.freeswitch.exceptions import BridgeServiceError


@pytest.fixture
def bridge():
    reset_freeswitch_bridge()
    return get_freeswitch_bridge()


@pytest.mark.asyncio
class TestFreeSwitchBridgeService:
    async def test_initial_state(self, bridge):
        """Bridge should not be running initially."""
        assert bridge.is_running is False
        assert bridge.esl_connected is False
        assert bridge.active_call_count == 0

    async def test_start_creates_connection_task(self, bridge):
        """start() should set is_running and create connection task."""
        await bridge.start()
        assert bridge.is_running is True
        assert bridge._connection_task is not None
        # Clean up: stop the bridge
        await bridge.stop()
        assert bridge.is_running is False

    async def test_stop_cleans_up(self, bridge):
        """stop() should clean up all tasks and calls."""
        await bridge.start()
        await bridge.stop()
        assert bridge.is_running is False
        assert bridge.active_call_count == 0
        assert len(bridge._active_calls) == 0
        assert len(bridge._handlers) == 0

    async def test_get_stats_when_not_connected(self, bridge):
        """get_stats() returns reasonable defaults when not connected."""
        stats = await bridge.get_stats()
        assert stats["connected"] is False
        assert stats["running"] is False
        assert stats["active_calls"] == 0
        assert stats["total_calls_tracked"] == 0

    async def test_get_stats_after_start(self, bridge):
        """get_stats() works after start."""
        await bridge.start()
        stats = await bridge.get_stats()
        assert stats["running"] is True
        await bridge.stop()

    async def test_initiate_outbound_fails_when_not_connected(self, bridge):
        """initiate_outbound_call() raises when ESL not connected."""
        with pytest.raises(BridgeServiceError):
            await bridge.initiate_outbound_call("+15551234567")


@pytest.mark.asyncio
class TestFreeSwitchBridgeEvents:
    """Test event handling without actual ESL connection."""

    async def test_channel_create_tracks_call(self, bridge):
        """CHANNEL_CREATE event should add call to active_calls."""
        await bridge.start()
        event = {
            "Event-Name": "CHANNEL_CREATE",
            "Unique-ID": "call-uuid-1",
            "Caller-Caller-ID-Number": "+15551234567",
            "Caller-Dialplan": "ai-sales-agent",
            "Caller-Destination-Number": "+15559876543",
            "Caller-Context": "ai-sales-agent",
            "Caller-Network-Addr": "192.168.1.10",
        }
        await bridge._on_channel_create(event)
        assert "call-uuid-1" in bridge._active_calls
        call = bridge._active_calls["call-uuid-1"]
        assert call.caller_number == "+15551234567"
        assert call.state == CallState.RINGING
        await bridge.stop()

    async def test_channel_hangup_removes_call(self, bridge):
        """CHANNEL_HANGUP event should mark call as completed."""
        await bridge.start()
        # First create a call
        call = FreeswitchCall(
            call_uuid="hangup-uuid",
            caller_number="+15551234567",
            called_number="+15559876543",
        )
        bridge._active_calls["hangup-uuid"] = call

        event = {
            "Event-Name": "CHANNEL_HANGUP",
            "Unique-ID": "hangup-uuid",
        }
        await bridge._on_channel_hangup(event)
        assert call.state == CallState.COMPLETED
        # Call is still in active_calls (cleaned up by periodic task)
        assert "hangup-uuid" in bridge._active_calls
        await bridge.stop()

    async def test_duplicate_channel_create_ignored(self, bridge):
        """Duplicate CHANNEL_CREATE events should be ignored."""
        await bridge.start()
        event = {
            "Event-Name": "CHANNEL_CREATE",
            "Unique-ID": "dup-uuid",
            "Caller-Caller-ID-Number": "+15551234567",
            "Caller-Dialplan": "default",
        }
        await bridge._on_channel_create(event)
        assert "dup-uuid" in bridge._active_calls
        count_before = len(bridge._active_calls)

        # Same event again
        await bridge._on_channel_create(event)
        assert len(bridge._active_calls) == count_before  # No duplicate
        await bridge.stop()

    async def test_channel_destroy_cleanup(self, bridge):
        """CHANNEL_DESTROY event triggers cleanup."""
        await bridge.start()
        call = FreeswitchCall(
            call_uuid="destroy-uuid",
            caller_number="+1",
            called_number="+2",
        )
        bridge._active_calls["destroy-uuid"] = call
        event = {"Event-Name": "CHANNEL_DESTROY", "Unique-ID": "destroy-uuid"}
        await bridge._on_channel_destroy(event)
        assert call.state == CallState.COMPLETED
        await bridge.stop()

    async def test_raw_event_dispatch(self, bridge):
        """Raw events should be logged but not crash."""
        await bridge.start()
        event = {"Event-Name": "CUSTOM", "Action": "sofia::register"}
        # This should not raise
        await bridge._on_raw_event(event)
        await bridge.stop()


class TestGetFreeSwitchBridge:
    def test_singleton(self):
        reset_freeswitch_bridge()
        b1 = get_freeswitch_bridge()
        b2 = get_freeswitch_bridge()
        assert b1 is b2

    def test_reset(self):
        reset_freeswitch_bridge()
        b1 = get_freeswitch_bridge()
        reset_freeswitch_bridge()
        b2 = get_freeswitch_bridge()
        assert b1 is not b2
