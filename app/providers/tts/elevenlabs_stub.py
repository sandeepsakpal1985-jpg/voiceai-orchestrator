"""
ElevenLabs TTS Provider — Stub for future implementation.

ElevenLabs features:
- High-quality neural TTS with emotion control
- Voice cloning
- Streaming synthesis
- Multiple languages
"""

from typing import AsyncIterator

from app.providers.base import TTSProvider


class ElevenLabsTTSProvider(TTSProvider):
    """Text-to-Speech using ElevenLabs API.

    NOTE: This is a stub. Implement when ElevenLabs API key is available.
    """

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key

    @property
    def provider_name(self) -> str:
        return "elevenlabs"

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supported_voices(self) -> list[dict]:
        return [
            {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "language": "en"},
            {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi", "language": "en"},
            {"id": "EXAVITQu4vrRVcrVFSxJ", "name": "Bella", "language": "en"},
        ]

    async def synthesize(
        self,
        text: str,
        voice_id: str = "21m00Tcm4TlvDq8ikWAM",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> bytes:
        raise NotImplementedError(
            "ElevenLabs TTS is not yet implemented. "
            "Set TTS_PROVIDER=xtts to use local XTTS inference."
        )

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str = "21m00Tcm4TlvDq8ikWAM",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> AsyncIterator[bytes]:
        raise NotImplementedError(
            "ElevenLabs streaming TTS is not yet implemented. "
            "Set TTS_PROVIDER=xtts to use local XTTS inference."
        )
