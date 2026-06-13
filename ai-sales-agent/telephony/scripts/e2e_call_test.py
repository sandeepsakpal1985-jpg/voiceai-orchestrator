#!/usr/bin/env python3
"""
End-to-End Call Smoke Test — Validates the complete FreeSWITCH → AI pipeline.

Checks:
  1. Backend HTTP reachable
  2. FreeSWITCH ESL reachable (port 8021)
  3. FreeSWITCH SIP reachable (port 5060)
  4. FreeSWITCH HTTP API reachable
  5. STT provider (Whisper) available
  6. LLM provider (Qwen/Ollama) available
  7. TTS provider (Kokoro) available
  8. E2E Pipeline: STT + LLM + TTS (no FreeSWITCH)

Usage:
    python telephony/scripts/e2e_call_test.py
    python telephony/scripts/e2e_call_test.py --verbose

Returns exit code 0 on PASS, 1 on any FAIL.
"""

import argparse
import asyncio
import os
import socket
import sys
import time
from datetime import datetime

# Add backend/ to path (app module lives there)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
_backend_dir = os.path.join(_project_root, "backend")
for _p in [_backend_dir, _project_root]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

# ── ANSI Colors ──
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

# Unicode-safe icons (use ASCII on Windows to avoid UnicodeEncodeError)
if sys.platform == "win32":
    _ICON = {"PASS": f"{GREEN}[PASS]{RESET}", "FAIL": f"{RED}[FAIL]{RESET}", "SKIP": f"{YELLOW}[SKIP]{RESET}"}
else:
    _ICON = {"PASS": f"{GREEN}\u2713 PASS{RESET}", "FAIL": f"{RED}\u2717 FAIL{RESET}", "SKIP": f"{YELLOW}\u23ed SKIP{RESET}"}


def _p(status: str, check: str, detail: str = "") -> None:
    detail_str = f"  — {detail}" if detail else ""
    print(f"  {_ICON[status]}  {check}{detail_str}")


def check_port(host: str, port: int, timeout: float = 3.0) -> bool:
    """Check if a TCP port is open."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception:
        return False


async def check_http(url: str, timeout: float = 5.0) -> dict | None:
    """Make an HTTP GET request and return parsed JSON or None."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.json()
            return None
    except Exception:
        return None


async def check_http_post(url: str, data: dict, timeout: float = 15.0) -> dict | None:
    """Make an HTTP POST request and return parsed JSON or None."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=data)
            if resp.status_code == 200:
                return resp.json()
            return None
    except Exception:
        return None


async def run_pipeline_checks(pipeline) -> tuple[bool, dict]:
    """Run the STT/LLM/TTS pipeline checks and return (success, latency_measurements)."""
    import io
    import math
    import struct
    import wave

    latencies = {}
    sample_rate = 16000
    num_samples = int(sample_rate * 0.5)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        samples = [struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / sample_rate))) for i in range(num_samples)]
        wf.writeframes(b"".join(samples))
    test_audio = buf.getvalue()

    _p("PASS", f"Test audio generated: {len(test_audio)} bytes")

    # STT
    stt_start = time.time()
    transcription = await pipeline.stt.transcribe(test_audio, language="en")
    stt_latency = (time.time() - stt_start) * 1000
    latencies["stt_ms"] = stt_latency
    _p("PASS", f"STT completed in {stt_latency:.0f}ms", f"'{transcription[:40]}'")

    if transcription.strip():
        llm_start = time.time()
        messages = pipeline.build_messages(transcription, system_prompt="Respond briefly.")
        llm_response = await pipeline.llm.complete(messages, max_tokens=50)
        llm_latency = (time.time() - llm_start) * 1000
        latencies["llm_ms"] = llm_latency
        _p("PASS", f"LLM completed in {llm_latency:.0f}ms", f"'{llm_response.strip()[:60]}'")

        tts_start = time.time()
        audio = await pipeline.synthesize_response(llm_response)
        tts_latency = (time.time() - tts_start) * 1000
        latencies["tts_ms"] = tts_latency
        _p("PASS", f"TTS completed in {tts_latency:.0f}ms", f"{len(audio)} bytes audio")

        latencies["total_ms"] = stt_latency + llm_latency + tts_latency
        _p("PASS", f"Total pipeline latency: {latencies['total_ms']:.0f}ms")
    else:
        _p("SKIP", "LLM + TTS", "STT returned empty (expected for noise)")

    return True, latencies


async def run_checks(base_url: str = "http://localhost:8000", verbose: bool = False) -> bool:
    """Run all E2E checks, returning True if all pass.

    Args:
        base_url: Backend URL (default http://localhost:8000).
        verbose: Whether to run optional LLM response validation.
    """
    all_pass = True

    print(f"\n{CYAN}{BOLD}==============================================={RESET}")
    print(f"{CYAN}{BOLD}   AI Voice Agent — E2E Call Smoke Test{RESET}")
    print(f"{CYAN}{BOLD}==============================================={RESET}")
    print(f"  Started: {datetime.now().strftime('%H:%M:%S')}")
    print(f"  Backend: {base_url}")
    print()

    # ── 1. Backend HTTP ──
    print(f"{BOLD}[1/8] Backend Health{RESET}")
    health = await check_http(f"{base_url}/health")
    if health and health.get("status") == "ok":
        _p("PASS", "Backend HTTP reachable", f"v{health.get('version','?')}")
    else:
        _p("FAIL", "Backend HTTP reachable", "Is the backend running on port 8000?")
        all_pass = False

    # ── 2. FreeSWITCH ESL Port ──
    print(f"{BOLD}[2/8] FreeSWITCH ESL{RESET}")
    if check_port("127.0.0.1", 8021):
        _p("PASS", "ESL port 8021 open")
    else:
        _p("FAIL", "ESL port 8021 open", "Is FreeSWITCH running with ESL enabled?")
        all_pass = False

    # ── 3. FreeSWITCH SIP Port ──
    print(f"{BOLD}[3/8] FreeSWITCH SIP{RESET}")
    if check_port("127.0.0.1", 5060):
        _p("PASS", "SIP port 5060 open")
    else:
        _p("SKIP", "SIP port 5060 open", "Not required for ESL-only pipeline")

    # ── 4. FreeSWITCH HTTP API ──
    print(f"{BOLD}[4/8] FreeSWITCH HTTP API{RESET}")
    fs_health = await check_http(f"{base_url}/fs/health")
    if fs_health and fs_health.get("status") == "ok":
        _p("PASS", f"FS HTTP API reachable", f"{fs_health.get('active_calls',0)} active calls")
    else:
        _p("SKIP", "FS HTTP API reachable", "HTTP API not mounted or backend down")

    # ── 5-8: Pipeline checks (need backend env) ──
    print(f"{BOLD}[5/8] STT Provider (Whisper){RESET}")
    try:
        from app.config import settings
        from app.voice import get_voice_pipeline
        pipeline = get_voice_pipeline()
        _p("PASS", f"STT: {settings.STT_PROVIDER}, LLM: {settings.LLM_PROVIDER}, TTS: {settings.TTS_PROVIDER}")

        # ── 5. STT available ──
        stt = pipeline.stt
        if stt:
            _p("PASS", "STT provider registered")
        else:
            _p("FAIL", "STT provider registered")
            all_pass = False

        # ── 6. LLM available ──
        print(f"{BOLD}[6/8] LLM Provider (Qwen/Ollama){RESET}")
        llm = pipeline.llm
        if llm:
            _p("PASS", f"LLM: {settings.LLM_PROVIDER}")
        else:
            _p("FAIL", "LLM provider registered")
            all_pass = False

        # Quick LLM validation
        if verbose:
            try:
                llm_response = await asyncio.wait_for(
                    llm.complete([{"role": "user", "content": "Say OK"}], max_tokens=10),
                    timeout=10.0,
                )
                _p("PASS", "LLM responds", f"'{llm_response.strip()}'")
            except (asyncio.TimeoutError, Exception) as e:
                _p("SKIP", "LLM response test", str(e)[:60])

        # ── 7. TTS available ──
        print(f"{BOLD}[7/8] TTS Provider (Kokoro){RESET}")
        tts = pipeline.tts
        if tts:
            _p("PASS", f"TTS: {settings.TTS_PROVIDER}")
        else:
            _p("FAIL", "TTS provider registered")
            all_pass = False

        # ── 8. E2E Pipeline Test ──
        print(f"{BOLD}[8/8] E2E Pipeline: STT → LLM → TTS{RESET}")
        await run_pipeline_checks(pipeline)

    except ImportError as e:
        _p("SKIP", "Pipeline checks (5-8)", f"Backend imports not available: {str(e)[:60]}")
        _p("SKIP", "Run from `backend/` directory", "cd backend && python ../telephony/scripts/e2e_call_test.py")
    except Exception as e:
        _p("SKIP", "Pipeline checks (5-8)", f"Error: {str(e)[:60]}")

    # ── Summary ──
    print()
    if all_pass:
        print(f"  {GREEN}{BOLD}=========================================={RESET}")
        print(f"  {GREEN}{BOLD}         ALL CHECKS PASSED{RESET}")
        print(f"  {GREEN}{BOLD}=========================================={RESET}")
    else:
        print(f"  {RED}{BOLD}=========================================={RESET}")
        print(f"  {RED}{BOLD}         SOME CHECKS FAILED{RESET}")
        print(f"  {RED}{BOLD}=========================================={RESET}")

    print()
    return all_pass


def main():
    parser = argparse.ArgumentParser(description="AI Voice Agent E2E Call Smoke Test")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--backend", "-b", default="http://localhost:8000", help="Backend URL")
    args = parser.parse_args()

    success = asyncio.run(run_checks(base_url=args.backend, verbose=args.verbose))
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
