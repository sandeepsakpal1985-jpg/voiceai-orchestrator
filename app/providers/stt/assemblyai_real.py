"""
AssemblyAI STT Provider — Real implementation using AssemblyAI API.

Supports:
- Async transcription via the AssemblyAI Python SDK
- Real-time streaming transcription via RealtimeTranscriber
- Multiple languages with automatic detection
- Speaker diarization, punctuation, and content moderation

Requires:
    pip install assemblyai

Usage:
    import assemblyai as aai
    aai.settings.api_key = "your-api-key"
"""

import asyncio
import logging
import os
import tempfile
from typing import Any, AsyncIterator

from app.providers.base import STTProvider

logger = logging.getLogger("voiceai.stt.assemblyai")

# Module-level cache for lazy import
_aai = None


def _get_aai():
    """Lazy-import assemblyai so the module can be imported without it installed."""
    global _aai
    if _aai is None:
        try:
            import assemblyai as aai  # noqa: PLC0415
            _aai = aai
        except ImportError:
            raise ImportError(
                "assemblyai package is required. Install with: pip install assemblyai"
            )
    return _aai


class AssemblyAISTTProvider(STTProvider):
    """Speech-to-Text using AssemblyAI API.

    Uses the official AssemblyAI Python SDK for both async
    (pre-recorded) and real-time streaming transcription.

    Requires ASSEMBLYAI_API_KEY environment variable.

    API Reference: https://www.assemblyai.com/docs
    """

    def __init__(
        self,
        api_key: str | None = None,
    ):
        self._api_key = api_key or os.getenv("ASSEMBLYAI_API_KEY", "")
        if self._api_key:
            aai = _get_aai()
            aai.settings.api_key = self._api_key

    @property
    def provider_name(self) -> str:
        return "assemblyai"

    @property
    def supports_streaming(self) -> bool:
        return True

    async def transcribe(
        self,
        audio_data: bytes,
        language: str = "en",
        **kwargs,
    ) -> str:
        """Transcribe audio bytes to text using AssemblyAI async transcription.

        Args:
            audio_data: Raw audio bytes (WAV, MP3, etc.)
            language: Language code (e.g. 'en', 'es')

        Returns:
            Transcribed text string
        """
        if not self._api_key:
            raise ValueError(
                "AssemblyAI API key is not configured. "
                "Set ASSEMBLYAI_API_KEY environment variable."
            )

        aai = _get_aai()

        # Write bytes to a temp file so AssemblyAI can read it
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name

        try:
            config = aai.TranscriptionConfig(
                language_code=language if language != "auto" else None,
                punctuate=True,
                speaker_labels=kwargs.get("diarize", False),
                language_detection=(language == "auto"),
            )

            transcriber = aai.Transcriber()
            transcript = await asyncio.to_thread(
                transcriber.transcribe,
                tmp_path,
                config=config,
            )

            if transcript.error:
                logger.error("AssemblyAI transcription error: %s", transcript.error)
                raise RuntimeError(f"AssemblyAI transcription failed: {transcript.error}")

            return transcript.text.strip()

        finally:
            os.unlink(tmp_path)

    async def transcribe_stream(
        self,
        audio_stream: AsyncIterator[bytes],
        language: str = "en",
        **kwargs,
    ) -> AsyncIterator[str]:
        """Streaming transcription using AssemblyAI RealtimeTranscriber.

        Provides low-latency real-time transcription via WebSocket.

        Args:
            audio_stream: Async iterator of audio chunks
            language: Language code

        Yields:
            Transcription text fragments as they are finalized
        """
        if not self._api_key:
            raise ValueError(
                "AssemblyAI API key is required for streaming transcription."
            )

        aai = _get_aai()
        sample_rate = kwargs.get("sample_rate", 16000)

        # Capture event loop reference for thread-safe callback scheduling
        loop = asyncio.get_running_loop()

        # Build the real-time transcriber
        transcriber = aai.RealtimeTranscriber(
            sample_rate=sample_rate,
            on_data=lambda data: None,
            on_error=lambda error: logger.error("AssemblyAI RT error: %s", error),
            on_close=lambda: logger.debug("AssemblyAI RT connection closed"),
        )

        # We need an async-compatible queue to pipe results from callbacks
        result_queue: asyncio.Queue[str] = asyncio.Queue()

        def on_final_transcript(transcript: aai.RealtimeFinalTranscript) -> None:
            text = transcript.text.strip()
            if text:
                # Schedule the put in the captured event loop (thread-safe)
                loop.call_soon_threadsafe(result_queue.put_nowait, text)

        def on_interim_transcript(transcript: aai.RealtimeTranscript) -> None:
            pass  # We only yield final transcripts

        transcriber.on_transcript = on_final_transcript

        try:
            # Connect to AssemblyAI's real-time endpoint
            transcriber.connect()

            # Send audio chunks in the background
            async def send_audio():
                try:
                    async for chunk in audio_stream:
                        transcriber.send_audio(chunk)
                except Exception:
                    pass
                finally:
                    transcriber.close()

            send_task = asyncio.create_task(send_audio())

            # Read finalized transcripts from the queue
            try:
                while True:
                    try:
                        text = await asyncio.wait_for(
                            result_queue.get(), timeout=kwargs.get("timeout", 10.0)
                        )
                        yield text
                    except asyncio.TimeoutError:
                        break
            finally:
                send_task.cancel()
                try:
                    await send_task
                except asyncio.CancelledError:
                    pass

        except Exception as e:
            logger.warning("AssemblyAI streaming error: %s", e)
        finally:
            try:
                transcriber.close()
            except Exception:
                pass
