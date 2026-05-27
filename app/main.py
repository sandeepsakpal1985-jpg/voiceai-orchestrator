"""
VoiceAI Orchestrator — FastAPI Application Entry Point

Provider-independent AI voice agent backend.
Supports hot-swappable STT, LLM, and TTS providers.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.providers import get_default_registry, reset_default_registry
from app.providers.gpu import detect_gpu_config
from app.routers import (
    health_router,
    conversations_router,
    voice_router,
    calls_router,
    ws_voice_router,
    twilio_router,
    agents_router,
    knowledge_router,
    social_router,
    sip_router,
    runtime_router,
    voice_profiles_router,
    monitoring_router,
    languages_router,
)

# ── Logging Setup ───────────────────────────────────────────────────

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s",
)
logger = logging.getLogger("voiceai.orchestrator")

# ── GPU Detection ──────────────────────────────────────────────────
# Auto-detect GPU at startup to configure provider device settings.
# Respects explicit user overrides via TORCH_DEVICE / WHISPER_DEVICE env vars.
_gpu_config = detect_gpu_config()


# ── Provider Registration ──────────────────────────────────────────

def register_providers():
    """Register all available providers in the default registry.

    Registration order:
    1. Local-first providers (Whisper, Ollama, XTTS) — always registered
    2. Optional cloud providers — only if API keys are configured

    The active provider is selected via environment variables.
    """
    registry = get_default_registry()

    # ── STT Providers ──
    # Local-first: Whisper (faster-whisper)
    # Uses auto-detected GPU settings unless explicitly overridden.
    try:
        from app.providers.stt import WhisperSTTProvider

        whisper_device = (
            _gpu_config.recommended_device
            if settings.WHISPER_DEVICE == "auto"
            else settings.WHISPER_DEVICE
        )
        whisper_compute = (
            _gpu_config.recommended_compute_type
            if settings.WHISPER_COMPUTE_TYPE == "auto"
            else settings.WHISPER_COMPUTE_TYPE
        )
        whisper_model = (
            _gpu_config.recommended_whisper_model
            if settings.WHISPER_MODEL_SIZE == "auto"
            else settings.WHISPER_MODEL_SIZE
        )

        registry.register_stt(
            "whisper",
            WhisperSTTProvider(
                model_size=whisper_model,
                device=whisper_device,
                compute_type=whisper_compute,
                cpu_threads=settings.WHISPER_CPU_THREADS,
            ),
        )
        logger.info("Registered STT provider: whisper (%s, %s)",
                     whisper_model, whisper_device)
    except Exception as e:
        logger.warning("Failed to register Whisper STT provider: %s", e)

    # Optional: Deepgram (cloud STT fallback)
    if settings.DEEPGRAM_API_KEY:
        try:
            from app.providers.stt import DeepgramSTTProvider

            registry.register_stt(
                "deepgram",
                DeepgramSTTProvider(api_key=settings.DEEPGRAM_API_KEY),
            )
            logger.info("Registered STT provider: deepgram")
        except Exception as e:
            logger.warning("Failed to register Deepgram STT provider: %s", e)

    # ── LLM Providers ──
    # Local-first: Ollama (Qwen, Mistral, Llama, Gemma)
    try:
        from app.providers.llm import OllamaLLMProvider

        registry.register_llm(
            "ollama",
            OllamaLLMProvider(
                base_url=settings.OLLAMA_BASE_URL,
                model=settings.OLLAMA_MODEL,
            ),
        )
        logger.info("Registered LLM provider: ollama (%s)", settings.OLLAMA_MODEL)
    except Exception as e:
        logger.warning("Failed to register Ollama LLM provider: %s", e)

    # Optional: OpenAI-compatible API (requires API key)
    if settings.OPENAI_API_KEY:
        try:
            from app.providers.llm import OpenAILLMProvider

            registry.register_llm(
                "openai",
                OpenAILLMProvider(
                    api_key=settings.OPENAI_API_KEY,
                    base_url=settings.OPENAI_BASE_URL,
                    model=settings.OPENAI_MODEL,
                    default_temperature=settings.LLM_TEMPERATURE,
                    default_max_tokens=settings.LLM_MAX_TOKENS,
                ),
            )
            logger.info("Registered LLM provider: openai (%s)", settings.OPENAI_MODEL)
        except Exception as e:
            logger.warning("Failed to register OpenAI LLM provider: %s", e)

    # Optional: Gemini
    if settings.GEMINI_API_KEY:
        try:
            from app.providers.llm import GeminiLLMProvider

            registry.register_llm(
                "gemini",
                GeminiLLMProvider(
                    api_key=settings.GEMINI_API_KEY,
                    model=settings.GEMINI_MODEL,
                ),
            )
            logger.info("Registered LLM provider: gemini (%s)", settings.GEMINI_MODEL)
        except Exception as e:
            logger.warning("Failed to register Gemini LLM provider: %s", e)

    # Optional: OpenRouter
    if settings.OPENROUTER_API_KEY:
        try:
            from app.providers.llm import OpenRouterLLMProvider

            registry.register_llm(
                "openrouter",
                OpenRouterLLMProvider(
                    api_key=settings.OPENROUTER_API_KEY,
                    base_url=settings.OPENROUTER_BASE_URL,
                    model=settings.OPENROUTER_MODEL,
                ),
            )
            logger.info("Registered LLM provider: openrouter (%s)", settings.OPENROUTER_MODEL)
        except Exception as e:
            logger.warning("Failed to register OpenRouter LLM provider: %s", e)

    # ── TTS Providers ──
    # Priority order: kokoro → openvoice → xtts → elevenlabs
    # Local-first: Kokoro (lightweight TTS, ~82M params, CPU-friendly)
    try:
        from app.providers.tts import KokoroTTSProvider

        registry.register_tts(
            "kokoro",
            KokoroTTSProvider(
                voice=settings.KOKORO_VOICE,
            ),
        )
        logger.info("Registered TTS provider: kokoro")
    except Exception as e:
        logger.debug("Kokoro not available: %s", e)

    # Local: OpenVoice (voice cloning)
    try:
        from app.providers.tts import OpenVoiceTTSProvider

        registry.register_tts(
            "openvoice",
            OpenVoiceTTSProvider(
                model_path=settings.OPENVOICE_MODEL_PATH or None,
                device=settings.XTTS_DEVICE,  # Reuse device setting
            ),
        )
        logger.info("Registered TTS provider: openvoice")
    except Exception as e:
        logger.debug("OpenVoice not available: %s", e)

    # Local: XTTS (Coqui XTTS-v2, multi-language, heavier ~1.8GB)
    try:
        from app.providers.tts import XTTSTTSProvider

        xtts_device = (
            _gpu_config.recommended_device
            if settings.XTTS_DEVICE == "auto"
            else settings.XTTS_DEVICE
        )

        registry.register_tts(
            "xtts",
            XTTSTTSProvider(
                model_name=settings.XTTS_MODEL_NAME,
                device=xtts_device,
                speaker_sample=settings.XTTS_SPEAKER_SAMPLE or None,
            ),
        )
        logger.info("Registered TTS provider: xtts (%s)", xtts_device)
    except Exception as e:
        logger.warning("Failed to register XTTS TTS provider: %s", e)

    # Local: Qwen3-TTS (multimodal local TTS, ~6-8GB VRAM)
    try:
        from app.providers.tts import Qwen3TTSProvider

        registry.register_tts(
            "qwen3-tts",
            Qwen3TTSProvider(
                model_name="Qwen/Qwen3-TTS",
                device=settings.TORCH_DEVICE,
            ),
        )
        logger.info("Registered TTS provider: qwen3-tts")
    except Exception as e:
        logger.debug("Qwen3-TTS not available: %s", e)

    # Optional: ElevenLabs (cloud TTS)
    if settings.ELEVENLABS_API_KEY:
        try:
            from app.providers.tts import ElevenLabsTTSProvider

            registry.register_tts(
                "elevenlabs",
                ElevenLabsTTSProvider(api_key=settings.ELEVENLABS_API_KEY),
            )
            logger.info("Registered TTS provider: elevenlabs")
        except Exception as e:
            logger.warning("Failed to register ElevenLabs TTS provider: %s", e)

    # Log active providers
    logger.info("Active providers — STT: %s, LLM: %s, TTS: %s",
                settings.STT_PROVIDER, settings.LLM_PROVIDER, settings.TTS_PROVIDER)
    logger.info("All registered providers: %s", registry.all_providers())


def register_tools():
    """Register all tools with the global tool registry."""
    try:
        from app.tools.crm_tools import register_crm_tools
        register_crm_tools()
    except Exception as e:
        logger.warning("Failed to register CRM tools: %s", e)

    try:
        from app.tools.rag_tool import register_rag_tools
        register_rag_tools()
    except Exception as e:
        logger.warning("Failed to register RAG tools: %s", e)

    from app.tools import get_tool_registry
    registry = get_tool_registry()
    logger.info("Registered tools: %s", registry.list_tools())


# ── Audio Cache Warm ────────────────────────────────────────────────


async def _warm_audio_cache(cache) -> None:
    """Warm the audio cache with common phrases (runs as background task).

    Uses the currently active TTS provider to pre-synthesize common
    phrases like greetings, confirmations, and FAQs.
    """
    try:
        tts_provider = get_default_registry().get_tts(settings.TTS_PROVIDER)
        warmed = await cache.warm(
            tts_provider=tts_provider,
            language=settings.DEFAULT_LANGUAGE,
            voice_id=settings.AUDIO_CACHE_WARM_VOICE,
        )
        logger.info("Audio cache warm complete: %d phrases cached", warmed)
    except Exception as e:
        logger.warning("Audio cache warm skipped: %s", e)


# ── App Lifespan ────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown events."""
    logger.info("%s v%s starting...", settings.APP_NAME, settings.APP_VERSION)

    # Register all providers
    register_providers()

    # Register all tools (MCP, CRM, RAG)
    register_tools()

    # Initialize LiveKit room manager if enabled
    if settings.LIVEKIT_ENABLED:
        try:
            from app.livekit import get_room_manager

            room_manager = get_room_manager()
            await room_manager.initialize()
            logger.info("LiveKit room manager initialized")
        except Exception as e:
            logger.warning("Failed to initialize LiveKit: %s", e)

    # Initialize SIP dispatch (phone → LiveKit via SIP trunk)
    if settings.SIP_ENABLED:
        try:
            from app.livekit.sip_dispatch import initialize_sip_dispatch

            await initialize_sip_dispatch()
        except Exception as e:
            logger.warning("Failed to initialize SIP dispatch: %s", e)

    # Start background cleanup task for conversations
    from app.services.conversation import get_conversation_service

    conv_service = get_conversation_service()
    await conv_service.start_cleanup_task()

    # Initialize audio cache (TTS output cache for latency reduction)
    if settings.AUDIO_CACHE_ENABLED:
        try:
            from app.services.audio_cache import get_audio_cache_service
            cache = get_audio_cache_service()
            await cache.initialize()

            # Warm cache with common phrases at startup (non-blocking background task)
            if settings.AUDIO_CACHE_WARM:
                asyncio.create_task(_warm_audio_cache(cache))

            logger.info("Audio cache initialized (dir=%s, ttl=%ds, max_memory=%d)",
                        settings.AUDIO_CACHE_DIR, settings.AUDIO_CACHE_TTL,
                        settings.AUDIO_CACHE_MAX_MEMORY)
        except Exception as e:
            logger.warning("Failed to initialize audio cache: %s", e)

    logger.info("Startup complete. Listening on %s:%s", settings.HOST, settings.PORT)
    yield

    # ── Shutdown ──
    logger.info("Shutting down...")

    # Stop cleanup task
    await conv_service.stop_cleanup_task()

    # Close all provider connections
    registry = get_default_registry()
    for llm_name in registry.list_llm_providers():
        try:
            provider = registry.get_llm(llm_name)
            if hasattr(provider, "close") and callable(provider.close):
                await provider.close()
                logger.debug("Closed LLM provider: %s", llm_name)
        except Exception as e:
            logger.warning("Error closing LLM provider '%s': %s", llm_name, e)

    # Close audio cache connections
    if settings.AUDIO_CACHE_ENABLED:
        try:
            from app.services.audio_cache import get_audio_cache_service
            cache = get_audio_cache_service()
            if cache.is_initialized:
                await cache.close()
                logger.info("Audio cache closed")
        except Exception as e:
            logger.warning("Error closing audio cache: %s", e)

    reset_default_registry()
    logger.info("Shutdown complete.")


# ── FastAPI App ─────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Provider-independent AI voice agent orchestration API. "
        "Supports interchangeable STT, LLM, and TTS providers "
        "for building production-grade voice AI applications."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


# ── Middleware ──────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Metrics Recording Middleware ────────────────────────────────────
# Records HTTP request metrics for the Prometheus /metrics endpoint.
# Runs on every request to capture count, duration, and status codes.

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    import time

    response = None
    start = time.time()
    try:
        response = await call_next(request)
        return response
    finally:
        duration_ms = (time.time() - start) * 1000
        status_code = response.status_code if response else 500
        try:
            from app.routers.monitoring import record_request
            record_request(
                method=request.method,
                path=request.url.path,
                status_code=status_code,
                duration_ms=duration_ms,
            )
        except Exception:
            pass


# ── Global Exception Handler ────────────────────────────────────────


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return a structured error response."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.DEBUG else "An unexpected error occurred.",
        },
    )


# ── Include Routers ────────────────────────────────────────────────

app.include_router(health_router)
app.include_router(conversations_router)
app.include_router(voice_router)
app.include_router(calls_router)
app.include_router(ws_voice_router)
app.include_router(twilio_router)
app.include_router(agents_router)
app.include_router(knowledge_router)
app.include_router(social_router)
app.include_router(sip_router)
app.include_router(runtime_router)
app.include_router(voice_profiles_router)
app.include_router(monitoring_router)
app.include_router(languages_router)

# ── Middleware: Rate Limiting (token bucket per IP) ──
from app.middleware.rate_limit import RateLimitMiddleware

app.add_middleware(RateLimitMiddleware)
logger.info("Rate limit middleware enabled (%d req/%ds)",
            settings.RATE_LIMIT_REQUESTS, settings.RATE_LIMIT_WINDOW_SEC)

# ── Middleware: Auth (JWT Bearer Token Validation) ──
from app.middleware.auth import AuthMiddleware

app.add_middleware(AuthMiddleware)
logger.info("Auth middleware enabled (AUTH_SECRET: %s)",
            "set" if settings.AUTH_SECRET else "NOT SET — dev mode")

# ── Middleware (Optional — Subscription Enforcement) ──
# Disabled by default for self-hosted deployments.
# Enable via ENFORCE_SUBSCRIPTIONS=true in .env
from app.middleware import SubscriptionEnforcementMiddleware

if settings.ENFORCE_SUBSCRIPTIONS:
    app.add_middleware(
        SubscriptionEnforcementMiddleware,
        exclude_paths=[
            "/health",
            "/docs",
            "/redoc",
            "/openapi.json",
            "/twilio/status",
        ],
    )
    logger.info("Subscription enforcement middleware enabled")
else:
    logger.info(
        "Subscription enforcement disabled (set ENFORCE_SUBSCRIPTIONS=true to enable)"
    )


# ── Main Entry Point ────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )
