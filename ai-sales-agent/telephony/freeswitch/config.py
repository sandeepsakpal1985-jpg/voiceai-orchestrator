"""
FreeSWITCH Configuration — Environment-based settings for the AI bridge.

All values are read from environment variables with sensible defaults
tailored for the AI voice agent integration.
"""

import os


class FreeSwitchSettings:
    """FreeSWITCH integration settings."""

    def __init__(self) -> None:
        # ── ESL Connection ──
        self.FREESWITCH_ESL_HOST: str = os.getenv("FREESWITCH_ESL_HOST", "127.0.0.1")
        self.FREESWITCH_ESL_PORT: int = int(os.getenv("FREESWITCH_ESL_PORT", "8021"))
        self.FREESWITCH_ESL_PASSWORD: str = os.getenv("FREESWITCH_ESL_PASSWORD", "ClueCon")
        self.FREESWITCH_ESL_TIMEOUT: int = int(os.getenv("FREESWITCH_ESL_TIMEOUT", "10"))

        # ── Audio ──
        self.FREESWITCH_AUDIO_DIR: str = os.getenv(
            "FREESWITCH_AUDIO_DIR", "tmp_fs_audio"
        )
        self.FREESWITCH_AUDIO_FORMAT: str = os.getenv(
            "FREESWITCH_AUDIO_FORMAT", "wav"
        )
        self.FREESWITCH_SAMPLE_RATE: int = int(
            os.getenv("FREESWITCH_SAMPLE_RATE", "16000")
        )
        self.FREESWITCH_RECORD_TIMEOUT: int = int(
            os.getenv("FREESWITCH_RECORD_TIMEOUT", "30")
        )
        self.FREESWITCH_SILENCE_THRESHOLD: int = int(
            os.getenv("FREESWITCH_SILENCE_THRESHOLD", "200")
        )

        # ── Call Behaviour ──
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

        # ── Dialplan ──
        self.FREESWITCH_DIALPLAN_CONTEXT: str = os.getenv(
            "FREESWITCH_DIALPLAN_CONTEXT", "ai-sales-agent"
        )
        self.FREESWITCH_SIP_IP: str = os.getenv(
            "FREESWITCH_SIP_IP", "0.0.0.0"
        )
        self.FREESWITCH_SIP_PORT: int = int(
            os.getenv("FREESWITCH_SIP_PORT", "5060")
        )
        self.FREESWITCH_RTP_IP: str = os.getenv(
            "FREESWITCH_RTP_IP", "0.0.0.0"
        )

        # ── Bridge Service ──
        self.FREESWITCH_BRIDGE_ENABLED: bool = (
            os.getenv("FREESWITCH_BRIDGE_ENABLED", "false").lower() == "true"
        )
        self.FREESWITCH_BRIDGE_HOST: str = os.getenv(
            "FREESWITCH_BRIDGE_HOST", "0.0.0.0"
        )
        self.FREESWITCH_BRIDGE_PORT: int = int(
            os.getenv("FREESWITCH_BRIDGE_PORT", "9000")
        )
        self.FREESWITCH_BRIDGE_RECONNECT_DELAY: int = int(
            os.getenv("FREESWITCH_BRIDGE_RECONNECT_DELAY", "5")
        )
        self.FREESWITCH_BRIDGE_MAX_RETRIES: int = int(
            os.getenv("FREESWITCH_BRIDGE_MAX_RETRIES", "10")
        )

    @property
    def enabled(self) -> bool:
        return self.FREESWITCH_BRIDGE_ENABLED

    @property
    def esl_address(self) -> str:
        return f"{self.FREESWITCH_ESL_HOST}:{self.FREESWITCH_ESL_PORT}"


# ── Singleton ──

_fs_settings: FreeSwitchSettings | None = None


def get_freeswitch_settings() -> FreeSwitchSettings:
    global _fs_settings
    if _fs_settings is None:
        _fs_settings = FreeSwitchSettings()
    return _fs_settings
