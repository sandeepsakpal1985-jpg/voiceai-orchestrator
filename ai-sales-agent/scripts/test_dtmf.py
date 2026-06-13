#!/usr/bin/env python3
"""
DTMF Handler Simulation Test — Tests digit detection and menu routing logic
without requiring a live FreeSWITCH connection.

This script imports the bridge service's DTMF handler and feeds it synthetic
DTMF events, then verifies that digits are stored, history is maintained,
and special sequences (0, *) are routed correctly.

Run from the project root:
    python scripts/test_dtmf.py

Exit code:
    0 — All tests passed
    1 — One or more tests failed
"""

import asyncio
import os
import sys
import time

# Ensure backend/ is on sys.path for imports
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, ".."))
_backend_path = os.path.join(_project_root, "backend")

# telephony/ lives at project root; app/ lives in backend/
for p in [_project_root, _backend_path]:
    if p not in sys.path:
        sys.path.insert(0, p)

from telephony.freeswitch.bridge_service import FreeSwitchBridgeService
from telephony.freeswitch.types import CallDirection, CallState, FreeswitchCall


# ── Test Helpers ──


def make_dtmf_event(digit: str, call_uuid: str, duration: str = "100") -> dict:
    """Create a synthetic DTMF event dict simulating what FreeSWITCH ESL sends."""
    return {
        "Event-Name": "DTMF",
        "Unique-ID": call_uuid,
        "DTMF-Digit": digit,
        "DTMF-Duration": duration,
    }


def make_call(uuid: str) -> FreeswitchCall:
    """Create a minimal FreeswitchCall for testing."""
    return FreeswitchCall(
        call_uuid=uuid,
        caller_number="+15551234567",
        called_number="+15559876543",
        direction=CallDirection.INBOUND,
        state=CallState.ANSWERED,
        started_at=time.time(),
    )


def format_icon(passed: bool) -> str:
    """Return a cross-platform status icon."""
    return "PASS" if passed else "FAIL"


# ── Tests ──


async def test_digit_tracking():
    """DTMF digits should be stored in call metadata."""
    bridge = FreeSwitchBridgeService()
    call_uuid = "test-digit-tracking"
    call = make_call(call_uuid)
    bridge._active_calls[call_uuid] = call

    event = make_dtmf_event("1", call_uuid)
    await bridge._on_dtmf(event)

    assert call.metadata.get("last_dtmf") == "1", "last_dtmf should be '1'"
    assert len(call.metadata.get("dtmf_history", [])) == 1, "should have 1 history entry"

    print(f"  [{format_icon(True)}] Digits tracked in call metadata")
    return True


async def test_history_accumulation():
    """Multiple DTMF presses should accumulate in history."""
    bridge = FreeSwitchBridgeService()
    call_uuid = "test-history"
    call = make_call(call_uuid)
    bridge._active_calls[call_uuid] = call

    for digit in ["1", "2", "3", "#"]:
        await bridge._on_dtmf(make_dtmf_event(digit, call_uuid))

    assert len(call.metadata.get("dtmf_history", [])) == 4, "Expected 4 history entries"
    assert call.metadata["last_dtmf"] == "#"

    # Check sequence
    digits = [h["digit"] for h in call.metadata["dtmf_history"]]
    assert digits == ["1", "2", "3", "#"], f"Expected ['1','2','3','#'], got {digits}"

    print(f"  [{format_icon(True)}] History accumulates correctly ({len(digits)} digits)")
    return True


async def test_history_limit():
    """History should be capped at 20 entries."""
    bridge = FreeSwitchBridgeService()
    call_uuid = "test-history-limit"
    call = make_call(call_uuid)
    bridge._active_calls[call_uuid] = call

    for i in range(25):
        await bridge._on_dtmf(make_dtmf_event(str(i % 10), call_uuid))

    history = call.metadata.get("dtmf_history", [])
    assert len(history) == 20, f"Expected 20 history entries, got {len(history)}"

    print(f"  [{format_icon(True)}] History capped at 20 entries")
    return True


async def test_operator_digit():
    """Digit '0' should set dtmf_action to 'operator'."""
    bridge = FreeSwitchBridgeService()
    call_uuid = "test-operator"
    call = make_call(call_uuid)
    bridge._active_calls[call_uuid] = call

    await bridge._on_dtmf(make_dtmf_event("0", call_uuid))

    assert call.metadata.get("dtmf_action") == "operator"

    print(f"  [{format_icon(True)}] Digit 0 triggers operator action")
    return True


async def test_restart_menu_digit():
    """Digit '*' should set dtmf_action to 'restart_menu'."""
    bridge = FreeSwitchBridgeService()
    call_uuid = "test-restart"
    call = make_call(call_uuid)
    bridge._active_calls[call_uuid] = call

    await bridge._on_dtmf(make_dtmf_event("*", call_uuid))

    assert call.metadata.get("dtmf_action") == "restart_menu"

    print(f"  [{format_icon(True)}] Digit * triggers restart_menu action")
    return True


async def test_regular_digit_no_action():
    """Regular digits should not set a special dtmf_action."""
    bridge = FreeSwitchBridgeService()
    call_uuid = "test-regular"
    call = make_call(call_uuid)
    bridge._active_calls[call_uuid] = call

    await bridge._on_dtmf(make_dtmf_event("3", call_uuid))

    # Regular digits should NOT set dtmf_action
    assert call.metadata.get("dtmf_action") is None, \
        f"Expected no action, got {call.metadata.get('dtmf_action')}"
    assert call.metadata.get("last_dtmf") == "3"

    print(f"  [{format_icon(True)}] Regular digits don't trigger special actions")
    return True


async def test_multiple_special_digits():
    """Multiple special digits should update the action each time."""
    bridge = FreeSwitchBridgeService()
    call_uuid = "test-multi-special"
    call = make_call(call_uuid)
    bridge._active_calls[call_uuid] = call

    await bridge._on_dtmf(make_dtmf_event("0", call_uuid))
    assert call.metadata.get("dtmf_action") == "operator"

    await bridge._on_dtmf(make_dtmf_event("*", call_uuid))
    assert call.metadata.get("dtmf_action") == "restart_menu"

    await bridge._on_dtmf(make_dtmf_event("0", call_uuid))
    assert call.metadata.get("dtmf_action") == "operator"

    print(f"  [{format_icon(True)}] Special digits overwrite previous actions")
    return True


async def test_nonexistent_call():
    """DTMF events for unknown calls should be handled gracefully (no crash)."""
    bridge = FreeSwitchBridgeService()
    event = make_dtmf_event("1", "nonexistent-call")

    # Should not raise
    await bridge._on_dtmf(event)

    print(f"  [{format_icon(True)}] DTMF on unknown call handled without error")
    return True


async def test_missing_digit():
    """DTMF events with missing digit should be handled gracefully."""
    bridge = FreeSwitchBridgeService()
    call_uuid = "test-missing-digit"
    call = make_call(call_uuid)
    bridge._active_calls[call_uuid] = call

    # Missing DTMF-Digit key (should use default "?")
    event = {"Event-Name": "DTMF", "Unique-ID": call_uuid}
    await bridge._on_dtmf(event)

    # "?" digit should be ignored (early return)
    assert call.metadata.get("last_dtmf") is None

    print(f"  [{format_icon(True)}] Missing digit handled without error")
    return True


async def test_missing_call_uuid():
    """DTMF events with missing call UUID should be handled gracefully."""
    bridge = FreeSwitchBridgeService()
    event = make_dtmf_event("1", "")
    await bridge._on_dtmf(event)

    print(f"  [{format_icon(True)}] Missing call UUID handled without error")
    return True


async def test_metadata_has_timestamps():
    """DTMF history entries should include timestamps."""
    bridge = FreeSwitchBridgeService()
    call_uuid = "test-timestamps"
    call = make_call(call_uuid)
    bridge._active_calls[call_uuid] = call

    await bridge._on_dtmf(make_dtmf_event("5", call_uuid))

    entry = call.metadata["dtmf_history"][0]
    assert "timestamp" in entry, "DTMF entry missing timestamp"
    assert entry["timestamp"] > 0, "Timestamp should be positive"
    assert "duration_ms" in entry, "DTMF entry missing duration_ms"

    print(f"  [{format_icon(True)}] DTMF entries include timestamps and duration")
    return True


async def test_duration_stored():
    """DTMF duration should be stored in history."""
    bridge = FreeSwitchBridgeService()
    call_uuid = "test-duration"
    call = make_call(call_uuid)
    bridge._active_calls[call_uuid] = call

    await bridge._on_dtmf(make_dtmf_event("9", call_uuid, duration="250"))

    entry = call.metadata["dtmf_history"][0]
    assert entry["duration_ms"] == "250"

    print(f"  [{format_icon(True)}] DTMF duration stored correctly")
    return True


# ── Runner ──


async def main():
    tests = [
        ("Digit tracking in metadata", test_digit_tracking),
        ("History accumulation", test_history_accumulation),
        ("History cap at 20 entries", test_history_limit),
        ("Operator digit (0)", test_operator_digit),
        ("Restart menu digit (*)", test_restart_menu_digit),
        ("Regular digit no special action", test_regular_digit_no_action),
        ("Multiple special digits", test_multiple_special_digits),
        ("Nonexistent call handled", test_nonexistent_call),
        ("Missing digit handled", test_missing_digit),
        ("Missing call UUID handled", test_missing_call_uuid),
        ("Timestamps in metadata", test_metadata_has_timestamps),
        ("Duration stored", test_duration_stored),
    ]

    passed = 0
    failed = 0

    print("=" * 60)
    print("  DTMF Handler Simulation Tests")
    print("=" * 60)
    print()

    for name, test_func in tests:
        print(f"  Test: {name}")
        try:
            result = await test_func()
            if result:
                passed += 1
        except Exception as e:
            print(f"  [FAIL] {type(e).__name__}: {e}")
            failed += 1
        print()

    print("=" * 60)
    total = passed + failed
    print(f"  Results: {passed}/{total} passed", end="")
    if failed:
        print(f", {failed} failed")
    else:
        print("  All good!")
    print("=" * 60)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
