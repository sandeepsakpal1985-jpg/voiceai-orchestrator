"""
Azure Speech STT Provider — Stub for future implementation.

Azure Speech Services provides:
- Real-time speech-to-text with high accuracy
- Custom models and domain adaptation
- Multi-language support including code-switching
- Phrase list boosting, profanity filtering, and diarization
- Pronunciation assessment
"""

from typing import AsyncIterator

from app.providers.base import STTProvider


class AzureSpeechSTTProvider(STTProvider):
    """Speech-to-Text using Azure Cognitive Speech Services.

    NOTE: This is a stub. Implement when Azure Speech API key is available.
    """

    def __init__(self, api_key: str | None = None, region: str = "eastus"):
        self._api_key = api_key
        self._region = region

    @property
    def provider_name(self) -> str:
        return "azure_speech"

    @property
    def supports_streaming(self) -> bool:
        return True

    async def transcribe(
        self, audio_data: bytes, language: str = "en", **kwargs
    ) -> str:
        raise NotImplementedError(
            "Azure Speech STT is not yet implemented. "
            "Set STT_PROVIDER=whisper to use local Whisper inference."
        )

    async def transcribe_stream(
        self,
        audio_stream: AsyncIterator[bytes],
        language: str = "en",
        **kwargs,
    ) -> AsyncIterator[str]:
        raise NotImplementedError(
            "Azure Speech streaming STT is not yet implemented. "
            "Set STT_PROVIDER=whisper to use local Whisper inference."
        )
