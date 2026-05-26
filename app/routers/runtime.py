"""
Runtime Status API — Exposes live system status for the dashboard.

This bridges Priority 2 (dashboard ↔ runtime connection) by providing
endpoints that surface the actual running state of:
  - LiveKit rooms and participants
  - Active SIP/PSTN calls
  - Registered provider health
  - Voice pipeline status

Endpoints:
    GET /runtime/livekit    — LiveKit room status
    GET /runtime/sip        — Active SIP call status
    GET /runtime/providers  — Registered provider health
    GET /runtime/status     — Aggregated runtime status (all of the above)
"""

import asyncio
import logging
import time
from fastapi import APIRouter

from app.config import settings

# Lazy imports to avoid circular dependency at module load time.
# These are resolved at call time when the app is fully initialized.
_livekit_imported = False
_providers_imported = False
_sip_imported = False

def _get_room_manager():
    global _livekit_imported
    if not _livekit_imported:
        from app.livekit import get_room_manager as _get_rm  # noqa: PLC0415
        globals()["_room_manager_func"] = _get_rm
        _livekit_imported = True
    return globals().get("_room_manager_func", lambda: None)()

def _get_registry():
    global _providers_imported
    if not _providers_imported:
        from app.providers import get_default_registry as _get_reg  # noqa: PLC0415
        globals()["_registry_func"] = _get_reg
        _providers_imported = True
    return globals().get("_registry_func", lambda: None)()

def _get_sip_calls():
    global _sip_imported
    if not _sip_imported:
        from app.livekit.sip_dispatch import get_active_sip_calls as _get_calls  # noqa: PLC0415
        globals()["_sip_calls_func"] = _get_calls
        _sip_imported = True
    return globals().get("_sip_calls_func", lambda: [])()

logger = logging.getLogger("voiceai.routers.runtime")

router = APIRouter(prefix="/runtime", tags=["Runtime Status"])


@router.get("/livekit")
async def get_livekit_status():
    """Get LiveKit room status.

    Returns active rooms, participant counts, and connection info.
    If LiveKit is disabled or not initialized, returns a degraded status.
    """
    try:
        if settings.LIVEKIT_ENABLED:
            room_manager = _get_room_manager()
            active_rooms = (
                room_manager.get_active_rooms()
                if room_manager and hasattr(room_manager, "get_active_rooms")
                else []
            )

            return {
                "enabled": True,
                "url": settings.LIVEKIT_URL,
                "connected": True,
                "active_rooms": len(active_rooms),
                "rooms": [
                    {
                        "name": room.get("name", "unknown"),
                        "participants": room.get("participants", 0),
                        "created_at": room.get("created_at", ""),
                    }
                    for room in (active_rooms or [])
                ],
            }
        else:
            return {
                "enabled": False,
                "url": settings.LIVEKIT_URL,
                "connected": False,
                "active_rooms": 0,
                "rooms": [],
            }
    except Exception as e:
        logger.warning("Failed to query LiveKit status: %s", e)
        return {
            "enabled": settings.LIVEKIT_ENABLED,
            "url": settings.LIVEKIT_URL,
            "connected": False,
            "active_rooms": 0,
            "rooms": [],
            "error": str(e),
        }


@router.get("/sip")
async def get_sip_status():
    """Get active SIP/PSTN call status.

    Returns the count and details of active SIP calls
    routed through LiveKit SIP from Twilio Elastic Trunks.
    """
    try:
        active_calls = _get_sip_calls()

        return {
            "enabled": settings.SIP_ENABLED,
            "server_address": settings.SIP_SERVER_ADDRESS,
            "sip_port": settings.SIP_PORT,
            "trunk_host": settings.SIP_TRUNK_HOST or "(not configured)",
            "active_calls": len(active_calls),
            "calls": active_calls,
        }
    except Exception as e:
        logger.warning("Failed to query SIP status: %s", e)
        return {
            "enabled": settings.SIP_ENABLED,
            "active_calls": 0,
            "calls": [],
            "error": str(e),
        }


@router.get("/providers")
async def get_provider_status():
    """Get provider registration health.

    Returns all registered STT, LLM, and TTS providers
    along with the currently active selection for each category.
    """
    try:
        registry = _get_registry()

        stt_providers = registry.list_stt_providers()
        llm_providers = registry.list_llm_providers()
        tts_providers = registry.list_tts_providers()

        return {
            "active": {
                "stt": settings.STT_PROVIDER,
                "llm": settings.LLM_PROVIDER,
                "tts": settings.TTS_PROVIDER,
            },
            "registered": {
                "stt": [
                    {
                        "name": name,
                        "is_active": name == settings.STT_PROVIDER,
                    }
                    for name in stt_providers
                ],
                "llm": [
                    {
                        "name": name,
                        "is_active": name == settings.LLM_PROVIDER,
                    }
                    for name in llm_providers
                ],
                "tts": [
                    {
                        "name": name,
                        "is_active": name == settings.TTS_PROVIDER,
                    }
                    for name in tts_providers
                ],
            },
        }
    except Exception as e:
        logger.warning("Failed to query provider status: %s", e)
        return {
            "active": {
                "stt": settings.STT_PROVIDER,
                "llm": settings.LLM_PROVIDER,
                "tts": settings.TTS_PROVIDER,
            },
            "registered": {"stt": [], "llm": [], "tts": []},
            "error": str(e),
        }


@router.get("/status")
async def get_aggregated_status():
    """Get the full aggregated runtime status.

    Combines LiveKit, SIP, and provider status into a single response
    for efficient dashboard polling.
    """
    # Fetch all statuses in roughly parallel via gather
    import asyncio

    livekit, sip, providers = await asyncio.gather(
        get_livekit_status(),
        get_sip_status(),
        get_provider_status(),
    )

    # Determine overall health
    errors = []
    for source, data in [("livekit", livekit), ("sip", sip), ("providers", providers)]:
        if "error" in data:
            errors.append({"source": source, "error": data["error"]})

    overall_health = "healthy" if not errors else "degraded"

    return {
        "status": overall_health,
        "timestamp": time.time(),
        "uptime_seconds": int(time.time()),
        "errors": errors if errors else None,
        "livekit": livekit,
        "sip": sip,
        "providers": providers,
    }
