"""
Application Configuration — Loaded from environment variables with sensible defaults.

All provider settings are configurable at runtime to support
provider switching without code changes.
"""

import os
from typing import Literal


class Settings:
    """Application settings loaded from environment variables."""

    # ── App ──
    APP_NAME: str = os.getenv("APP_NAME", "VoiceAI Orchestrator")
    APP_VERSION: str = os.getenv("APP_VERSION", "0.1.0")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # ── CORS ──
    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://localhost:3001"
    ).split(",")

    # ── Database ──
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://voiceai:voiceai@localhost:5432/voiceai",
    )

    # ── STT Provider ──
    STT_PROVIDER: str = os.getenv("STT_PROVIDER", "whisper")
    # WHISPER_DEVICE, WHISPER_COMPUTE_TYPE, WHISPER_MODEL_SIZE are in the GPU/Hardware section
    WHISPER_CPU_THREADS: int = int(os.getenv("WHISPER_CPU_THREADS", "4"))
    DEEPGRAM_API_KEY: str = os.getenv("DEEPGRAM_API_KEY", "")

    # ── LLM Provider ──
    # Default: local Ollama (Qwen, Mistral, Llama, Gemma).
    # Optional: openai, gemini, openrouter
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv(
        "OPENAI_BASE_URL", "https://api.openai.com/v1"
    )
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # Gemini (optional)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    # OpenRouter (optional)
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "qwen/qwen-2.5-72b-instruct")
    OPENROUTER_BASE_URL: str = os.getenv(
        "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
    )
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.7"))
    LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "1024"))
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

    # ── TTS Provider ──
    # Default: kokoro (lightweight local TTS, ~82M params).
    # Priority order: kokoro → openvoice → xtts → elevenlabs
    TTS_PROVIDER: str = os.getenv("TTS_PROVIDER", "kokoro")
    ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")

    # Kokoro (lightweight local TTS)
    KOKORO_MODEL_PATH: str = os.getenv("KOKORO_MODEL_PATH", "")
    KOKORO_VOICE: str = os.getenv("KOKORO_VOICE", "default")

    # OpenVoice (voice cloning TTS)
    OPENVOICE_MODEL_PATH: str = os.getenv("OPENVOICE_MODEL_PATH", "")
    # Default voice ID for TTS (Kokoro: 'af_bella', XTTS: 'default')
    DEFAULT_VOICE_ID: str = os.getenv(
        "DEFAULT_VOICE_ID", "af_bella"
    )
    DEFAULT_LANGUAGE: str = os.getenv("DEFAULT_LANGUAGE", "en")
    DEFAULT_SPEAKING_RATE: float = float(os.getenv("DEFAULT_SPEAKING_RATE", "1.0"))
    DEFAULT_PITCH: float = float(os.getenv("DEFAULT_PITCH", "0.0"))

    # XTTS (local TTS inference)
    XTTS_MODEL_NAME: str = os.getenv(
        "XTTS_MODEL_NAME", "tts_models/multilingual/multi-dataset/xtts_v2"
    )
    # XTTS_DEVICE is in the GPU/Hardware section
    XTTS_SPEAKER_SAMPLE: str = os.getenv("XTTS_SPEAKER_SAMPLE", "")

    # ── Audio ──
    AUDIO_FOLDER: str = os.getenv("AUDIO_FOLDER", "audio")
    SAMPLE_RATE: int = int(os.getenv("SAMPLE_RATE", "16000"))
    NUM_CHANNELS: int = int(os.getenv("NUM_CHANNELS", "1"))

    # ── Auth ──
    AUTH_SECRET: str = os.getenv("AUTH_SECRET", "")
    AUTH_URL: str = os.getenv("AUTH_URL", "http://localhost:3000")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24

    # ── Rate Limiting ──
    RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
    RATE_LIMIT_WINDOW_SEC: int = int(os.getenv("RATE_LIMIT_WINDOW_SEC", "60"))

    # ── Redis (optional, for rate limiting + data persistence) ──
    REDIS_URL: str = os.getenv("REDIS_URL", "")

    # ── Adaptive Conversation ──
    ADAPTIVE_CONVERSATION_ENABLED: bool = (
        os.getenv("ADAPTIVE_CONVERSATION_ENABLED", "true").lower() == "true"
    )

    # ── Advanced Modules ──
    # These plug into the pipeline to add real-time barge-in detection,
    # adaptive playback pacing, conversation state machines, and semantic analysis.
    INTERRUPT_DETECTION_ENABLED: bool = (
        os.getenv("INTERRUPT_DETECTION_ENABLED", "true").lower() == "true"
    )
    ADVANCED_STATE_ENGINE_ENABLED: bool = (
        os.getenv("ADVANCED_STATE_ENGINE_ENABLED", "true").lower() == "true"
    )
    ADAPTIVE_PLAYBACK_ENABLED: bool = (
        os.getenv("ADAPTIVE_PLAYBACK_ENABLED", "true").lower() == "true"
    )
    SEMANTIC_ANALYSIS_ENABLED: bool = (
        os.getenv("SEMANTIC_ANALYSIS_ENABLED", "false").lower() == "true"
    )

    # Volume threshold for microphone-based interrupt detection (0.0 - 1.0)
    INTERRUPT_VOLUME_THRESHOLD: float = float(
        os.getenv("INTERRUPT_VOLUME_THRESHOLD", "0.15")
    )

    # ── LiveKit (realtime voice runtime) ──
    LIVEKIT_SERVER_URL: str = os.getenv("LIVEKIT_SERVER_URL", "ws://localhost:7880")
    LIVEKIT_URL: str = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
    LIVEKIT_API_KEY: str = os.getenv("LIVEKIT_API_KEY", "devkey")
    LIVEKIT_API_SECRET: str = os.getenv("LIVEKIT_API_SECRET", "devsecret")
    LIVEKIT_ROOM_PREFIX: str = os.getenv("LIVEKIT_ROOM_PREFIX", "voiceai-")
    LIVEKIT_AGENT_NAME: str = os.getenv("LIVEKIT_AGENT_NAME", "VoiceAI Agent")
    LIVEKIT_WORKER_PORT: int = int(os.getenv("LIVEKIT_WORKER_PORT", "8001"))
    LIVEKIT_WORKER_LOG_LEVEL: str = os.getenv("LIVEKIT_WORKER_LOG_LEVEL", "info")
    # LiveKit is the core realtime voice runtime
    LIVEKIT_ENABLED: bool = (
        os.getenv("LIVEKIT_ENABLED", "true").lower() == "true"
    )

    # ── Local Embeddings (RAG + Memory) ──
    EMBEDDING_MODEL: str = os.getenv(
        "EMBEDDING_MODEL", "all-MiniLM-L6-v2"
    )
    # EMBEDDING_DEVICE is in the GPU/Hardware section

    # ── GPU / Hardware ──
    CUDA_VISIBLE_DEVICES: str = os.getenv("CUDA_VISIBLE_DEVICES", "")
    TORCH_DEVICE: str = os.getenv("TORCH_DEVICE", "auto")  # cpu, cuda, or auto
    WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "auto")  # cpu, cuda, or auto
    WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "auto")  # int8, float16, or auto
    WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "auto")  # tiny/base/small/medium/large-v3 or auto
    XTTS_DEVICE: str = os.getenv("XTTS_DEVICE", "auto")  # cpu, cuda, or auto
    EMBEDDING_DEVICE: str = os.getenv("EMBEDDING_DEVICE", "auto")  # cpu, cuda, or auto

    # ── SIP / Telephony (LiveKit SIP Integration) ──
    SIP_ENABLED: bool = (
        os.getenv("SIP_ENABLED", "true").lower() == "true"
    )
    SIP_SERVER_ADDRESS: str = os.getenv("SIP_SERVER_ADDRESS", "0.0.0.0")
    SIP_PORT: int = int(os.getenv("SIP_PORT", "5060"))
    SIP_DISPATCH_DESTINATION: str = os.getenv(
        "SIP_DISPATCH_DESTINATION", "twilio-sip-trunk"
    )
    SIP_ROOM_PREFIX: str = os.getenv("SIP_ROOM_PREFIX", "sip-")
    SIP_TRUNK_HOST: str = os.getenv("SIP_TRUNK_HOST", "")

    # ── Dashboard ──
    DASHBOARD_URL: str = os.getenv("DASHBOARD_URL", "http://localhost:3000")

    # ── Subscription Enforcement (SaaS feature — opt-in for self-hosted) ──
    # Disabled by default for self-hosted deployments.
    # Enable only if you need multi-tenant billing with plan limits.
    ENFORCE_SUBSCRIPTIONS: bool = (
        os.getenv("ENFORCE_SUBSCRIPTIONS", "false").lower() == "true"
    )


settings = Settings()
