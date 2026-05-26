"""
XTTS Provider — Stub for self-hosted local TTS inference.

Future implementation will support:
- Fully local TTS via Coqui XTTS
- Voice cloning from samples
- Multi-language support
- No external API dependencies
- GPU-accelerated inference
"""

from typing import AsyncIterator

from app.providers.base import TTSProvider


class XTTSTTSProvider(TTSProvider):
    """Text-to-Speech using Coqui XTTS for fully local inference.

    NOTE: This is a stub for future self-hosting support.
    """

    def __init__(self):
        pass

    @property
    def provider_name(self) -> str:
        return "xtts"

    @property
    def supports_streaming(self) -> bool:
        return False  # XTTS v2 doesn't support true streaming

    @property
    def supported_voices(self) -> list[dict]:
        return [
            {"id": "default", "name": "Default Voice", "language": "en"},
        ]

    async def synthesize(
        self,
        text: str,
        voice_id: str = "default",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> bytes:
        raise NotImplementedError(
            "XTTS is not yet implemented. "
            "The system runs without local TTS for now."
        )

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str = "default",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> AsyncIterator[bytes]:
        raise NotImplementedError(
            "XTTS streaming is not yet implemented."
        )
