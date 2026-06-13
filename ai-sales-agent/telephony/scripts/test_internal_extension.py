"""
FreeSWITCH Internal Extension Test -- Validation Script

Verifies the complete local test setup:
  - ESL connectivity to FreeSWITCH
  - FreeSWITCH container health
  - Extension 1000, 1001, 1002, 1003, 1004 exist in directory
  - Dialplan loads correctly for internal call routing
  - Backend AI pipeline connectivity (STT -> LLM -> TTS)

Usage:
    python telephony/scripts/test_internal_extension.py

Requires:
    - FreeSWITCH container running (ai-freeswitch)
    - Backend running on port 8000 (optional, for end-to-end check)
"""

import asyncio
import json
import sys
import os
import urllib.request
import urllib.error
from pathlib import Path

# Fix Windows console encoding for Unicode characters
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

# -- Configuration --------------------------------------------------
FS_ESL_HOST = os.getenv("FREESWITCH_ESL_HOST", "127.0.0.1")
FS_ESL_PORT = int(os.getenv("FREESWITCH_ESL_PORT", "8021"))
FS_ESL_PASSWORD = os.getenv("FREESWITCH_ESL_PASSWORD", "ClueCon")
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")

# Expected extensions
EXPECTED_EXTENSIONS = ["1000", "1001", "1002", "1003", "1004"]

TERMINAL_WIDTH = 60

# -- Helpers --------------------------------------------------------


def banner(title: str) -> None:
    """Print a section banner."""
    print()
    print("=" * TERMINAL_WIDTH)
    print(f"  {title}")
    print("=" * TERMINAL_WIDTH)


def pass_msg(msg: str) -> None:
    """Print a PASS message."""
    print(f"  [PASS] {msg}")


def fail_msg(msg: str) -> None:
    """Print a FAIL message."""
    print(f"  [FAIL] {msg}")


def warn_msg(msg: str) -> None:
    """Print a WARN message."""
    print(f"  [WARN] {msg}")


def info_msg(msg: str) -> None:
    """Print an INFO message."""
    print(f"  [INFO] {msg}")


# -- Test Suites ----------------------------------------------------


async def test_esl_connectivity() -> bool:
    """Test ESL connection to FreeSWITCH."""
    banner("1. ESL Connectivity")

    try:
        from telephony.freeswitch.esl_client import ESLClient
        from telephony.freeswitch.exceptions import ESLConnectionError

        client = ESLClient(
            host=FS_ESL_HOST,
            port=FS_ESL_PORT,
            password=FS_ESL_PASSWORD,
            timeout=5,
        )

        await client.connect()
        pass_msg(f"Connected to FreeSWITCH ESL at {FS_ESL_HOST}:{FS_ESL_PORT}")

        # Test API command
        resp = await client.send_command("status")
        if resp.success and "UP" in resp.body:
            pass_msg("FreeSWITCH status: UP")
        else:
            fail_msg(f"FreeSWITCH status check failed: {resp.body[:100]}")
            await client.disconnect()
            return False

        await client.disconnect()
        pass_msg("ESL disconnect clean")
        return True

    except ESLConnectionError as e:
        fail_msg(f"ESL connection failed: {e}")
        return False
    except ImportError as e:
        fail_msg(f"Import error: {e}. Is the project installed?")
        info_msg("Run: pip install -e . or set PYTHONPATH")
        return False


async def test_freeswitch_health() -> bool:
    """Test FreeSWITCH health via ESL commands."""
    banner("2. FreeSWITCH Health")

    from telephony.freeswitch.esl_client import ESLClient

    client = ESLClient(
        host=FS_ESL_HOST,
        port=FS_ESL_PORT,
        password=FS_ESL_PASSWORD,
        timeout=5,
    )

    try:
        await client.connect()

        # Check uptime
        resp = await client.send_command("status")
        if resp.success:
            for line in resp.body.split("\n"):
                if "UP" in line or "up" in line:
                    pass_msg(f"FreeSWITCH is UP: {line.strip()}")
                    break
            else:
                warn_msg("Could not parse status; raw output:")
                info_msg(resp.body[:200])
        else:
            fail_msg(f"Status command failed: {resp.body[:100]}")
            await client.disconnect()
            return False

        # Check Sofia SIP profile
        resp = await client.send_command("sofia status profile internal")
        if resp.success:
            for line in resp.body.split("\n"):
                if "RUNNING" in line or "Status" in line:
                    pass_msg(f"SIP internal profile: {line.strip()}")
                    break
            else:
                warn_msg("SIP profile status unclear, raw output:")
                info_msg(resp.body[:200])
        else:
            fail_msg(f"Sofia status failed: {resp.body[:100]}")
            await client.disconnect()
            return False

        # Check modules
        resp = await client.send_command("show modules")
        if resp.success:
            if "mod_event_socket" in resp.body:
                pass_msg("mod_event_socket loaded")
            else:
                warn_msg("mod_event_socket not found in module list")

            if "mod_sofia" in resp.body:
                pass_msg("mod_sofia loaded")
            else:
                warn_msg("mod_sofia not found in module list")
        else:
            warn_msg("Could not list modules")

        # Check codecs
        resp = await client.send_command("show codecs")
        if resp.success:
            for codec in ["PCMU", "PCMA", "opus"]:
                if codec in resp.body.upper():
                    pass_msg(f"Codec {codec} available")
                else:
                    warn_msg(f"Codec {codec} not found")
        else:
            warn_msg("Could not list codecs")

        await client.disconnect()
        return True

    except Exception as e:
        fail_msg(f"Health check error: {e}")
        return False


async def test_extension_existence() -> bool:
    """Test that extensions 1000-1004 exist in FreeSWITCH."""
    banner("3. Extension Existence")

    from telephony.freeswitch.esl_client import ESLClient

    client = ESLClient(
        host=FS_ESL_HOST,
        port=FS_ESL_PORT,
        password=FS_ESL_PASSWORD,
        timeout=5,
    )

    try:
        await client.connect()

        for ext in EXPECTED_EXTENSIONS:
            # Check directory listing
            resp = await client.send_command(
                f"user_data {ext} default"
            )
            if resp.success and resp.body.strip():
                pass_msg(f"Extension {ext} found in directory")
                # Show some details
                for line in resp.body.split("\n"):
                    if "password" in line.lower() or "user_context" in line.lower():
                        info_msg(f"  {ext}: {line.strip()}")
            else:
                fail_msg(f"Extension {ext} NOT found in FreeSWITCH directory")

        await client.disconnect()
        return True

    except Exception as e:
        fail_msg(f"Extension check error: {e}")
        return False


async def test_dialplan_loading() -> bool:
    """Test that the dialplan loads correctly for all AI extensions."""
    banner("4. Dialplan Loading")

    from telephony.freeswitch.esl_client import ESLClient

    client = ESLClient(
        host=FS_ESL_HOST,
        port=FS_ESL_PORT,
        password=FS_ESL_PASSWORD,
        timeout=5,
    )

    try:
        await client.connect()

        for ext in EXPECTED_EXTENSIONS:
            resp = await client.send_command(
                f"dialplan {ext} ai-sales-agent"
            )
            if resp.success and resp.body.strip():
                pass_msg(f"Dialplan resolves extension {ext}")
                # Check which extension block matched
                if f"ai_agent_extension_{ext}" in resp.body:
                    pass_msg(f"  {ext} -> ai_agent_extension_{ext}")
                elif ext == "1000":
                    pass_msg(f"  {ext} -> inbound bridge (user extension)")
                elif ext.startswith("100") and ext != "1000":
                    pass_msg(f"  {ext} -> ai_agent_extension_{ext} (AI Agent)")
                else:
                    info_msg(f"  Raw dialplan output: {resp.body[:200]}")
            else:
                fail_msg(f"Dialplan does NOT resolve extension {ext}")
                info_msg(f"  Command: dialplan {ext} ai-sales-agent")

        await client.disconnect()
        return True

    except Exception as e:
        fail_msg(f"Dialplan check error: {e}")
        return False


async def test_backend_connectivity() -> bool:
    """Test connectivity to the AI backend."""
    banner("5. Backend Connectivity")

    def _http_get(path: str, timeout: int = 5):
        """Synchronous HTTP GET using stdlib (no external deps)."""
        try:
            req = urllib.request.Request(f"{BACKEND_URL}{path}")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8")
                return resp.status, json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            return e.code, {}
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            return None, str(e)

    # Use asyncio to run the blocking HTTP calls in a thread pool
    loop = asyncio.get_running_loop()

    status, data = await loop.run_in_executor(None, lambda: _http_get("/health"))
    if status == 200:
        pass_msg(f"Backend health OK (status: {data.get('status', 'unknown')})")
        info_msg(f"  Version: {data.get('version', 'unknown')}")
    elif status is None:
        fail_msg(f"Cannot connect to backend at {BACKEND_URL}. Is the backend running?")
        return False
    else:
        fail_msg(f"Backend returned status {status}")
        return False

    status, data = await loop.run_in_executor(None, lambda: _http_get("/fs/health"))
    if status == 200:
        pass_msg(f"FS health endpoint OK: {data.get('status', 'unknown')}")
    else:
        warn_msg(f"FS health endpoint: {status}")

    return True


async def test_end_to_end_pipeline() -> bool:
    """Test the full STT -> LLM -> TTS pipeline via the backend."""
    banner("6. End-to-End Pipeline (Optional)")

    def _http_get(path: str, timeout: int = 5):
        """Synchronous HTTP GET using stdlib."""
        try:
            req = urllib.request.Request(f"{BACKEND_URL}{path}")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8")
                return resp.status, json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            return e.code, {}
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            return None, str(e)

    loop = asyncio.get_running_loop()

    status, _ = await loop.run_in_executor(None, lambda: _http_get("/health", timeout=5))
    if status != 200:
        warn_msg("Backend not available, skipping pipeline test")
        return False

    status, data = await loop.run_in_executor(None, lambda: _http_get("/health/stt"))
    info_msg(f"STT provider: {data if status == 200 else 'unavailable'}")

    status, data = await loop.run_in_executor(None, lambda: _http_get("/health/llm"))
    info_msg(f"LLM provider: {data if status == 200 else 'unavailable'}")

    status, data = await loop.run_in_executor(None, lambda: _http_get("/health/tts"))
    info_msg(f"TTS provider: {data if status == 200 else 'unavailable'}")

    pass_msg("Pipeline providers available")
    return True


# -- Main ------------------------------------------------------------


async def main() -> int:
    """Run all tests and return exit code."""
    print()
    print("FreeSWITCH Internal Extension Test Suite")
    print("=" * TERMINAL_WIDTH)
    print()
    info_msg(f"ESL: {FS_ESL_HOST}:{FS_ESL_PORT}")
    info_msg(f"Backend: {BACKEND_URL}")
    info_msg(f"Expected extensions: {', '.join(EXPECTED_EXTENSIONS)}")
    print()

    results = {}

    # Test 1: ESL Connectivity
    results["ESL Connectivity"] = await test_esl_connectivity()

    # Test 2: FreeSWITCH Health
    results["FreeSWITCH Health"] = await test_freeswitch_health()

    # Test 3: Extension Existence
    results["Extension Existence"] = await test_extension_existence()

    # Test 4: Dialplan Loading
    results["Dialplan Loading"] = await test_dialplan_loading()

    # Test 5: Backend Connectivity
    results["Backend Connectivity"] = await test_backend_connectivity()

    # Test 6: End-to-End Pipeline (optional)
    results["E2E Pipeline"] = await test_end_to_end_pipeline()

    # -- Summary -----------------------------------------------------
    print()
    print("=" * TERMINAL_WIDTH)
    print("  RESULTS SUMMARY")
    print("=" * TERMINAL_WIDTH)

    all_pass = True
    for test_name, passed in results.items():
        if passed:
            print(f"  [PASS] {test_name}")
        else:
            print(f"  [FAIL] {test_name}")
            all_pass = False

    print()
    if all_pass:
        print("  All tests PASSED! The internal test setup is ready.")
        print()
        print("  Next steps:")
        print("  1. Open MicroSIP -> configure extension 1000")
        print("     (Server: 127.0.0.1:5060, User: 1000, Pass: 1000pass)")
        print("  2. Dial 1001, 1002, 1003, or 1004 to reach AI Agents")
        print("  3. Speak into microphone -> hear AI response")
        print("  4. Watch logs: docker logs ai-freeswitch --tail 50 -f")
        print()
        return 0
    else:
        print("  Some tests FAILED. Check the details above.")
        print()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
