"""
Application Configuration — Loaded from environment variables with sensible defaults.

All provider settings are configurable at runtime to support
provider switching without code changes.
"""

import os
from typing import Literal


class Settings:
    """Application settings loaded from environment variables.

    All values are read from os.environ at instantiation time.
    Use reload_settings() to re-read after changing env vars (for tests).
    """

    def __init__(self) -> None:
        # ── App ──
        self.APP_NAME: str = os.getenv("APP_NAME", "VoiceAI Orchestrator")
        self.APP_VERSION: str = os.getenv("APP_VERSION", "0.1.0")
        self.DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
        self.HOST: str = os.getenv("HOST", "0.0.0.0")
        self.PORT: int = int(os.getenv("PORT", "8000"))

        # ── CORS ──
        self.CORS_ORIGINS: list[str] = os.getenv(
            "CORS_ORIGINS", "http://localhost:3000,http://localhost:3001"
        ).split(",")

        # ── Database ──
        self.DATABASE_URL: str = os.getenv(
            "DATABASE_URL",
            "postgresql://voiceai:voiceai@localhost:5432/voiceai",
        )

        # ── STT Provider ──
        self.STT_PROVIDER: str = os.getenv("STT_PROVIDER", "whisper")
        self.WHISPER_CPU_THREADS: int = int(os.getenv("WHISPER_CPU_THREADS", "4"))
        self.DEEPGRAM_API_KEY: str = os.getenv("DEEPGRAM_API_KEY", "")

        # ── LLM Provider ──
        self.LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama")
        self.OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
        self.OPENAI_BASE_URL: str = os.getenv(
            "OPENAI_BASE_URL", "https://api.openai.com/v1"
        )
        self.OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
        self.GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        self.OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
        self.OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "qwen/qwen-2.5-72b-instruct")
        self.OPENROUTER_BASE_URL: str = os.getenv(
            "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
        )
        self.LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.7"))
        self.LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "1024"))
        self.OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

        # ── TTS Provider ──
        self.TTS_PROVIDER: str = os.getenv("TTS_PROVIDER", "kokoro")
        self.ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")
        self.KOKORO_MODEL_PATH: str = os.getenv("KOKORO_MODEL_PATH", "")
        self.KOKORO_VOICE: str = os.getenv("KOKORO_VOICE", "default")
        self.OPENVOICE_MODEL_PATH: str = os.getenv("OPENVOICE_MODEL_PATH", "")
        self.DEFAULT_VOICE_ID: str = os.getenv("DEFAULT_VOICE_ID", "af_bella")
        self.DEFAULT_LANGUAGE: str = os.getenv("DEFAULT_LANGUAGE", "en")
        self.DEFAULT_SPEAKING_RATE: float = float(os.getenv("DEFAULT_SPEAKING_RATE", "1.0"))
        self.DEFAULT_PITCH: float = float(os.getenv("DEFAULT_PITCH", "0.0"))
        self.XTTS_MODEL_NAME: str = os.getenv("XTTS_MODEL_NAME", "tts_models/multilingual/multi-dataset/xtts_v2")
        self.XTTS_SPEAKER_SAMPLE: str = os.getenv("XTTS_SPEAKER_SAMPLE", "")

        # ── Audio ──
        self.AUDIO_FOLDER: str = os.getenv("AUDIO_FOLDER", "audio")
        self.SAMPLE_RATE: int = int(os.getenv("SAMPLE_RATE", "16000"))
        self.NUM_CHANNELS: int = int(os.getenv("NUM_CHANNELS", "1"))

        # ── Auth ──
        self.AUTH_SECRET: str = os.getenv("AUTH_SECRET", "")
        self.AUTH_URL: str = os.getenv("AUTH_URL", "http://localhost:3000")
        self.JWT_ALGORITHM: str = "HS256"
        self.JWT_EXPIRATION_HOURS: int = 24

        # ── Rate Limiting ──
        self.RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
        self.RATE_LIMIT_WINDOW_SEC: int = int(os.getenv("RATE_LIMIT_WINDOW_SEC", "60"))

        # ── Redis ──
        self.REDIS_URL: str = os.getenv("REDIS_URL", "")

        # ── Audio Cache ──
        self.AUDIO_CACHE_ENABLED: bool = (
            os.getenv("AUDIO_CACHE_ENABLED", "true").lower() == "true"
        )
        self.AUDIO_CACHE_DIR: str = os.getenv("AUDIO_CACHE_DIR", "audio/cache")
        self.AUDIO_CACHE_TTL: int = int(os.getenv("AUDIO_CACHE_TTL", "3600"))
        self.AUDIO_CACHE_MAX_MEMORY: int = int(os.getenv("AUDIO_CACHE_MAX_MEMORY", "500"))
        self.AUDIO_CACHE_WARM: bool = (
            os.getenv("AUDIO_CACHE_WARM", "true").lower() == "true"
        )
        self.AUDIO_CACHE_WARM_VOICE: str = os.getenv("AUDIO_CACHE_WARM_VOICE", "af_bella")

        # ── Adaptive Conversation ──
        self.ADAPTIVE_CONVERSATION_ENABLED: bool = (
            os.getenv("ADAPTIVE_CONVERSATION_ENABLED", "true").lower() == "true"
        )

        # ── Advanced Modules ──
        self.INTERRUPT_DETECTION_ENABLED: bool = (
            os.getenv("INTERRUPT_DETECTION_ENABLED", "true").lower() == "true"
        )
        self.ADVANCED_STATE_ENGINE_ENABLED: bool = (
            os.getenv("ADVANCED_STATE_ENGINE_ENABLED", "true").lower() == "true"
        )
        self.ADAPTIVE_PLAYBACK_ENABLED: bool = (
            os.getenv("ADAPTIVE_PLAYBACK_ENABLED", "true").lower() == "true"
        )
        self.SEMANTIC_ANALYSIS_ENABLED: bool = (
            os.getenv("SEMANTIC_ANALYSIS_ENABLED", "false").lower() == "true"
        )
        self.INTERRUPT_VOLUME_THRESHOLD: float = float(
            os.getenv("INTERRUPT_VOLUME_THRESHOLD", "0.15")
        )

        # ── LiveKit ──
        self.LIVEKIT_SERVER_URL: str = os.getenv("LIVEKIT_SERVER_URL", "ws://localhost:7880")
        self.LIVEKIT_URL: str = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
        self.LIVEKIT_API_KEY: str = os.getenv("LIVEKIT_API_KEY", "devkey")
        self.LIVEKIT_API_SECRET: str = os.getenv("LIVEKIT_API_SECRET", "devsecret")
        self.LIVEKIT_ROOM_PREFIX: str = os.getenv("LIVEKIT_ROOM_PREFIX", "voiceai-")
        self.LIVEKIT_AGENT_NAME: str = os.getenv("LIVEKIT_AGENT_NAME", "VoiceAI Agent")
        self.LIVEKIT_WORKER_PORT: int = int(os.getenv("LIVEKIT_WORKER_PORT", "8001"))
        self.LIVEKIT_WORKER_LOG_LEVEL: str = os.getenv("LIVEKIT_WORKER_LOG_LEVEL", "info")
        self.LIVEKIT_ENABLED: bool = (
            os.getenv("LIVEKIT_ENABLED", "true").lower() == "true"
        )

        # ── Embeddings ──
        self.EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

        # ── GPU / Hardware ──
        self.CUDA_VISIBLE_DEVICES: str = os.getenv("CUDA_VISIBLE_DEVICES", "")
        self.TORCH_DEVICE: str = os.getenv("TORCH_DEVICE", "auto")
        self.WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "auto")
        self.WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "auto")
        self.WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "auto")
        self.XTTS_DEVICE: str = os.getenv("XTTS_DEVICE", "auto")
        self.EMBEDDING_DEVICE: str = os.getenv("EMBEDDING_DEVICE", "auto")

        # ── SIP / Telephony ──
        self.SIP_ENABLED: bool = (
            os.getenv("SIP_ENABLED", "true").lower() == "true"
        )
        self.SIP_SERVER_ADDRESS: str = os.getenv("SIP_SERVER_ADDRESS", "0.0.0.0")
        self.SIP_PORT: int = int(os.getenv("SIP_PORT", "5060"))
        self.SIP_DISPATCH_DESTINATION: str = os.getenv(
            "SIP_DISPATCH_DESTINATION", "twilio-sip-trunk"
        )
        self.SIP_ROOM_PREFIX: str = os.getenv("SIP_ROOM_PREFIX", "sip-")
        self.SIP_TRUNK_HOST: str = os.getenv("SIP_TRUNK_HOST", "")

        # ── Dashboard ──
        self.DASHBOARD_URL: str = os.getenv("DASHBOARD_URL", "http://localhost:3000")

        # ── Subscription ──
        self.ENFORCE_SUBSCRIPTIONS: bool = (
            os.getenv("ENFORCE_SUBSCRIPTIONS", "false").lower() == "true"
        )


_settings_instance: Settings | None = None


def get_settings() -> Settings:
    """Get the global Settings singleton, creating it if needed."""
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance


def reload_settings() -> Settings:
    """Re-read all settings from environment variables (for testing).

    Call this after changing os.environ to refresh the settings singleton.
    Also updates the module-level `settings` name so `from app.config import settings`
    sees the freshest values.
    """
    global _settings_instance
    _settings_instance = Settings()
    # Update the module-level reference for code that imported 'settings' directly
    import sys
    this_mod = sys.modules.get(__name__)
    if this_mod is not None:
        this_mod.settings = _settings_instance
    return _settings_instance


# Backward-compatible module-level singleton
settings = get_settings()
