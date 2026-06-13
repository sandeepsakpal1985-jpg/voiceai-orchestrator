"""
Application Configuration — Loaded from environment variables with sensible defaults.

Provides provider-independent settings for STT, LLM, and TTS providers.
All values are read from environment variables at instantiation time.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    def __init__(self) -> None:
        # ── App ──
        self.APP_NAME: str = os.getenv("APP_NAME", "AI Sales Agent")
        self.APP_VERSION: str = os.getenv("APP_VERSION", "1.0.0")
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
            "postgresql://agent:agent@localhost:5432/ai_sales_agent",
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
        self.OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")

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

        # ── Audio ──
        self.AUDIO_FOLDER: str = os.getenv("AUDIO_FOLDER", "data/audio")
        self.SAMPLE_RATE: int = int(os.getenv("SAMPLE_RATE", "16000"))
        self.NUM_CHANNELS: int = int(os.getenv("NUM_CHANNELS", "1"))

        # ── Auth ──
        self.AUTH_SECRET: str = os.getenv("AUTH_SECRET", "")
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
        self.AUDIO_CACHE_DIR: str = os.getenv("AUDIO_CACHE_DIR", "data/audio/cache")
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

        # ── LiveKit ──
        self.LIVEKIT_SERVER_URL: str = os.getenv("LIVEKIT_SERVER_URL", "ws://localhost:7880")
        self.LIVEKIT_API_KEY: str = os.getenv("LIVEKIT_API_KEY", "devkey")
        self.LIVEKIT_API_SECRET: str = os.getenv("LIVEKIT_API_SECRET", "devsecret")
        self.LIVEKIT_ROOM_PREFIX: str = os.getenv("LIVEKIT_ROOM_PREFIX", "salesai-")
        self.LIVEKIT_ENABLED: bool = (
            os.getenv("LIVEKIT_ENABLED", "false").lower() == "true"
        )

        # ── Embeddings ──
        self.EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

        # ── GPU / Hardware ──
        self.CUDA_VISIBLE_DEVICES: str = os.getenv("CUDA_VISIBLE_DEVICES", "")
        self.TORCH_DEVICE: str = os.getenv("TORCH_DEVICE", "auto")
        self.WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "auto")
        self.WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "auto")
        self.WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "auto")
        self.EMBEDDING_DEVICE: str = os.getenv("EMBEDDING_DEVICE", "auto")

        # ── Twilio ──
        self.TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.TWILIO_PHONE_NUMBER: str = os.getenv("TWILIO_PHONE_NUMBER", "")

        # ── SIP / Telephony ──
        self.SIP_ENABLED: bool = os.getenv("SIP_ENABLED", "true").lower() == "true"
        self.SIP_SERVER_ADDRESS: str = os.getenv("SIP_SERVER_ADDRESS", "0.0.0.0")
        self.SIP_PORT: int = int(os.getenv("SIP_PORT", "5060"))
        self.SIP_ROOM_PREFIX: str = os.getenv("SIP_ROOM_PREFIX", "sip-")

        # ── Subscription ──
        self.ENFORCE_SUBSCRIPTIONS: bool = (
            os.getenv("ENFORCE_SUBSCRIPTIONS", "false").lower() == "true"
        )

        # ── FreeSWITCH ──
        self.FREESWITCH_BRIDGE_ENABLED: bool = (
            os.getenv("FREESWITCH_BRIDGE_ENABLED", "false").lower() == "true"
        )
        self.FREESWITCH_ESL_HOST: str = os.getenv("FREESWITCH_ESL_HOST", "127.0.0.1")
        self.FREESWITCH_ESL_PORT: int = int(os.getenv("FREESWITCH_ESL_PORT", "8021"))
        self.FREESWITCH_ESL_PASSWORD: str = os.getenv("FREESWITCH_ESL_PASSWORD", "ClueCon")
        self.FREESWITCH_ESL_TIMEOUT: int = int(os.getenv("FREESWITCH_ESL_TIMEOUT", "10"))
        self.FREESWITCH_AUDIO_DIR: str = os.getenv(
            "FREESWITCH_AUDIO_DIR", "tmp_fs_audio"
        )
        self.FREESWITCH_RECORD_TIMEOUT: int = int(
            os.getenv("FREESWITCH_RECORD_TIMEOUT", "30")
        )
        self.FREESWITCH_MAX_CALL_DURATION: int = int(
            os.getenv("FREESWITCH_MAX_CALL_DURATION", "600")
        )
        self.FREESWITCH_MAX_TURNS: int = int(
            os.getenv("FREESWITCH_MAX_TURNS", "50")
        )
        self.FREESWITCH_GREETING: str = os.getenv(
            "FREESWITCH_GREETING",
            "Hello! Thank you for calling. This is your AI sales assistant. "
            "How can I help you today?",
        )
        self.FREESWITCH_LLM_TIMEOUT: int = int(
            os.getenv("FREESWITCH_LLM_TIMEOUT", "15")
        )
        self.FREESWITCH_BRIDGE_RECONNECT_DELAY: int = int(
            os.getenv("FREESWITCH_BRIDGE_RECONNECT_DELAY", "5")
        )
        self.FREESWITCH_BRIDGE_MAX_RETRIES: int = int(
            os.getenv("FREESWITCH_BRIDGE_MAX_RETRIES", "10")
        )


_settings_instance: Settings | None = None


def get_settings() -> Settings:
    """Get the global Settings singleton."""
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance


def reload_settings() -> Settings:
    """Re-read all settings from environment variables (for testing)."""
    global _settings_instance
    _settings_instance = Settings()
    import sys
    this_mod = sys.modules.get(__name__)
    if this_mod is not None:
        this_mod.settings = _settings_instance
    return _settings_instance


settings = get_settings()
