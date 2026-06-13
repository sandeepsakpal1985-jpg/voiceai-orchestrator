"""
AI Sales Agent — FastAPI Application Entry Point

Provider-independent AI voice agent for sales calls.
Supports hot-swappable STT, LLM, and TTS providers.
"""

import asyncio
import logging
import os
import sys
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.providers import get_default_registry, reset_default_registry
from app.providers.gpu import detect_gpu_config
from app.routers import health_router, conversations_router, voice_router, calls_router, ws_voice_router, twilio_router, agents_router, metrics_router, recordings_router
from app.services.persistence import get_persistence as get_persistence_store
from app.services.latency_tracker import get_latency_tracker
from app.services.warmup import run_warmup

# Ensure project root is on sys.path for telephony module import
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

logging.basicConfig(level=logging.DEBUG if settings.DEBUG else logging.INFO, format="%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s")
logger = logging.getLogger("ai_sales_agent")

_gpu_config = detect_gpu_config()


def register_providers():
    """Register all available providers in the default registry."""
    registry = get_default_registry()

    # STT: Whisper (faster-whisper)
    try:
        from app.providers.stt import WhisperSTTProvider
        whisper_device = _gpu_config.recommended_device if settings.WHISPER_DEVICE == "auto" else settings.WHISPER_DEVICE
        whisper_compute = _gpu_config.recommended_compute_type if settings.WHISPER_COMPUTE_TYPE == "auto" else settings.WHISPER_COMPUTE_TYPE
        whisper_model = _gpu_config.recommended_whisper_model if settings.WHISPER_MODEL_SIZE == "auto" else settings.WHISPER_MODEL_SIZE
        registry.register_stt("whisper", WhisperSTTProvider(model_size=whisper_model, device=whisper_device, compute_type=whisper_compute, cpu_threads=settings.WHISPER_CPU_THREADS))
        logger.info("Registered STT: whisper (%s, %s)", whisper_model, whisper_device)
    except Exception as e:
        logger.warning("Failed to register Whisper: %s", e)

    # STT: Deepgram (optional cloud)
    if settings.DEEPGRAM_API_KEY:
        try:
            from app.providers.stt import DeepgramSTTProvider
            registry.register_stt("deepgram", DeepgramSTTProvider(api_key=settings.DEEPGRAM_API_KEY))
            logger.info("Registered STT: deepgram")
        except Exception as e:
            logger.warning("Failed to register Deepgram: %s", e)

    # LLM: Ollama (local)
    try:
        from app.providers.llm import OllamaLLMProvider
        registry.register_llm("ollama", OllamaLLMProvider(base_url=settings.OLLAMA_BASE_URL, model=settings.OLLAMA_MODEL))
        logger.info("Registered LLM: ollama (%s)", settings.OLLAMA_MODEL)
    except Exception as e:
        logger.warning("Failed to register Ollama: %s", e)

    # LLM: OpenAI (optional cloud)
    if settings.OPENAI_API_KEY:
        try:
            from app.providers.llm import OpenAILLMProvider
            registry.register_llm("openai", OpenAILLMProvider(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL, model=settings.OPENAI_MODEL))
            logger.info("Registered LLM: openai (%s)", settings.OPENAI_MODEL)
        except Exception as e:
            logger.warning("Failed to register OpenAI: %s", e)

    # LLM: Gemini (optional cloud)
    if settings.GEMINI_API_KEY:
        try:
            from app.providers.llm import GeminiLLMProvider
            registry.register_llm("gemini", GeminiLLMProvider(api_key=settings.GEMINI_API_KEY, model=settings.GEMINI_MODEL))
            logger.info("Registered LLM: gemini (%s)", settings.GEMINI_MODEL)
        except Exception as e:
            logger.warning("Failed to register Gemini: %s", e)

    # LLM: OpenRouter (optional cloud)
    if settings.OPENROUTER_API_KEY:
        try:
            from app.providers.llm import OpenRouterLLMProvider
            registry.register_llm("openrouter", OpenRouterLLMProvider(api_key=settings.OPENROUTER_API_KEY, base_url=settings.OPENROUTER_BASE_URL, model=settings.OPENROUTER_MODEL))
            logger.info("Registered LLM: openrouter (%s)", settings.OPENROUTER_MODEL)
        except Exception as e:
            logger.warning("Failed to register OpenRouter: %s", e)

    # TTS: Kokoro (lightweight local)
    try:
        from app.providers.tts import KokoroTTSProvider
        registry.register_tts("kokoro", KokoroTTSProvider(voice=settings.KOKORO_VOICE))
        logger.info("Registered TTS: kokoro")
    except Exception as e:
        logger.debug("Kokoro not available: %s", e)

    # TTS: ElevenLabs (optional cloud)
    if settings.ELEVENLABS_API_KEY:
        try:
            from app.providers.tts import ElevenLabsTTSProvider
            registry.register_tts("elevenlabs", ElevenLabsTTSProvider(api_key=settings.ELEVENLABS_API_KEY))
            logger.info("Registered TTS: elevenlabs")
        except Exception as e:
            logger.warning("Failed to register ElevenLabs: %s", e)

    logger.info("Active providers — STT: %s, LLM: %s, TTS: %s", settings.STT_PROVIDER, settings.LLM_PROVIDER, settings.TTS_PROVIDER)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown events."""
    logger.info("%s v%s starting...", settings.APP_NAME, settings.APP_VERSION)
    register_providers()
    from app.services.conversation import get_conversation_service
    conv_service = get_conversation_service()
    await conv_service.start_cleanup_task()

    if settings.AUDIO_CACHE_ENABLED:
        try:
            from app.services.audio_cache import get_audio_cache_service
            cache = get_audio_cache_service()
            await cache.initialize()
            if settings.AUDIO_CACHE_WARM:
                try:
                    tts_provider = get_default_registry().get_tts(settings.TTS_PROVIDER)
                    asyncio.create_task(cache.warm(tts_provider=tts_provider, language=settings.DEFAULT_LANGUAGE, voice_id=settings.AUDIO_CACHE_WARM_VOICE))
                except Exception:
                    pass
            logger.info("Audio cache initialized")
        except Exception as e:
            logger.warning("Failed to initialize audio cache: %s", e)

    # Initialize Redis-backed persistence
    try:
        store = await get_persistence_store()
        logger.info("Persistence initialized: %s", await store.ping())
    except Exception as e:
        logger.warning("Failed to initialize persistence: %s", e)

    # Initialize LiveKit if enabled
    if settings.LIVEKIT_ENABLED:
        try:
            from app.livekit import get_room_manager
            room_manager = get_room_manager()
            await room_manager.initialize()
            logger.info("LiveKit room manager initialized")
        except Exception as e:
            logger.warning("Failed to initialize LiveKit: %s", e)

    # Initialize SIP dispatch if enabled
    if settings.SIP_ENABLED:
        try:
            from app.livekit.sip_dispatch import initialize_sip_dispatch
            await initialize_sip_dispatch()
        except Exception as e:
            logger.warning("Failed to initialize SIP: %s", e)

    # Initialize FreeSWITCH bridge if enabled
    if settings.FREESWITCH_BRIDGE_ENABLED:
        try:
            from telephony.freeswitch import get_freeswitch_bridge
            bridge = get_freeswitch_bridge()
            await bridge.start()
            logger.info("FreeSWITCH bridge started")
        except Exception as e:
            logger.warning("Failed to start FreeSWITCH bridge: %s", e)

    # ── Initialize call recording service ──
    try:
        from app.services.recording import get_recording_service
        recording = get_recording_service()
        await recording.initialize()
        logger.info("Recording service initialized")
    except Exception as e:
        logger.warning("Failed to initialize recording service: %s", e)

    # ── Run provider warmup to eliminate cold-start latency ──
    try:
        asyncio.create_task(run_warmup(whisper=True, ollama=True, kokoro=True))
        logger.info("Warmup task created — providers will warm in background")
    except Exception as e:
        logger.warning("Warmup task creation failed: %s", e)

    logger.info("Startup complete. Listening on %s:%s", settings.HOST, settings.PORT)
    yield

    logger.info("Shutting down...")
    await conv_service.stop_cleanup_task()
    if settings.AUDIO_CACHE_ENABLED:
        try:
            from app.services.audio_cache import get_audio_cache_service
            cache = get_audio_cache_service()
            if cache.is_initialized:
                await cache.close()
        except Exception:
            pass
    # Close persistence
    try:
        store = await get_persistence_store()
        if hasattr(store, 'close'):
            await store.close()
    except Exception:
        pass

    # Stop FreeSWITCH bridge if enabled
    if settings.FREESWITCH_BRIDGE_ENABLED:
        try:
            from telephony.freeswitch import get_freeswitch_bridge
            bridge = get_freeswitch_bridge()
            await bridge.stop()
            logger.info("FreeSWITCH bridge stopped")
        except Exception:
            pass

    reset_default_registry()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Provider-independent AI sales agent API. Supports interchangeable STT, LLM, and TTS providers for sales calls.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ── Rate Limiting Middleware (token bucket per IP) ──
from app.middleware.rate_limit import RateLimitMiddleware
app.add_middleware(RateLimitMiddleware)
logger.info("Rate limit middleware enabled (%d req/%ds)",
            settings.RATE_LIMIT_REQUESTS, settings.RATE_LIMIT_WINDOW_SEC)

# ── Static Files (Frontend Dashboard + Voice Chat) ──
from fastapi.staticfiles import StaticFiles
import os
_frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend")
if os.path.isdir(_frontend_dir):
    app.mount("/frontend", StaticFiles(directory=_frontend_dir, html=True), name="frontend")
    logger.info("Frontend static files mounted at /frontend (dir: %s)", _frontend_dir)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time.time()
    try:
        response = await call_next(request)
        return response
    finally:
        duration_ms = (time.time() - start) * 1000
        logger.debug("%s %s -> %d (%dms)", request.method, request.url.path, getattr(response, 'status_code', 500), duration_ms)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"error": "Internal server error", "detail": str(exc) if settings.DEBUG else "An unexpected error occurred."})


app.include_router(health_router)
app.include_router(conversations_router)
app.include_router(voice_router)
app.include_router(calls_router)
app.include_router(ws_voice_router)
app.include_router(twilio_router)
app.include_router(agents_router)
app.include_router(metrics_router)
app.include_router(recordings_router)

logger.info("Rate limit middleware: %d req/%ds", settings.RATE_LIMIT_REQUESTS, settings.RATE_LIMIT_WINDOW_SEC)
logger.info("Auth middleware: %s", "set" if settings.AUTH_SECRET else "NOT SET — dev mode")

# ── FreeSWITCH HTTP Router (optional) ────────────────────────────
try:
    from telephony.freeswitch.http_api import router as freeswitch_router

    app.include_router(freeswitch_router)
    logger.info("FreeSWITCH HTTP API router mounted at /fs/*")
except ImportError:
    logger.debug("FreeSWITCH telephony module not available — HTTP API not mounted")
except Exception:
    logger.exception("Error mounting FreeSWITCH HTTP API router")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
