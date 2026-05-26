"""
ElevenLabs TTS Provider — Real implementation using ElevenLabs REST API.

Features:
- High-quality neural TTS with emotion control
- Streaming synthesis via chunked transfer encoding
- Multiple voices and languages
- Connection pooling via shared httpx client
"""

import base64
import hashlib
import json
import logging
import os
from typing import AsyncIterator

import httpx

from app.providers.base import TTSProvider

logger = logging.getLogger("voiceai.tts.elevenlabs")

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


class ElevenLabsTTSProvider(TTSProvider):
    """Text-to-Speech using ElevenLabs API.

    Uses the ElevenLabs REST API for both single-shot and streaming synthesis.
    Requires ELEVENLABS_API_KEY environment variable to be set.

    API Reference: https://elevenlabs.io/docs/api-reference/text-to-speech
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = ELEVENLABS_API_BASE,
        http_timeout: float = 30.0,
    ):
        self._api_key = api_key or os.getenv("ELEVENLABS_API_KEY", "")
        self._base_url = base_url.rstrip("/")
        self._http_timeout = http_timeout
        self._client: httpx.AsyncClient | None = None
        self._cached_voices: list[dict] | None = None

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._http_timeout,
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    def _get_headers(self) -> dict:
        if not self._api_key:
            raise ValueError(
                "ElevenLabs API key is not configured. "
                "Set ELEVENLABS_API_KEY environment variable."
            )
        return {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": self._api_key,
        }

    # ── Interface Properties ─────────────────────────────────────

    @property
    def provider_name(self) -> str:
        return "elevenlabs"

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supported_voices(self) -> list[dict]:
        if self._cached_voices is not None:
            return self._cached_voices
        # Return known voice IDs (fetched lazily from API if needed)
        return [
            {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "language": "en"},
            {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi", "language": "en"},
            {"id": "EXAVITQu4vrRVcrVFSxJ", "name": "Bella", "language": "en"},
            {"id": "ErXwobaYiN019PkySvjV", "name": "Antoni", "language": "en"},
            {"id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli", "language": "en"},
            {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh", "language": "en"},
            {"id": "VR6AewLTigWG4xSOGBn0", "name": "Sam", "language": "en"},
            {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "language": "en"},
            {"id": "yoZ06aMxZJJ28mfd3POQ", "name": "Sofia", "language": "en"},
            {"id": "ZQe5CZNOzWefPxQcQwNx", "name": "Brian", "language": "en"},
        ]

    async def fetch_voices(self) -> list[dict]:
        """Fetch available voices from the ElevenLabs API."""
        client = await self._ensure_client()
        headers = self._get_headers()
        headers.pop("Accept", None)
        headers["Content-Type"] = "application/json"

        try:
            response = await client.get(
                f"{self._base_url}/voices",
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
            voices = [
                {
                    "id": v["voice_id"],
                    "name": v["name"],
                    "language": v.get("category", "en"),
                    "preview_url": v.get("preview_url", ""),
                }
                for v in data.get("voices", [])
            ]
            self._cached_voices = voices
            return voices
        except Exception as e:
            logger.warning("Failed to fetch voices from ElevenLabs: %s", e)
            return self.supported_voices

    # ── Synthesis ─────────────────────────────────────────────────

    async def synthesize(
        self,
        text: str,
        voice_id: str = "21m00Tcm4TlvDq8ikWAM",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> bytes:
        """Synthesize text to speech audio using ElevenLabs API.

        Args:
            text: Text to synthesize
            voice_id: ElevenLabs voice ID
            language: Language code (not directly used by ElevenLabs, voice determines language)
            speaking_rate: Speed multiplier (1.0 = normal)
            pitch: Pitch adjustment in semitones (not directly supported by ElevenLabs v1 API)

        Returns:
            MP3 audio bytes
        """
        client = await self._ensure_client()
        headers = self._get_headers()

        body = {
            "text": text,
            "model_id": kwargs.get("model_id", "eleven_monolingual_v1"),
            "voice_settings": {
                "stability": kwargs.get("stability", 0.5),
                "similarity_boost": kwargs.get("similarity_boost", 0.75),
                "style": kwargs.get("style", 0.0),
                "use_speaker_boost": kwargs.get("use_speaker_boost", True),
            },
        }

        # Apply speaking_rate via speed parameter if provided
        if speaking_rate != 1.0:
            body["voice_settings"]["speed"] = speaking_rate

        # Apply seed for consistency if provided
        seed = kwargs.get("seed")
        if seed is not None:
            body["seed"] = seed

        logger.debug(
            "Synthesizing %d chars with voice %s (model: %s)",
            len(text),
            voice_id,
            body["model_id"],
        )

        response = await client.post(
            f"{self._base_url}/text-to-speech/{voice_id}",
            json=body,
            headers=headers,
        )

        if response.status_code == 401:
            raise ValueError(
                "Invalid ElevenLabs API key. Check your ELEVENLABS_API_KEY environment variable."
            )
        if response.status_code == 422:
            error_detail = response.json().get("detail", "Unknown validation error")
            raise ValueError(f"ElevenLabs API validation error: {error_detail}")

        response.raise_for_status()

        audio_bytes = response.content
        logger.debug("Synthesized %d bytes of audio", len(audio_bytes))
        return audio_bytes

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str = "21m00Tcm4TlvDq8ikWAM",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> AsyncIterator[bytes]:
        """Streaming TTS synthesis using ElevenLabs chunked transfer encoding.

        Yields audio chunks as they arrive from the API.
        """
        client = await self._ensure_client()
        headers = self._get_headers()

        body = {
            "text": text,
            "model_id": kwargs.get("model_id", "eleven_monolingual_v1"),
            "voice_settings": {
                "stability": kwargs.get("stability", 0.5),
                "similarity_boost": kwargs.get("similarity_boost", 0.75),
                "style": kwargs.get("style", 0.0),
                "use_speaker_boost": kwargs.get("use_speaker_boost", True),
            },
        }

        if speaking_rate != 1.0:
            body["voice_settings"]["speed"] = speaking_rate

        logger.debug(
            "Starting streaming synthesis for %d chars with voice %s",
            len(text),
            voice_id,
        )

        async with client.stream(
            "POST",
            f"{self._base_url}/text-to-speech/{voice_id}/stream",
            json=body,
            headers=headers,
        ) as response:
            if response.status_code == 401:
                raise ValueError(
                    "Invalid ElevenLabs API key. Check your ELEVENLABS_API_KEY."
                )
            response.raise_for_status()

            chunk_count = 0
            async for chunk in response.aiter_bytes():
                if chunk:
                    chunk_count += 1
                    yield chunk

            logger.debug("Streaming complete: %d chunks yielded", chunk_count)
