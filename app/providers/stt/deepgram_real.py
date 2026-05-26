"""
Deepgram STT Provider — Real implementation using Deepgram API.

Supports:
- REST API for pre-recorded audio transcription
- WebSocket streaming for real-time transcription
- Multiple languages with automatic detection
- Punctuation, formatting, and diarization
"""

import asyncio
import json
import logging
import os
from typing import AsyncIterator

import httpx

from app.providers.base import STTProvider

logger = logging.getLogger("voiceai.stt.deepgram")

DEEPGRAM_API_BASE = "https://api.deepgram.com/v1"


class DeepgramSTTProvider(STTProvider):
    """Speech-to-Text using Deepgram API.

    Uses Deepgram's REST API for file transcription and WebSocket
    for streaming transcription.

    Requires DEEPGRAM_API_KEY environment variable.

    API Reference: https://developers.deepgram.com/reference
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = DEEPGRAM_API_BASE,
        http_timeout: float = 60.0,
    ):
        self._api_key = api_key or os.getenv("DEEPGRAM_API_KEY", "")
        self._base_url = base_url.rstrip("/")
        self._http_timeout = http_timeout
        self._client: httpx.AsyncClient | None = None

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
                "Deepgram API key is not configured. "
                "Set DEEPGRAM_API_KEY environment variable."
            )
        return {
            "Authorization": f"Token {self._api_key}",
        }

    @property
    def provider_name(self) -> str:
        return "deepgram"

    @property
    def supports_streaming(self) -> bool:
        return True

    async def transcribe(
        self,
        audio_data: bytes,
        language: str = "en",
        **kwargs,
    ) -> str:
        """Transcribe audio bytes to text using Deepgram REST API.

        Args:
            audio_data: Raw audio bytes (WAV, MP3, etc.)
            language: Language code (e.g. 'en', 'hi', 'es')

        Returns:
            Transcribed text string
        """
        client = await self._ensure_client()
        headers = self._get_headers()

        params = {
            "model": kwargs.get("model", "nova-2"),
            "language": language,
            "punctuate": kwargs.get("punctuate", True),
            "smart_format": kwargs.get("smart_format", True),
            "utterances": kwargs.get("utterances", False),
            "diarize": kwargs.get("diarize", False),
        }

        # Detect content type from kwargs or use generic
        content_type = kwargs.get("content_type", "audio/wav")

        logger.debug(
            "Transcribing %d bytes of audio (language=%s, model=%s)",
            len(audio_data),
            language,
            params["model"],
        )

        response = await client.post(
            f"{self._base_url}/listen?{'&'.join(f'{k}={v}' for k, v in params.items() if v is not None)}",
            content=audio_data,
            headers={
                **headers,
                "Content-Type": content_type,
            },
        )

        if response.status_code == 401:
            raise ValueError(
                "Invalid Deepgram API key. Check your DEEPGRAM_API_KEY environment variable."
            )
        if response.status_code == 429:
            raise RuntimeError(
                "Deepgram rate limit exceeded. Consider reducing request frequency."
            )

        response.raise_for_status()
        data = response.json()

        # Extract transcript text from response
        try:
            transcript = data["results"]["channels"][0]["alternatives"][0]["transcript"]
            return transcript.strip()
        except (KeyError, IndexError) as e:
            logger.warning("Unexpected Deepgram response structure: %s", e)
            return ""

    async def transcribe_stream(
        self,
        audio_stream: AsyncIterator[bytes],
        language: str = "en",
        **kwargs,
    ) -> AsyncIterator[str]:
        """Streaming transcription using Deepgram WebSocket API.

        For the HTTP-based implementation, we buffer chunks and send them
        to the REST API periodically. For true low-latency streaming,
        use the WebSocket connection directly.

        Args:
            audio_stream: Async iterator of audio chunks
            language: Language code

        Yields:
            Transcription text fragments
        """
        # Buffer-based approach using REST API
        buffer = bytearray()
        min_chunk_duration = kwargs.get("min_chunk_duration", 1.0)
        sample_rate = kwargs.get("sample_rate", 16000)
        last_process_time = asyncio.get_event_loop().time()

        async for chunk in audio_stream:
            buffer.extend(chunk)

            elapsed = asyncio.get_event_loop().time() - last_process_time
            estimated_duration = len(buffer) / (sample_rate * 2)

            if estimated_duration >= min_chunk_duration:
                text = await self.transcribe(
                    bytes(buffer),
                    language=language,
                    model=kwargs.get("model", "nova-2"),
                    content_type="audio/wav",
                )
                if text.strip():
                    yield text

                # Keep ~0.5s overlap
                overlap_bytes = int(sample_rate * 2 * 0.5)
                if len(buffer) > overlap_bytes:
                    buffer = buffer[-overlap_bytes:]
                else:
                    buffer.clear()
                last_process_time = asyncio.get_event_loop().time()

        # Process remaining buffer
        if buffer:
            text = await self.transcribe(
                bytes(buffer),
                language=language,
                model=kwargs.get("model", "nova-2"),
                content_type="audio/wav",
            )
            if text.strip():
                yield text

    # ── WebSocket streaming (higher performance) ──────────────────

    async def transcribe_stream_ws(
        self,
        audio_stream: AsyncIterator[bytes],
        language: str = "en",
        **kwargs,
    ) -> AsyncIterator[str]:
        """Streaming transcription using Deepgram WebSocket API.

        Provides lower latency than the buffered REST approach.
        Requires the `websockets` package.

        Args:
            audio_stream: Async iterator of audio chunks
            language: Language code

        Yields:
            Real-time transcription text fragments
        """
        try:
            import websockets
        except ImportError:
            logger.warning(
                "websockets package not installed, falling back to REST streaming"
            )
            async for text in self.transcribe_stream(audio_stream, language=language, **kwargs):
                yield text
            return

        if not self._api_key:
            raise ValueError("Deepgram API key is required for WebSocket streaming")

        params = {
            "model": kwargs.get("model", "nova-2"),
            "language": language,
            "punctuate": "true" if kwargs.get("punctuate", True) else "false",
            "smart_format": "true" if kwargs.get("smart_format", True) else "false",
            "interim_results": "true" if kwargs.get("interim_results", True) else "false",
            "encoding": kwargs.get("encoding", "linear16"),
            "sample_rate": str(kwargs.get("sample_rate", 16000)),
            "channels": str(kwargs.get("channels", 1)),
        }

        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        ws_url = f"wss://api.deepgram.com/v1/listen?{query_string}"

        async with websockets.connect(
            ws_url,
            extra_headers={"Authorization": f"Token {self._api_key}"},
        ) as ws:
            # Receive the greeting/connected message
            greeting = await ws.recv()
            logger.debug("Deepgram WS connected: %s", str(greeting)[:100])

            async def send_audio():
                """Send audio chunks to Deepgram."""
                try:
                    async for chunk in audio_stream:
                        await ws.send(chunk)
                    # Signal end of stream
                    await ws.send(json.dumps({"type": "CloseStream"}))
                except Exception:
                    pass

            # Start sending audio in the background
            send_task = asyncio.create_task(send_audio())

            try:
                async for message in ws:
                    data = json.loads(message)

                    if data.get("type") == "Results":
                        channel = data.get("channel", {})
                        alternatives = channel.get("alternatives", [])
                        if alternatives:
                            transcript = alternatives[0].get("transcript", "").strip()
                            is_final = data.get("is_final", False)
                            if transcript and is_final:
                                yield transcript

                    elif data.get("type") == "Error":
                        logger.warning("Deepgram WS error: %s", data.get("description", ""))

                    elif data.get("type") == "Close":
                        logger.debug("Deepgram WS closed")
                        break

                    elif data.get("type") == "Metadata":
                        logger.debug("Deepgram WS metadata: %s", str(data)[:200])

            finally:
                send_task.cancel()
                try:
                    await send_task
                except asyncio.CancelledError:
                    pass
