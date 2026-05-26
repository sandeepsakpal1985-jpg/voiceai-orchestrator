"""
AssemblyAI STT Provider — Stub for future implementation.

AssemblyAI provides:
- Async transcription with high accuracy
- Real-time streaming transcription via WebSocket
- Multi-language support
- Speaker diarization and content moderation
"""

from typing import AsyncIterator

from app.providers.base import STTProvider


class AssemblyAISTTProvider(STTProvider):
    """Speech-to-Text using AssemblyAI API.

    NOTE: This is a stub. Implement when AssemblyAI API key is available.
    """

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key

    @property
    def provider_name(self) -> str:
        return "assemblyai"

    @property
    def supports_streaming(self) -> bool:
        return True

    async def transcribe(
        self, audio_data: bytes, language: str = "en", **kwargs
    ) -> str:
        raise NotImplementedError(
            "AssemblyAI STT is not yet implemented. "
            "Set STT_PROVIDER=whisper to use local Whisper inference."
        )

    async def transcribe_stream(
        self,
        audio_stream: AsyncIterator[bytes],
        language: str = "en",
        **kwargs,
    ) -> AsyncIterator[str]:
        raise NotImplementedError(
            "AssemblyAI streaming STT is not yet implemented. "
            "Set STT_PROVIDER=whisper to use local Whisper inference."
        )
