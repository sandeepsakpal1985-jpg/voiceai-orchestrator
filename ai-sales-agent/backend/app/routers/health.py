"""
Health & Provider Routes — System health and provider management.
"""

import time
from fastapi import APIRouter, HTTPException

import asyncio
import time

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.models.schemas import HealthResponse, ProviderInfo, ProviderListResponse, ProviderSwitchRequest
from app.providers import get_default_registry
from app.voice import get_voice_pipeline

router = APIRouter(tags=["System"])
_start_time = time.time()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    registry = get_default_registry()
    return HealthResponse(status="ok", version=settings.APP_VERSION, uptime_seconds=time.time() - _start_time, providers=registry.all_providers())


@router.get("/health/stt")
async def health_stt():
    """Validate STT provider (Whisper) is registered and responsive.

    Generates a small test WAV and attempts actual transcription.
    Empty transcription is acceptable for noise input — the real validation
    is that the transcribe() call succeeds without error.
    """
    try:
        pipeline = get_voice_pipeline()
        stt = pipeline.stt
        provider_name = settings.STT_PROVIDER

        # Generate a tiny test WAV (0.3s of 440Hz tone)
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
            samples = [struct.pack("<h", int(4000 * math.sin(2 * math.pi * 440 * i / sample_rate))) for i in range(num_samples)]
            wf.writeframes(b"".join(samples))
        test_audio = buf.getvalue()

        # Real transcription attempt
        start = time.time()
        transcription = await stt.transcribe(test_audio, language="en")
        elapsed = (time.time() - start) * 1000

        return {
            "status": "ok",
            "provider": provider_name,
            "supports_streaming": stt.supports_streaming,
            "transcription_ms": round(elapsed, 0),
            "output_chars": len(transcription),
            "check": f"STT provider '{provider_name}' transcribed {len(test_audio)} bytes in {elapsed:.0f}ms",
        }
    except Exception as e:
        return {"status": "error", "provider": settings.STT_PROVIDER, "error": str(e)}


@router.get("/health/llm")
async def health_llm():
    """Validate LLM provider is registered and responsive with a quick prompt."""
    try:
        pipeline = get_voice_pipeline()
        llm = pipeline.llm
        provider_name = settings.LLM_PROVIDER

        # Quick validation: send a minimal prompt and check we get a response
        try:
            response = await asyncio.wait_for(
                llm.complete([{"role": "user", "content": "Say OK"}], max_tokens=10),
                timeout=30.0,
            )
            llm_ok = "ok" in response.lower().strip()
        except (asyncio.TimeoutError, Exception) as e:
            return {
                "status": "degraded",
                "provider": provider_name,
                "supports_streaming": llm.supports_streaming,
                "supports_tool_calling": llm.supports_tool_calling,
                "check": "Registered but not responsive (timeout)",
                "error": str(e),
            }

        return {
            "status": "ok",
            "provider": provider_name,
            "supports_streaming": llm.supports_streaming,
            "supports_tool_calling": llm.supports_tool_calling,
            "check": "LLM responded correctly" if llm_ok else "LLM responded but unexpected output",
            "response": response.strip(),
        }
    except Exception as e:
        return {"status": "error", "provider": settings.LLM_PROVIDER, "error": str(e)}


@router.get("/health/tts")
async def health_tts():
    """Validate TTS provider is registered and can synthesize audio."""
    try:
        pipeline = get_voice_pipeline()
        tts = pipeline.tts
        provider_name = settings.TTS_PROVIDER

        # Quick validation: synthesize a short phrase
        try:
            audio = await asyncio.wait_for(
                pipeline.synthesize_response(
                    "Hello, this is a test.",
                    voice_id=settings.DEFAULT_VOICE_ID,
                    language=settings.DEFAULT_LANGUAGE,
                ),
                timeout=10.0,
            )
            tts_ok = audio is not None and len(audio) > 100
        except (asyncio.TimeoutError, Exception) as e:
            return {
                "status": "degraded",
                "provider": provider_name,
                "supports_streaming": tts.supports_streaming,
                "supported_voices": tts.supported_voices,
                "check": "Registered but synthesis timed out",
                "error": str(e),
            }

        return {
            "status": "ok" if tts_ok else "degraded",
            "provider": provider_name,
            "supports_streaming": tts.supports_streaming,
            "supported_voices": tts.supported_voices,
            "audio_bytes": len(audio) if audio else 0,
            "check": "TTS synthesized audio correctly" if tts_ok else "TTS returned empty audio",
        }
    except Exception as e:
        return {"status": "error", "provider": settings.TTS_PROVIDER, "error": str(e)}


@router.get("/health/freeswitch")
async def health_freeswitch():
    """Validate FreeSWITCH ESL bridge connection status."""
    try:
        from telephony.freeswitch import get_freeswitch_bridge
        bridge = get_freeswitch_bridge()
        return {
            "status": "ok" if bridge.is_running else "stopped",
            "esl_connected": bridge.esl_connected,
            "bridge_running": bridge.is_running,
            "active_calls": bridge.active_call_count,
            "stats": await bridge.get_stats() if bridge.is_running else {},
        }
    except ImportError:
        return {"status": "unavailable", "error": "FreeSWITCH telephony module not installed"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.get("/providers", response_model=ProviderListResponse)
async def list_providers():
    registry = get_default_registry()
    stt_providers, llm_providers, tts_providers = [], [], []
    for name in registry.list_stt_providers():
        try:
            p = registry.get_stt(name)
            stt_providers.append(ProviderInfo(name=name, supports_streaming=p.supports_streaming, is_available=True))
        except Exception:
            stt_providers.append(ProviderInfo(name=name, supports_streaming=False, is_available=False))
    for name in registry.list_llm_providers():
        try:
            p = registry.get_llm(name)
            llm_providers.append(ProviderInfo(name=name, supports_streaming=p.supports_streaming, supports_tool_calling=p.supports_tool_calling, is_available=True))
        except Exception:
            llm_providers.append(ProviderInfo(name=name, supports_streaming=False, supports_tool_calling=False, is_available=False))
    for name in registry.list_tts_providers():
        try:
            p = registry.get_tts(name)
            tts_providers.append(ProviderInfo(name=name, supports_streaming=p.supports_streaming, supported_voices=p.supported_voices, is_available=True))
        except Exception:
            tts_providers.append(ProviderInfo(name=name, supports_streaming=False, is_available=False))
    return ProviderListResponse(stt_providers=stt_providers, llm_providers=llm_providers, tts_providers=tts_providers, active_stt=settings.STT_PROVIDER, active_llm=settings.LLM_PROVIDER, active_tts=settings.TTS_PROVIDER)


@router.post("/providers/switch")
async def switch_providers(request: ProviderSwitchRequest):
    registry = get_default_registry()
    if request.stt:
        available = registry.list_stt_providers()
        if request.stt not in available:
            raise HTTPException(status_code=400, detail=f"STT provider '{request.stt}' not available")
        import app.config as config_module
        config_module.settings.STT_PROVIDER = request.stt
    if request.llm:
        available = registry.list_llm_providers()
        if request.llm not in available:
            raise HTTPException(status_code=400, detail=f"LLM provider '{request.llm}' not available")
        import app.config as config_module
        config_module.settings.LLM_PROVIDER = request.llm
    if request.tts:
        available = registry.list_tts_providers()
        if request.tts not in available:
            raise HTTPException(status_code=400, detail=f"TTS provider '{request.tts}' not available")
        import app.config as config_module
        config_module.settings.TTS_PROVIDER = request.tts
    return {"message": "Providers updated", "active_stt": settings.STT_PROVIDER, "active_llm": settings.LLM_PROVIDER, "active_tts": settings.TTS_PROVIDER}
