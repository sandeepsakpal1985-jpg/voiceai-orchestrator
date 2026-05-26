#!/usr/bin/env python3
"""
SIP Smoke Test — Verifies the LiveKit SIP dispatch pipeline end-to-end.

This script is designed to run inside the test Docker compose environment
(docker-compose.test.yml) and performs the following checks:

  1. LiveKit server is reachable via its HTTP API
  2. SIP dispatch module can be initialized
  3. A simulated SIP call dispatch works (dispatch → query → end)
  4. Active calls endpoint returns expected results after dispatch

Usage:
    python scripts/test_sip_smoke.py --livekit-url http://livekit-server:7880

Environment Variables:
    LIVEKIT_URL     — LiveKit WebSocket URL (default: ws://localhost:7880)
    LIVEKIT_API_KEY — LiveKit API key (default: test-key)
    LIVEKIT_SECRET  — LiveKit API secret (default: test-secret)

Note: This is a service-level test that validates the integration between
the SIP dispatch module and a running LiveKit server. Unit-level tests
for the dispatch logic itself live in app/__tests__/test_sip.py.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def check_livekit_http(livekit_url: str) -> bool:
    """Check that the LiveKit server HTTP API is reachable."""
    try:
        health_url = livekit_url.replace(":7880", ":7881") + "/health"
        req = urllib.request.Request(health_url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            print(f"[PASS] LiveKit HTTP API reachable (status={resp.status})")
            return True
    except urllib.error.URLError as e:
        print(f"[FAIL] LiveKit HTTP not reachable: {e.reason}")
        return False
    except Exception as e:
        print(f"[FAIL] LiveKit HTTP check failed: {e}")
        return False


def check_sip_dispatch_import() -> bool:
    """Check that the SIP dispatch module loads without errors."""
    try:
        from app.livekit.sip_dispatch import (
            SipCallInfo,
            dispatch_inbound_sip_call,
            end_sip_call,
            get_active_sip_calls,
            get_sip_call,
        )
        print("[PASS] SIP dispatch module imported successfully")
        return True
    except ImportError as e:
        print(f"[FAIL] SIP dispatch import failed: {e}")
        return False
    except Exception as e:
        print(f"[FAIL] SIP dispatch init failed: {e}")
        return False


async def test_sip_lifecycle() -> bool:
    """Test the full SIP call lifecycle: dispatch → query → end."""
    try:
        from app.livekit.sip_dispatch import (
            dispatch_inbound_sip_call,
            end_sip_call,
            get_active_sip_calls,
            get_sip_call,
        )

        # Dispatch a test call
        call = await dispatch_inbound_sip_call(
            call_id="smoke-test-call-001",
            from_number="+14155559999",
            to_number="+14155558888",
        )
        assert call.status == "active", f"Expected active, got {call.status}"
        assert "sip-" in call.room_name, f"Expected sip- prefix in room name"
        print(f"[PASS] SIP call dispatched: {call.call_id} → room {call.room_name}")

        # Query the call
        queried = get_sip_call("smoke-test-call-001")
        assert queried is not None, "Expected call info, got None"
        assert queried["status"] == "active"
        print(f"[PASS] SIP call queryable: status={queried['status']}")

        # Verify active calls list
        active = get_active_sip_calls()
        call_ids = {c["call_id"] for c in active}
        assert "smoke-test-call-001" in call_ids
        print(f"[PASS] SIP call appears in active list ({len(active)} total)")

        # End the call
        result = await end_sip_call("smoke-test-call-001")
        assert result is True
        print(f"[PASS] SIP call ended successfully")

        # Verify it's gone
        gone = get_sip_call("smoke-test-call-001")
        assert gone is None, "Expected call to be removed after end"
        print(f"[PASS] SIP call removed from tracking")
        return True

    except Exception as e:
        print(f"[FAIL] SIP lifecycle test failed: {e}")
        return False


async def test_sip_api() -> bool:
    """Test the SIP API endpoints by importing and calling them directly."""
    try:
        from app.routers.sip import list_sip_calls, get_sip_config

        # Test config endpoint
        config = await get_sip_config()
        assert "sip_enabled" in config
        print(f"[PASS] SIP config endpoint: enabled={config.get('sip_enabled')}")

        # Test list calls endpoint (should be empty or contain our test calls)
        calls = await list_sip_calls()
        assert "active_calls" in calls
        print(f"[PASS] SIP list calls endpoint: {calls['active_calls']} active")
        return True

    except Exception as e:
        print(f"[FAIL] SIP API test failed: {e}")
        return False


async def main():
    parser = argparse.ArgumentParser(description="LiveKit SIP Smoke Test")
    parser.add_argument("--livekit-url", default=os.getenv("LIVEKIT_URL", "http://localhost:7880"))
    args = parser.parse_args()

    livekit_http = args.livekit_url.replace("ws://", "http://").replace("wss://", "https://")

    print("=" * 60)
    print("LiveKit SIP Smoke Test")
    print("=" * 60)
    print()

    results = []

    # 1. Check LiveKit HTTP
    print("--- Checking LiveKit HTTP ---")
    results.append(("LiveKit HTTP", check_livekit_http(livekit_http)))

    # 2. Check SIP dispatch import
    print("\n--- Checking SIP Dispatch Import ---")
    results.append(("SIP Import", check_sip_dispatch_import()))

    # 3. Test SIP lifecycle
    print("\n--- Testing SIP Call Lifecycle ---")
    results.append(("SIP Lifecycle", await test_sip_lifecycle()))

    # 4. Test SIP API
    print("\n--- Testing SIP API ---")
    results.append(("SIP API", await test_sip_api()))

    # Summary
    print("\n" + "=" * 60)
    print("Results")
    print("=" * 60)
    all_pass = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {name}")
        if not passed:
            all_pass = False

    print()
    if all_pass:
        print("All smoke tests PASSED.")
        sys.exit(0)
    else:
        print("Some smoke tests FAILED.")
        sys.exit(1)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
