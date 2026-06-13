"""Tests for telephony/freeswitch/types.py — data classes and enums."""

import time
import pytest
from telephony.freeswitch.types import (
    CallState,
    CallDirection,
    FreeswitchCall,
    ESLCommand,
    ESLResponse,
)


class TestCallState:
    def test_enum_values(self):
        assert CallState.RINGING.value == "ringing"
        assert CallState.ANSWERED.value == "answered"
        assert CallState.RECORDING.value == "recording"
        assert CallState.PROCESSING.value == "processing"
        assert CallState.SPEAKING.value == "speaking"
        assert CallState.WAITING.value == "waiting"
        assert CallState.COMPLETED.value == "completed"
        assert CallState.FAILED.value == "failed"

    def test_is_active_true_for_active_states(self):
        active = CallState.ANSWERED
        assert active not in (CallState.COMPLETED, CallState.FAILED)

    def test_is_active_false_for_completed(self):
        assert CallState.COMPLETED not in (CallState.RINGING,)


class TestCallDirection:
    def test_enum_values(self):
        assert CallDirection.INBOUND.value == "inbound"
        assert CallDirection.OUTBOUND.value == "outbound"


class TestFreeswitchCall:
    def test_default_values(self):
        call = FreeswitchCall(call_uuid="test-uuid", caller_number="+15551234567", called_number="+15559876543")
        assert call.call_uuid == "test-uuid"
        assert call.caller_number == "+15551234567"
        assert call.called_number == "+15559876543"
        assert call.direction == CallDirection.INBOUND
        assert call.state == CallState.RINGING
        assert call.turn_count == 0
        assert call.conversation_id == ""
        assert call.is_active is True

    def test_mark_answered(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+1", called_number="+2")
        call.mark_answered()
        assert call.state == CallState.ANSWERED
        assert call.answered_at > 0

    def test_mark_recording(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+1", called_number="+2")
        call.mark_recording("/tmp/test.wav")
        assert call.state == CallState.RECORDING
        assert call.recording_file == "/tmp/test.wav"

    def test_mark_processing(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+1", called_number="+2")
        call.mark_processing()
        assert call.state == CallState.PROCESSING

    def test_mark_speaking(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+1", called_number="+2")
        call.mark_speaking()
        assert call.state == CallState.SPEAKING

    def test_mark_waiting(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+1", called_number="+2")
        call.mark_waiting()
        assert call.state == CallState.WAITING

    def test_mark_completed(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+1", called_number="+2")
        call.mark_answered()
        call.mark_completed()
        assert call.state == CallState.COMPLETED
        assert call.is_active is False
        assert call.ended_at is not None

    def test_mark_failed(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+1", called_number="+2")
        call.mark_failed("Connection timeout")
        assert call.state == CallState.FAILED
        assert call.error == "Connection timeout"
        assert call.is_active is False

    def test_increment_turn(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+1", called_number="+2")
        assert call.increment_turn() == 1
        assert call.increment_turn() == 2
        assert call.turn_count == 2

    def test_duration(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+1", called_number="+2")
        call.started_at = time.time() - 10
        assert call.duration >= 9.0  # At least ~10 seconds

    def test_summary(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+15551234567", called_number="+15559876543")
        call.conversation_id = "conv-123"
        summary = call.summary
        assert summary["call_uuid"] == "u1"
        assert summary["caller_number"] == "+15551234567"
        assert summary["conversation_id"] == "conv-123"
        assert summary["state"] == "ringing"
        assert summary["turn_count"] == 0

    def test_completed_summary_includes_error(self):
        call = FreeswitchCall(call_uuid="u1", caller_number="+1", called_number="+2")
        call.mark_failed("Bad gateway")
        assert call.summary["error"] == "Bad gateway"

    def test_outbound_direction(self):
        call = FreeswitchCall(
            call_uuid="u1", caller_number="+1", called_number="+2",
            direction=CallDirection.OUTBOUND,
        )
        assert call.direction == CallDirection.OUTBOUND
        assert call.summary["direction"] == "outbound"


class TestESLCommand:
    def test_encode_api(self):
        cmd = ESLCommand(command="status", bgapi=False)
        assert cmd.encode() == b"api status \n\n"

    def test_encode_api_with_args(self):
        cmd = ESLCommand(command="show", args="calls count", bgapi=False)
        assert cmd.encode() == b"api show calls count\n\n"

    def test_encode_bgapi(self):
        cmd = ESLCommand(command="originate", args="user/1000 &park()", bgapi=True)
        assert cmd.encode() == b"bgapi originate user/1000 &park()\n\n"


class TestESLResponse:
    def test_defaults(self):
        resp = ESLResponse(success=True, body="+OK")
        assert resp.success is True
        assert resp.body == "+OK"
        assert resp.headers == {}
        assert resp.content_type == "text/plain"
        assert resp.job_uuid == ""

    def test_with_headers(self):
        resp = ESLResponse(
            success=True,
            body="Event-Name: CHANNEL_ANSWER",
            headers={"Content-Type": "text/event-plain"},
            content_type="text/event-plain",
        )
        assert resp.headers["Content-Type"] == "text/event-plain"

    def test_error_response(self):
        resp = ESLResponse(success=False, body="-ERR command not found")
        assert resp.success is False

    def test_with_job_uuid(self):
        resp = ESLResponse(success=True, body="+OK", job_uuid="job-123")
        assert resp.job_uuid == "job-123"
