"""
Warmup System — Pre-loads AI models at startup to eliminate cold-start latency.

Current bottlenecks:
  - Whisper: Model loaded lazily on first transcribe (~6s cold start on CPU)
  - Ollama: Model must be paged into memory (~10s cold start)
  - Kokoro: Model loaded lazily on first synthesize (~1s cold start)

This module sends tiny warmup prompts to each provider during the
lifespan startup so first-call latency matches subsequent calls.
"""

import asyncio
import io
import logging
import math
import struct
import time
import wave
from typing import Any

from app.config import settings
from app.providers import get_default_registry

logger = logging.getLogger("ai_sales_agent.warmup")

# ── Warmup Configuration ──────────────────────────────────────────

WARMUP_TEXT_SHORT = "Hello."
WARMUP_SYSTEM_PROMPT = "You are a helpful assistant."
WARMUP_USER_PROMPT = "Say OK"

# Timeouts per provider (seconds)
WHISPER_WARMUP_TIMEOUT = 60.0
OLLAMA_WARMUP_TIMEOUT = 120.0
KOKORO_WARMUP_TIMEOUT = 30.0


def _generate_test_wav(duration_sec: float = 0.3, frequency: float = 440.0) -> bytes:
    """Generate a short sine-wave WAV file for Whisper warmup."""
    sample_rate = 16000
    num_samples = int(sample_rate * duration_sec)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        samples = [
            struct.pack("<h", int(4000 * math.sin(2 * math.pi * frequency * i / sample_rate)))
            for i in range(num_samples)
        ]
        wf.writeframes(b"".join(samples))
    return buf.getvalue()


async def warmup_whisper() -> dict[str, Any]:
    """Pre-load the Whisper model by running a tiny transcription."""
    result = {"provider": "whisper", "status": "skipped", "duration_ms": 0, "error": ""}

    try:
        registry = get_default_registry()
        stt_providers = registry.list_stt_providers()
        if "whisper" not in stt_providers:
            result["error"] = "Whisper not registered"
            return result

        stt = registry.get_stt("whisper")
        test_wav = _generate_test_wav(0.3)

        logger.info("WARMUP[whisper] Starting Whisper model warmup...")
        start = time.time()
        try:
            result_text = await asyncio.wait_for(
                stt.transcribe(test_wav, language="en"),
                timeout=WHISPER_WARMUP_TIMEOUT,
            )
            elapsed = (time.time() - start) * 1000
            result["status"] = "ok"
            result["duration_ms"] = round(elapsed, 0)
            result["output_chars"] = len(result_text)
            logger.info("WARMUP[whisper] Complete in %.0fms (output: '%s')", elapsed, result_text[:50])
        except asyncio.TimeoutError:
            elapsed = (time.time() - start) * 1000
            result["status"] = "timeout"
            result["duration_ms"] = round(elapsed, 0)
            result["error"] = f"Timed out after {WHISPER_WARMUP_TIMEOUT}s"
            logger.warning("WARMUP[whisper] Timed out after %.0fms", elapsed)
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            result["status"] = "error"
            result["duration_ms"] = round(elapsed, 0)
            result["error"] = str(e)
            logger.warning("WARMUP[whisper] Error: %s", e)
    except Exception as e:
        result["error"] = str(e)
        logger.warning("WARMUP[whisper] Failed: %s", e)

    return result


async def warmup_ollama() -> dict[str, Any]:
    """Pre-load the Ollama model by sending a tiny warmup prompt."""
    result = {"provider": "ollama", "status": "skipped", "duration_ms": 0, "error": ""}

    try:
        registry = get_default_registry()
        llm_providers = registry.list_llm_providers()
        if "ollama" not in llm_providers:
            result["error"] = "Ollama not registered"
            return result

        llm = registry.get_llm("ollama")
        messages = [
            {"role": "system", "content": WARMUP_SYSTEM_PROMPT},
            {"role": "user", "content": WARMUP_USER_PROMPT},
        ]

        logger.info("WARMUP[ollama] Starting Ollama model warmup (%s)...", settings.OLLAMA_MODEL)
        start = time.time()
        try:
            response = await asyncio.wait_for(
                llm.complete(messages, max_tokens=5, temperature=0.1),
                timeout=OLLAMA_WARMUP_TIMEOUT,
            )
            elapsed = (time.time() - start) * 1000
            result["status"] = "ok"
            result["duration_ms"] = round(elapsed, 0)
            result["response"] = response.strip()[:50]
            logger.info("WARMUP[ollama] Complete in %.0fms (response: '%s')", elapsed, response.strip()[:50])
        except asyncio.TimeoutError:
            elapsed = (time.time() - start) * 1000
            result["status"] = "timeout"
            result["duration_ms"] = round(elapsed, 0)
            result["error"] = f"Timed out after {OLLAMA_WARMUP_TIMEOUT}s"
            logger.warning("WARMUP[ollama] Timed out after %.0fms", elapsed)
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            result["status"] = "error"
            result["duration_ms"] = round(elapsed, 0)
            result["error"] = str(e)
            logger.warning("WARMUP[ollama] Error: %s", e)
    except Exception as e:
        result["error"] = str(e)
        logger.warning("WARMUP[ollama] Failed: %s", e)

    return result


async def warmup_kokoro() -> dict[str, Any]:
    """Pre-load the Kokoro TTS model by synthesizing a tiny phrase."""
    result = {"provider": "kokoro", "status": "skipped", "duration_ms": 0, "error": ""}

    try:
        registry = get_default_registry()
        tts_providers = registry.list_tts_providers()
        if "kokoro" not in tts_providers:
            result["error"] = "Kokoro not registered"
            return result

        tts = registry.get_tts("kokoro")

        logger.info("WARMUP[kokoro] Starting Kokoro TTS warmup...")
        start = time.time()
        try:
            audio = await asyncio.wait_for(
                tts.synthesize(
                    text=WARMUP_TEXT_SHORT,
                    voice_id=settings.DEFAULT_VOICE_ID,
                    language=settings.DEFAULT_LANGUAGE,
                ),
                timeout=KOKORO_WARMUP_TIMEOUT,
            )
            elapsed = (time.time() - start) * 1000
            audio_ok = audio is not None and len(audio) > 100
            result["status"] = "ok" if audio_ok else "degraded"
            result["duration_ms"] = round(elapsed, 0)
            result["audio_bytes"] = len(audio) if audio else 0
            logger.info("WARMUP[kokoro] Complete in %.0fms (%d bytes)", elapsed, len(audio) if audio else 0)
        except asyncio.TimeoutError:
            elapsed = (time.time() - start) * 1000
            result["status"] = "timeout"
            result["duration_ms"] = round(elapsed, 0)
            result["error"] = f"Timed out after {KOKORO_WARMUP_TIMEOUT}s"
            logger.warning("WARMUP[kokoro] Timed out after %.0fms", elapsed)
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            result["status"] = "error"
            result["duration_ms"] = round(elapsed, 0)
            result["error"] = str(e)
            logger.warning("WARMUP[kokoro] Error: %s", e)
    except Exception as e:
        result["error"] = str(e)
        logger.warning("WARMUP[kokoro] Failed: %s", e)

    return result


async def run_warmup(
    whisper: bool = True,
    ollama: bool = True,
    kokoro: bool = True,
    sequential: bool = False,
) -> dict[str, dict[str, Any]]:
    """Run all warmup tasks concurrently (or sequentially) and return results.

    Args:
        whisper: Whether to warm up Whisper STT.
        ollama: Whether to warm up Ollama LLM.
        kokoro: Whether to warm up Kokoro TTS.
        sequential: If True, run one at a time (less memory pressure).

    Returns:
        Dict of provider name -> result dict.
    """
    logger.info("WARMUP Starting provider warmup (sequential=%s)...", sequential)

    tasks: list[tuple[str, Any]] = []
    if whisper:
        tasks.append(("whisper", warmup_whisper()))
    if ollama:
        tasks.append(("ollama", warmup_ollama()))
    if kokoro:
        tasks.append(("kokoro", warmup_kokoro()))

    results: dict[str, dict[str, Any]] = {}

    if sequential:
        for name, coro in tasks:
            try:
                results[name] = await coro
            except Exception as e:
                results[name] = {"provider": name, "status": "error", "error": str(e)}
    else:
        try:
            outcomes = await asyncio.gather(
                *[coro for _, coro in tasks],
                return_exceptions=True,
            )
            for (name, _), outcome in zip(tasks, outcomes):
                if isinstance(outcome, Exception):
                    results[name] = {"provider": name, "status": "error", "error": str(outcome)}
                elif isinstance(outcome, dict):
                    results[name] = outcome
                else:
                    results[name] = {"provider": name, "status": "error", "error": str(outcome)}
        except Exception as e:
            logger.error("WARMUP Gather failed: %s", e)
            for name, _ in tasks:
                if name not in results:
                    results[name] = {"provider": name, "status": "error", "error": str(e)}

    # Summary
    ok_count = sum(1 for r in results.values() if r.get("status") == "ok")
    total = len(results)
    logger.info(
        "WARMUP Complete: %d/%d providers warmed successfully",
        ok_count, total,
    )
    for name, r in results.items():
        status_icon = "✅" if r.get("status") == "ok" else "⚠️" if r.get("status") == "skipped" else "❌"
        logger.info("WARMUP %s %s: %s (%.0fms)", status_icon, name, r.get("status", "?"), r.get("duration_ms", 0))

    return results
