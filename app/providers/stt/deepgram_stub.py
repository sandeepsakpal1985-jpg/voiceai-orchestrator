"""
Deepgram STT Provider — Stub for future implementation.

Deepgram provides:
- Real-time streaming transcription with very low latency
- Multi-language support
- Punctuation, formatting, and diarization
"""

from typing import AsyncIterator

from app.providers.base import STTProvider


class DeepgramSTTProvider(STTProvider):
    """Speech-to-Text using Deepgram API.

    NOTE: This is a stub. Implement when Deepgram API key is available.
    """

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key

    @property
    def provider_name(self) -> str:
        return "deepgram"

    @property
    def supports_streaming(self) -> bool:
        return True

    async def transcribe(
        self, audio_data: bytes, language: str = "en", **kwargs
    ) -> str:
        raise NotImplementedError(
            "Deepgram STT is not yet implemented. "
            "Set STT_PROVIDER=whisper to use local Whisper inference."
        )

    async def transcribe_stream(
        self,
        audio_stream: AsyncIterator[bytes],
        language: str = "en",
        **kwargs,
    ) -> AsyncIterator[str]:
        raise NotImplementedError(
            "Deepgram streaming STT is not yet implemented. "
            "Set STT_PROVIDER=whisper to use local Whisper inference."
        )
