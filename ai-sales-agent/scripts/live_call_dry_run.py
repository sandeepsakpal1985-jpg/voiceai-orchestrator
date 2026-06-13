"""
Live Call Dry Run — Simulates the full AI pipeline without requiring FreeSWITCH.

Simulates:
  Incoming call → Audio → STT → LLM → TTS → Response
Outputs latency report for each stage.

This validates the entire AI pipeline end-to-end without needing
FreeSWITCH, a SIP trunk, or a phone.
"""

import asyncio
import io
import math
import struct
import sys
import time
import wave
from datetime import datetime
from typing import Any

# ── Cross-platform encoding fix ────────────────────────────────────
# Windows terminals (cmd, PowerShell) use cp1252 which doesn't support
# Unicode box-drawing characters. Detect and substitute.
_ENCODING = getattr(sys.stdout, "encoding", None) or ""
_IS_WINDOWS = sys.platform == "win32"
_USE_UNICODE = not _IS_WINDOWS or "utf" in _ENCODING.lower() or _ENCODING.lower() == "cp65001"

# Colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

# ASCII-safe line drawing
if _USE_UNICODE:
    H_LINE = "═"
    V_LINE = "║"
    TL = "╔"
    TR = "╗"
    BL = "╚"
    BR = "╝"
    BAR = "█"
    DASH = "─"
    ARROW = "→"
    STATUS_OK = "✅"
    STATUS_WARN = "⚠️"
    STATUS_FAIL = "❌"
else:
    H_LINE = "="
    V_LINE = "|"
    TL = "+"
    TR = "+"
    BL = "+"
    BR = "+"
    BAR = "#"
    DASH = "-"
    ARROW = "->"
    STATUS_OK = "[OK]"
    STATUS_WARN = "[??]"
    STATUS_FAIL = "[!!]"


def _generate_test_wav(duration_sec: float = 2.0) -> bytes:
    """Generate a short sine-wave WAV file simulating a caller's voice."""
    sample_rate = 16000
    frequency = 220.0  # Approximate human voice pitch
    num_samples = int(sample_rate * duration_sec)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        samples = []
        for i in range(num_samples):
            # Generate a voice-like tone with harmonics
            sample = int(
                3000 * math.sin(2 * math.pi * frequency * i / sample_rate)
                + 1500 * math.sin(2 * math.pi * frequency * 2 * i / sample_rate)
                + 750 * math.sin(2 * math.pi * frequency * 3 * i / sample_rate)
            )
            samples.append(struct.pack("<h", max(-32768, min(32767, sample))))
        wf.writeframes(b"".join(samples))
    return buf.getvalue()


def _print_header(text: str) -> None:
    print(f"\n{CYAN}{H_LINE * 60}{RESET}")
    print(f"{CYAN}  {BOLD}{text}{RESET}")
    print(f"{CYAN}{H_LINE * 60}{RESET}")


def _print_stage(stage: str, status: str, duration_ms: float = 0, detail: str = "") -> None:
    status_icon = STATUS_OK if status == "ok" else STATUS_WARN if status == "skipped" else STATUS_FAIL
    color = GREEN if status == "ok" else YELLOW if status == "skipped" else RED
    duration_str = f"  [{duration_ms:.0f}ms]" if duration_ms > 0 else ""
    detail_str = f"  {detail}" if detail else ""
    print(f"  {status_icon}  {color}{stage:<20}{RESET}{duration_str}{detail_str}")


def _generate_latency_report(results: dict[str, Any]) -> str:
    """Generate a formatted latency report from pipeline results."""
    lines = [
        f"\n{CYAN}{DASH * 50}{RESET}",
        f"{CYAN}  LATENCY REPORT{RESET}",
        f"{CYAN}{DASH * 50}{RESET}",
    ]

    stages = [
        ("STT", results.get("stt_ms", 0)),
        ("LLM", results.get("llm_ms", 0)),
        ("TTS", results.get("tts_ms", 0)),
    ]

    total = sum(ms for _, ms in stages)

    for name, ms in stages:
        bar_len = max(1, int(ms / max(total, 1) * 30))
        bar = BAR * bar_len
        lines.append(f"  {name:<6} {ms:>8.0f}ms  {bar}")

    lines.append(f"  {DASH * 40}")
    lines.append(f"  {'TOTAL':<6} {total:>8.0f}ms")

    if results.get("transcription"):
        lines.append(f"\n  {CYAN}Transcription:{RESET} {results['transcription'][:100]}")
    if results.get("response"):
        lines.append(f"  {CYAN}LLM Response:{RESET} {results['response'][:100]}")
    if results.get("tts_bytes", 0) > 0:
        lines.append(f"  {CYAN}TTS Audio:{RESET} {results['tts_bytes']} bytes")

    lines.append(f"{CYAN}{DASH * 50}{RESET}\n")
    return "\n".join(lines)


async def run_pipeline(
    stt_provider: str = "whisper",
    llm_provider: str = "ollama",
    tts_provider: str = "kokoro",
    language: str = "en",
    use_backend_api: bool = True,
    backend_url: str = "http://localhost:8000",
) -> dict[str, Any]:
    """Run the full AI pipeline (STT → LLM → TTS) and measure latencies.

    Args:
        stt_provider: STT provider name ('whisper' or 'deepgram').
        llm_provider: LLM provider name ('ollama' or 'openai').
        tts_provider: TTS provider name ('kokoro' or 'elevenlabs').
        language: Language code.
        use_backend_api: If True, use HTTP API; if False, import directly.
        backend_url: Backend URL for HTTP mode.

    Returns:
        Dict with all latency measurements and results.
    """
    results: dict[str, Any] = {
        "stt_ms": 0,
        "llm_ms": 0,
        "tts_ms": 0,
        "transcription": "",
        "response": "",
        "tts_bytes": 0,
        "errors": [],
        "status": "incomplete",
    }

    # Generate test audio
    test_audio = _generate_test_wav(2.0)
    test_prompt = "Hello, I'd like to know more about your product. Can you tell me what features you offer?"
    _print_stage("INPUT", "ok", detail=f"Test audio: {len(test_audio)} bytes, Prompt: '{test_prompt[:60]}...'")

    if use_backend_api:
        # ── HTTP API Mode ──────────────────────────────────────────
        import base64
        import json
        import urllib.request

        audio_b64 = base64.b64encode(test_audio).decode("utf-8")

        # Step 1: STT
        _print_stage("STT", "running")
        stt_start = 0.0
        try:
            stt_payload = json.dumps({"audio_base64": audio_b64, "language": language}).encode("utf-8")
            req = urllib.request.Request(
                f"{backend_url}/voice/transcribe",
                data=stt_payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            stt_start = time.time()
            with urllib.request.urlopen(req, timeout=60) as resp:
                stt_data = json.loads(resp.read().decode("utf-8"))
            results["stt_ms"] = (time.time() - stt_start) * 1000
            results["transcription"] = stt_data.get("text", "")
            _print_stage("STT", "ok", results["stt_ms"], f"'{results['transcription'][:80]}'")
        except Exception as e:
            if stt_start > 0:
                results["stt_ms"] = (time.time() - stt_start) * 1000
            results["errors"].append(f"STT failed: {e}")
            _print_stage("STT", "error", results["stt_ms"], str(e)[:80])

        # Step 2: LLM
        if results["transcription"]:
            _print_stage("LLM", "running")
            llm_start = 0.0
            try:
                llm_payload = json.dumps({
                    "messages": [{"role": "user", "content": results["transcription"]}],
                    "temperature": 0.7,
                    "max_tokens": 150,
                }).encode("utf-8")
                req = urllib.request.Request(
                    f"{backend_url}/voice/complete",
                    data=llm_payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                llm_start = time.time()
                with urllib.request.urlopen(req, timeout=120) as resp:
                    llm_data = json.loads(resp.read().decode("utf-8"))
                results["llm_ms"] = (time.time() - llm_start) * 1000
                results["response"] = llm_data.get("content", "")
                _print_stage("LLM", "ok", results["llm_ms"], f"'{results['response'][:80]}'")
            except Exception as e:
                if llm_start > 0:
                    results["llm_ms"] = (time.time() - llm_start) * 1000
                results["errors"].append(f"LLM failed: {e}")
                _print_stage("LLM", "error", results["llm_ms"], str(e)[:80])

        # Step 3: TTS
        if results["response"]:
            _print_stage("TTS", "running")
            tts_start = 0.0
            try:
                tts_payload = json.dumps({"text": results["response"], "language": language}).encode("utf-8")
                req = urllib.request.Request(
                    f"{backend_url}/voice/synthesize",
                    data=tts_payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                tts_start = time.time()
                with urllib.request.urlopen(req, timeout=30) as resp:
                    tts_data = json.loads(resp.read().decode("utf-8"))
                results["tts_ms"] = (time.time() - tts_start) * 1000
                audio_b64 = tts_data.get("audio_base64", "")
                results["tts_bytes"] = len(base64.b64decode(audio_b64)) if audio_b64 else 0
                _print_stage("TTS", "ok", results["tts_ms"], f"{results['tts_bytes']} bytes")
            except Exception as e:
                if tts_start > 0:
                    results["tts_ms"] = (time.time() - tts_start) * 1000
                results["errors"].append(f"TTS failed: {e}")
                _print_stage("TTS", "error", results["tts_ms"], str(e)[:80])

    else:
        # ── Direct Import Mode ─────────────────────────────────────
        # Add backend to path
        backend_dir = __file__.rsplit("/", 2)[0] if "/" in __file__ else "."
        sys.path.insert(0, backend_dir)

        try:
            # Register providers using the same function as the backend
            # This avoids duplicating the registration logic
            from app.main import register_providers
            register_providers()

            from app.voice import get_voice_pipeline
            pipeline = get_voice_pipeline()
        except Exception as e:
            results["errors"].append(f"Failed to import pipeline: {e}")
            results["status"] = "error"
            return results

        # Step 1: STT
        _print_stage("STT", "running")
        stt_start = 0.0
        try:
            stt_start = time.time()
            transcription = await asyncio.wait_for(
                pipeline.stt.transcribe(test_audio, language=language),
                timeout=60,
            )
            results["stt_ms"] = (time.time() - stt_start) * 1000
            results["transcription"] = transcription or "(silence/empty)"
            _print_stage("STT", "ok", results["stt_ms"], f"'{results['transcription'][:80]}'")
        except Exception as e:
            if stt_start > 0:
                results["stt_ms"] = (time.time() - stt_start) * 1000
            results["errors"].append(f"STT failed: {e}")
            _print_stage("STT", "error", results["stt_ms"], str(e)[:80])

        # Use a realistic test prompt instead of transcription
        if not results["transcription"] or results["transcription"] == "(silence/empty)":
            results["transcription"] = test_prompt
            _print_stage("LLM INPUT", "ok", detail=f"Using test prompt: '{test_prompt[:60]}...'")

        # Step 2: LLM
        if results["transcription"]:
            _print_stage("LLM", "running")
            llm_start = 0.0
            try:
                messages = pipeline.build_messages(
                    results["transcription"],
                    system_prompt=(
                        "You are a friendly and professional AI sales assistant. "
                        "Keep responses concise and conversational. "
                        "Respond in under 3 sentences."
                    ),
                )
                llm_start = time.time()
                response = await asyncio.wait_for(
                    pipeline.llm.complete(messages, max_tokens=150, temperature=0.7),
                    timeout=120,
                )
                results["llm_ms"] = (time.time() - llm_start) * 1000
                results["response"] = response
                _print_stage("LLM", "ok", results["llm_ms"], f"'{results['response'][:80]}'")
            except Exception as e:
                if llm_start > 0:
                    results["llm_ms"] = (time.time() - llm_start) * 1000
                results["errors"].append(f"LLM failed: {e}")
                _print_stage("LLM", "error", results["llm_ms"], str(e)[:80])

        # Step 3: TTS
        if results["response"]:
            _print_stage("TTS", "running")
            tts_start = 0.0
            try:
                tts_start = time.time()
                audio = await asyncio.wait_for(
                    pipeline.synthesize_response(
                        results["response"],
                        language=language,
                    ),
                    timeout=30,
                )
                results["tts_ms"] = (time.time() - tts_start) * 1000
                results["tts_bytes"] = len(audio) if audio else 0
                _print_stage("TTS", "ok", results["tts_ms"], f"{results['tts_bytes']} bytes")
            except Exception as e:
                if tts_start > 0:
                    results["tts_ms"] = (time.time() - tts_start) * 1000
                results["errors"].append(f"TTS failed: {e}")
                _print_stage("TTS", "error", results["tts_ms"], str(e)[:80])

    # Generate report
    print(_generate_latency_report(results))

    results["status"] = "ok" if not results["errors"] else "degraded"
    return results


async def run_all(
    mode: str = "api",
    stt: str = "whisper",
    llm: str = "ollama",
    tts: str = "kokoro",
    backend_url: str = "http://localhost:8000",
) -> None:
    """Run the dry run in the specified mode."""
    print(f"\n{CYAN}{TL}{H_LINE * 47}{TR}{RESET}")
    print(f"{CYAN}{V_LINE}  AI Sales Agent — Live Call Dry Run{RESET}")
    print(f"{CYAN}{BL}{H_LINE * 47}{BR}{RESET}")
    print(f"  {BOLD}Date:{RESET}      {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  {BOLD}Pipeline:{RESET}  {stt} {ARROW} {llm} {ARROW} {tts}")
    print(f"  {BOLD}Mode:{RESET}      {'HTTP API' if mode == 'api' else 'Direct import'}")
    print(f"  {BOLD}Backend:{RESET}   {backend_url if mode == 'api' else 'local import'}")

    if mode == "all":
        # Run API mode first
        _print_header("Mode 1: HTTP API (via backend)")
        api_results = await run_pipeline(
            stt_provider=stt,
            llm_provider=llm,
            tts_provider=tts,
            use_backend_api=True,
            backend_url=backend_url,
        )

        # Then direct mode
        _print_header("Mode 2: Direct Import (no backend needed)")
        direct_results = await run_pipeline(
            stt_provider=stt,
            llm_provider=llm,
            tts_provider=tts,
            use_backend_api=False,
        )

        # Compare
        _print_header("Comparison")
        print(f"  {'Metric':<20} {'API Mode':>12} {'Direct':>12}")
        print(f"  {DASH * 44}")
        print(f"  {'STT (ms)':<20} {api_results.get('stt_ms', 0):>12.0f} {direct_results.get('stt_ms', 0):>12.0f}")
        print(f"  {'LLM (ms)':<20} {api_results.get('llm_ms', 0):>12.0f} {direct_results.get('llm_ms', 0):>12.0f}")
        print(f"  {'TTS (ms)':<20} {api_results.get('tts_ms', 0):>12.0f} {direct_results.get('tts_ms', 0):>12.0f}")
    else:
        use_api = mode == "api"
        await run_pipeline(
            stt_provider=stt,
            llm_provider=llm,
            tts_provider=tts,
            use_backend_api=use_api,
            backend_url=backend_url,
        )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="AI Sales Agent — Live Call Dry Run",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run via backend API (default):
  python scripts/live_call_dry_run.py

  # Run via direct import (no backend needed):
  python scripts/live_call_dry_run.py --mode direct

  # Run both modes and compare:
  python scripts/live_call_dry_run.py --mode all

  # Use a different backend:
  python scripts/live_call_dry_run.py --backend http://192.168.1.100:8000
        """,
    )
    parser.add_argument(
        "--mode",
        choices=["api", "direct", "all"],
        default="api",
        help="Run mode: api (via backend HTTP), direct (import providers directly), all (both)",
    )
    parser.add_argument(
        "--backend",
        default="http://localhost:8000",
        help="Backend URL for API mode (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--stt",
        default="whisper",
        help="STT provider (default: whisper)",
    )
    parser.add_argument(
        "--llm",
        default="ollama",
        help="LLM provider (default: ollama)",
    )
    parser.add_argument(
        "--tts",
        default="kokoro",
        help="TTS provider (default: kokoro)",
    )
    parser.add_argument(
        "--language",
        default="en",
        help="Language code (default: en)",
    )

    args = parser.parse_args()

    asyncio.run(run_all(
        mode=args.mode,
        stt=args.stt,
        llm=args.llm,
        tts=args.tts,
        backend_url=args.backend,
    ))
