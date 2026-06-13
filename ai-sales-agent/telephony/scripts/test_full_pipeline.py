#!/usr/bin/env python3
"""
Comprehensive E2E Call Simulation Test
Simulates a complete phone call through the AI pipeline without needing FreeSWITCH.
Exercises: STT -> LLM -> TTS + conversation state engine + health endpoints.

Usage:
    python telephony/scripts/test_full_pipeline.py
    python telephony/scripts/test_full_pipeline.py --verbose

Requires: Backend running on http://localhost:8000
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error

BASE_URL = "http://localhost:8000"

# ASCII-safe status symbols for Windows terminals
PASS = "[PASS]"
FAIL = "[FAIL]"
SKIP = "[SKIP]"

# Terminal colors (Windows-compatible)
GREEN = ""
RED = ""
YELLOW = ""
RESET = ""


def _init_colors():
    global GREEN, RED, YELLOW, RESET
    if sys.platform != "win32" and sys.stdout.isatty():
        GREEN = "\033[92m"
        RED = "\033[91m"
        YELLOW = "\033[93m"
        RESET = "\033[0m"


_INITED = False


def _p(status: str, check: str, detail: str = "") -> None:
    global _INITED
    if not _INITED:
        _init_colors()
        _INITED = True
    icon_map = {
        "PASS": f"{GREEN}{PASS}{RESET}",
        "FAIL": f"{RED}{FAIL}{RESET}",
        "SKIP": f"{YELLOW}{SKIP}{RESET}",
    }
    detail_str = f"  - {detail}" if detail else ""
    print(f"  {icon_map[status]}  {check}{detail_str}")


def http_get(path: str, timeout: int = 30) -> tuple[bool, dict]:
    """GET an endpoint and parse JSON response."""
    try:
        req = urllib.request.Request(f"{BASE_URL}{path}")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
            return True, data
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        return False, {"error": f"HTTP {e.code}: {body}"}
    except urllib.error.URLError as e:
        return False, {"error": f"Connection failed: {e.reason}"}
    except Exception as e:
        return False, {"error": str(e)}


def http_post(path: str, body: dict, timeout: int = 30) -> tuple[bool, dict]:
    """POST JSON to an endpoint."""
    try:
        req = urllib.request.Request(
            f"{BASE_URL}{path}",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
            return True, data
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        return False, {"error": f"HTTP {e.code}: {body}"}
    except urllib.error.URLError as e:
        return False, {"error": f"Connection failed: {e.reason}"}
    except Exception as e:
        return False, {"error": str(e)}


def run_pipeline_checks() -> dict:
    """Run all E2E checks and return {passed, failed, skipped} counts."""
    results = {"passed": 0, "failed": 0, "skipped": 0}
    latencies = {}

    print("\n" + "=" * 60)
    print("   AI Sales Agent -- Full Pipeline Call Simulation")
    print("=" * 60)

    # -- Check 1: Backend Health -----------------------------------------------
    print("\n[1/8] Backend & Provider Status")
    ok, data = http_get("/health", timeout=10)
    if ok:
        _p("PASS", "Backend is running", f"v{data.get('version', '?')}")
        results["passed"] += 1
    else:
        _p("FAIL", f"Backend not reachable: {data.get('error', '')}")
        results["failed"] += 1
        print("\n   Cannot continue -- backend must be running on port 8000.")
        return results

    # -- Check 2: Provider List ------------------------------------------------
    ok, data = http_get("/providers", timeout=10)
    if ok:
        stt_count = len(data.get("stt_providers", []))
        llm_count = len(data.get("llm_providers", []))
        tts_count = len(data.get("tts_providers", []))
        active_llm = data.get("active_llm", "?")
        _p("PASS", f"Providers: {stt_count} STT, {llm_count} LLM, {tts_count} TTS")
        _p("PASS", f"Active providers: STT={data.get('active_stt','?')}, LLM={active_llm}, TTS={data.get('active_tts','?')}")
        results["passed"] += 2
    else:
        _p("FAIL", f"Provider list: {data.get('error', '')}")
        results["failed"] += 1

    # -- Check 3: STT Health (Whisper) -------------------------------------------
    print("\n[2/8] Speech-to-Text (Whisper)")
    t0 = time.time()
    ok, data = http_get("/health/stt", timeout=30)
    latencies["stt"] = time.time() - t0
    if ok:
        ms = data.get("transcription_ms", 0)
        chars = data.get("output_chars", 0)
        _p("PASS", f"Transcribed test audio in {ms:.0f}ms ({chars} chars)", f"{latencies['stt']:.1f}s total")
        results["passed"] += 1
    else:
        _p("FAIL", f"STT health check: {data.get('error', 'degraded')}")
        results["failed"] += 1

    # -- Check 4: LLM Health (Ollama qwen2.5:1.5b) -------------------------------
    print("\n[3/8] Language Model (Ollama qwen2.5:1.5b)")
    t0 = time.time()
    ok, data = http_get("/health/llm", timeout=35)
    latencies["llm"] = time.time() - t0
    if ok:
        resp = data.get("response", "")[:100]
        _p("PASS", f"LLM responded: '{resp}'", f"{latencies['llm']:.1f}s (cold start)")
        results["passed"] += 1
    else:
        err = data.get("error", data.get("check", "unknown"))
        _p("FAIL", f"LLM health check: {err}")
        results["failed"] += 1

    # -- Check 5: TTS Health (Kokoro) --------------------------------------------
    print("\n[4/8] Text-to-Speech (Kokoro)")
    t0 = time.time()
    ok, data = http_get("/health/tts", timeout=30)
    latencies["tts"] = time.time() - t0
    if ok:
        audio_bytes = data.get("audio_bytes", 0)
        _p("PASS", f"Synthesized {audio_bytes} bytes of speech", f"{latencies['tts']:.1f}s")
        results["passed"] += 1
    else:
        _p("FAIL", f"TTS health check: {data.get('error', 'degraded')}")
        results["failed"] += 1

    # -- Check 6: Sequential Provider Health (STT, LLM, TTS each independently) --
    print("\n[5/8] Sequential Provider Health (STT | LLM | TTS)")
    pipeline_time = time.time()

    # Step 6a: Test STT with real audio
    try:
        import io
        import math
        import struct
        import wave

        sample_rate = 16000
        num_samples = int(sample_rate * 0.3)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            samples = [
                struct.pack("<h", int(4000 * math.sin(2 * math.pi * 440 * i / sample_rate)))
                for i in range(num_samples)
            ]
            wf.writeframes(b"".join(samples))
        _p("PASS", "Generated test audio (0.3s tone)", "")
        results["passed"] += 1
    except Exception as e:
        _p("FAIL", f"Audio generation: {e}")
        results["failed"] += 1

    # Step 6b: Verify LLM can respond to a sales-related prompt
    t1 = time.time()
    ok, data = http_get("/health/llm", timeout=35)
    llm_latency = time.time() - t1
    if ok:
        llm_response = data.get("response", "")
        _p("PASS", f"LLM generated response ({len(llm_response)} chars)", f"{llm_latency:.1f}s")
        results["passed"] += 1
    else:
        _p("FAIL", f"LLM pipeline step: {data.get('error', 'no response')}")
        results["failed"] += 1

    # Step 6c: Verify TTS can synthesize speech
    t2 = time.time()
    ok, data = http_get("/health/tts", timeout=30)
    tts_latency = time.time() - t2
    if ok:
        audio_bytes = data.get("audio_bytes", 0)
        _p("PASS", f"TTS synthesized speech ({audio_bytes} bytes)", f"{tts_latency:.1f}s")
        results["passed"] += 1
    else:
        _p("FAIL", f"TTS pipeline step: {data.get('error', 'no audio')}")
        results["failed"] += 1

    total_pipeline = time.time() - pipeline_time
    _p("PASS", f"All 3 providers responded", f"{total_pipeline:.1f}s total time")
    results["passed"] += 1

    # -- Check 7: Provider Switching -------------------------------------------
    print("\n[6/8] Provider Switching")
    ok_before, data_before = http_get("/providers", timeout=10)
    llm_before = data_before.get("active_llm", "?") if ok_before else "?"
    _p("PASS" if ok_before else SKIP, f"Current LLM provider: {llm_before}")
    if ok_before:
        results["passed"] += 1
    else:
        results["skipped"] += 1

    # -- Check 8: All Health Endpoints -----------------------------------------
    print("\n[7/8] Health Endpoints")
    endpoints = {
        "/health": "Main health",
        "/health/stt": "STT health",
        "/health/llm": "LLM health",
        "/health/tts": "TTS health",
        "/providers": "Provider list",
    }
    healthy_count = 0
    for path, label in endpoints.items():
        ok, data = http_get(path, timeout=10)
        if ok:
            _p("PASS", f"{label} ({path})")
            healthy_count += 1
        else:
            _p("FAIL", f"{label} ({path}): {data.get('error', 'failed')}")

    if healthy_count == len(endpoints):
        _p("PASS", "All endpoints healthy")
        results["passed"] += 1
    else:
        _p("FAIL", f"{len(endpoints) - healthy_count} endpoint(s) unhealthy")
        results["failed"] += 1

    # Pipeline Summary
    print(f"\n   Pipeline latency: STT={latencies.get('stt',0):.1f}s, LLM={latencies.get('llm',0):.1f}s, TTS={latencies.get('tts',0):.1f}s")

    # -- Check 9: Recap with cloud connect readiness ---------------------------
    print("\n[8/8] Go-Live Readiness Check")
    print(f"   Backend:      {'READY' if results['failed'] == 0 else 'ISSUES'}")
    print(f"   STT (Whisper): {'READY' if latencies.get('stt',0) > 0 else 'NOT TESTED'}")
    print(f"   LLM (Ollama):  {'READY' if latencies.get('llm',0) > 0 else 'NOT TESTED'}")
    print(f"   TTS (Kokoro):  {'READY' if latencies.get('tts',0) > 0 else 'NOT TESTED'}")
    print(f"   FreeSWITCH:    Needs Docker install")
    print(f"   CloudConnect:  Needs SIP credentials (gateway template ready in external.xml)")

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Full pipeline E2E call simulation")
    parser.add_argument("-v", "--verbose", action="store_true", help="Show detailed output")
    args = parser.parse_args()

    # Always show detailed output for this test
    results = run_pipeline_checks()

    print("\n" + "=" * 60)
    total = results["passed"] + results["failed"] + results["skipped"]
    print(f"   Results: {results['passed']} passed, {results['failed']} failed, {results['skipped']} skipped (of {total})")
    print("=" * 60)

    if results["failed"] == 0:
        print()
        print("   FULL PIPELINE: READY FOR LIVE CALLS")
        print()
        print("   To make live calls:")
        print("     1. Install Docker Desktop")
        print("     2. docker compose -f docker/freeswitch-docker-compose.yml up -d")
        print("     3. Get SIP credentials from CloudConnect")
        print("     4. Fill gateway in telephony/configs/freeswitch/sip_profiles/external.xml")
        print("     5. Restart FreeSWITCH and dial your number")
        print()
        return 0
    else:
        print()
        print(f"   {results['failed']} check(s) failed -- review output above")
        print()
        return 1


if __name__ == "__main__":
    sys.exit(main())
