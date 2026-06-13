"""
Deepgram STT Provider — Cloud-based speech-to-text via Deepgram API.
"""

import json
import logging
from typing import AsyncIterator

import httpx

from app.providers.base import STTProvider

logger = logging.getLogger("ai_sales_agent.stt.deepgram")


class DeepgramSTTProvider(STTProvider):
    """Speech-to-Text using Deepgram's cloud API."""

    def __init__(self, api_key: str, model: str = "nova-2"):
        self._api_key = api_key
        self._model = model
        self._base_url = "https://api.deepgram.com/v1"

    @property
    def provider_name(self) -> str:
        return "deepgram"

    @property
    def supports_streaming(self) -> bool:
        return True

    async def transcribe(self, audio_data: bytes, language: str = "en", **kwargs) -> str:
        headers = {"Authorization": f"Token {self._api_key}", "Content-Type": "audio/webm"}
        params = {"model": self._model, "language": language, "smart_format": "true"}

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{self._base_url}/listen", headers=headers, params=params, content=audio_data)
            response.raise_for_status()
            result = response.json()
            return result.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "")

    async def transcribe_stream(self, audio_stream: AsyncIterator[bytes], language: str = "en", **kwargs) -> AsyncIterator[str]:
        async for chunk in audio_stream:
            text = await self.transcribe(chunk, language=language)
            if text.strip():
                yield text
