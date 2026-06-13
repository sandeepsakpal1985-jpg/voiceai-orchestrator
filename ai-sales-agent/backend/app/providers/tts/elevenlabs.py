"""
ElevenLabs TTS Provider — Cloud-based text-to-speech via ElevenLabs API.
"""

import base64
import logging
from typing import AsyncIterator

import httpx

from app.providers.base import TTSProvider

logger = logging.getLogger("ai_sales_agent.tts.elevenlabs")


class ElevenLabsTTSProvider(TTSProvider):
    """Text-to-Speech using ElevenLabs cloud API."""

    def __init__(self, api_key: str):
        self._api_key = api_key
        self._base_url = "https://api.elevenlabs.io/v1"

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
            {"id": "EXAVITQu4vr2nS4tB6bI", "name": "Bella", "language": "en"},
            {"id": "ErXwobaYiN019PkySvjV", "name": "Antoni", "language": "en"},
        ]

    async def synthesize(self, text: str, voice_id: str = "default", language: str = "en", speaking_rate: float = 1.0, pitch: float = 0.0, **kwargs) -> bytes:
        voice = voice_id if voice_id != "default" else "21m00Tcm4TlvDq8ikWAM"
        headers = {"xi-api-key": self._api_key, "Content-Type": "application/json"}
        body = {"text": text, "model_id": "eleven_monolingual_v1", "voice_settings": {"stability": 0.5, "similarity_boost": 0.5}}

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{self._base_url}/text-to-speech/{voice}", json=body, headers=headers)
            response.raise_for_status()
            return response.content

    async def synthesize_stream(self, text: str, voice_id: str = "default", language: str = "en", speaking_rate: float = 1.0, pitch: float = 0.0, **kwargs) -> AsyncIterator[bytes]:
        audio = await self.synthesize(text=text, voice_id=voice_id, language=language, speaking_rate=speaking_rate, pitch=pitch, **kwargs)
        yield audio
