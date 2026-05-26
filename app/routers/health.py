"""
Health & Provider Routes — System health and provider management.
"""

import time
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.models.schemas import (
    HealthResponse,
    ProviderInfo,
    ProviderListResponse,
    ProviderSwitchRequest,
)
from app.providers import get_default_registry

router = APIRouter(tags=["System"])

_start_time = time.time()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    registry = get_default_registry()
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        uptime_seconds=time.time() - _start_time,
        providers=registry.all_providers(),
    )


@router.get("/providers", response_model=ProviderListResponse)
async def list_providers():
    """List all registered providers with their capabilities."""
    registry = get_default_registry()
    stt_providers = []
    llm_providers = []
    tts_providers = []

    for name in registry.list_stt_providers():
        try:
            provider = registry.get_stt(name)
            stt_providers.append(
                ProviderInfo(
                    name=name,
                    supports_streaming=provider.supports_streaming,
                    is_available=True,
                )
            )
        except Exception:
            stt_providers.append(
                ProviderInfo(name=name, supports_streaming=False, is_available=False)
            )

    for name in registry.list_llm_providers():
        try:
            provider = registry.get_llm(name)
            llm_providers.append(
                ProviderInfo(
                    name=name,
                    supports_streaming=provider.supports_streaming,
                    supports_tool_calling=provider.supports_tool_calling,
                    is_available=True,
                )
            )
        except Exception:
            llm_providers.append(
                ProviderInfo(
                    name=name,
                    supports_streaming=False,
                    supports_tool_calling=False,
                    is_available=False,
                )
            )

    for name in registry.list_tts_providers():
        try:
            provider = registry.get_tts(name)
            tts_providers.append(
                ProviderInfo(
                    name=name,
                    supports_streaming=provider.supports_streaming,
                    supported_voices=provider.supported_voices,
                    is_available=True,
                )
            )
        except Exception:
            tts_providers.append(
                ProviderInfo(
                    name=name,
                    supports_streaming=False,
                    is_available=False,
                )
            )

    return ProviderListResponse(
        stt_providers=stt_providers,
        llm_providers=llm_providers,
        tts_providers=tts_providers,
        active_stt=settings.STT_PROVIDER,
        active_llm=settings.LLM_PROVIDER,
        active_tts=settings.TTS_PROVIDER,
    )


@router.post("/providers/switch")
async def switch_providers(request: ProviderSwitchRequest):
    """Switch active providers at runtime.

    This allows changing providers without restarting the server.
    """
    registry = get_default_registry()

    if request.stt:
        available = registry.list_stt_providers()
        if request.stt not in available:
            raise HTTPException(
                status_code=400,
                detail=f"STT provider '{request.stt}' not available. Available: {available}",
            )
        # Update the active STT provider in settings
        import app.config as config_module

        config_module.settings.STT_PROVIDER = request.stt

    if request.llm:
        available = registry.list_llm_providers()
        if request.llm not in available:
            raise HTTPException(
                status_code=400,
                detail=f"LLM provider '{request.llm}' not available. Available: {available}",
            )
        import app.config as config_module

        config_module.settings.LLM_PROVIDER = request.llm

    if request.tts:
        available = registry.list_tts_providers()
        if request.tts not in available:
            raise HTTPException(
                status_code=400,
                detail=f"TTS provider '{request.tts}' not available. Available: {available}",
            )
        import app.config as config_module

        config_module.settings.TTS_PROVIDER = request.tts

    return {
        "message": "Providers updated",
        "active_stt": settings.STT_PROVIDER,
        "active_llm": settings.LLM_PROVIDER,
        "active_tts": settings.TTS_PROVIDER,
    }
