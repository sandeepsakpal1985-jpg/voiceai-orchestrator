"""
Whisper STT Provider — Local inference via faster-whisper.

Supports both file and streaming transcription with VAD filtering.
"""

import asyncio
import os
import tempfile
from typing import AsyncIterator

from faster_whisper import WhisperModel

from app.providers.base import STTProvider

# Shared thread pool executor for CPU-bound operations
_thread_pool = None


def _get_thread_pool():
    global _thread_pool
    if _thread_pool is None:
        _thread_pool = asyncio.ThreadPoolExecutor(max_workers=2)
    return _thread_pool


class WhisperSTTProvider(STTProvider):
    """Speech-to-Text using OpenAI Whisper via faster-whisper."""

    def __init__(
        self,
        model_size: str = "base",
        device: str = "cpu",
        compute_type: str = "int8",
        cpu_threads: int = 4,
        num_workers: int = 1,
    ):
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._cpu_threads = cpu_threads
        self._num_workers = num_workers
        self._model: WhisperModel | None = None

    async def _ensure_model(self) -> WhisperModel:
        """Lazy-load the Whisper model in a thread to avoid blocking the event loop."""
        if self._model is None:
            loop = asyncio.get_running_loop()
            self._model = await loop.run_in_executor(
                _get_thread_pool(),
                lambda: WhisperModel(
                    self._model_size,
                    device=self._device,
                    compute_type=self._compute_type,
                    cpu_threads=self._cpu_threads,
                    num_workers=self._num_workers,
                ),
            )
        return self._model

    @property
    def provider_name(self) -> str:
        return "whisper"

    @property
    def supports_streaming(self) -> bool:
        return True

    async def transcribe(
        self, audio_data: bytes, language: str = "en", **kwargs
    ) -> str:
        """Transcribe audio bytes to text using Whisper.

        Args:
            audio_data: Raw audio bytes (WAV, MP3, etc.)
            language: Language code (e.g. 'en', 'hi')

        Returns:
            Transcribed text string
        """
        model = await self._ensure_model()
        loop = asyncio.get_running_loop()

        # Save to temp file for faster-whisper
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name

        try:
            segments = await loop.run_in_executor(
                _get_thread_pool(),
                lambda: list(
                    model.transcribe(
                        tmp_path,
                        beam_size=kwargs.get("beam_size", 5),
                        language=language if language != "auto" else None,
                        vad_filter=kwargs.get("vad_filter", True),
                    )
                ),
            )

            # Reconstruct segments
            result_parts = []
            for seg in segments:
                text = seg.text or ""
                if text.strip():
                    result_parts.append(text.strip())

            return " ".join(result_parts) if result_parts else ""

        finally:
            os.unlink(tmp_path)

    async def transcribe_stream(
        self,
        audio_stream: AsyncIterator[bytes],
        language: str = "en",
        **kwargs,
    ) -> AsyncIterator[str]:
        """Streaming transcription.

        Note: faster-whisper doesn't natively support true streaming.
        This implementation buffers audio chunks and processes them in windows.
        For true low-latency streaming, use Deepgram or a WebSocket-based provider.
        """
        model = await self._ensure_model()
        import asyncio

        buffer = bytearray()
        min_chunk_duration = kwargs.get("min_chunk_duration", 2.0)  # seconds of audio
        sample_rate = kwargs.get("sample_rate", 16000)

        async for chunk in audio_stream:
            buffer.extend(chunk)

            # Process when buffer is large enough
            estimated_duration = len(buffer) / (sample_rate * 2)  # 16-bit mono
            if estimated_duration >= min_chunk_duration:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    tmp.write(bytes(buffer))
                    tmp_path = tmp.name

                try:
                    segments = await asyncio.get_running_loop().run_in_executor(
                        _get_thread_pool(),
                        lambda: list(
                            model.transcribe(
                                tmp_path,
                                beam_size=1,
                                language=language if language != "auto" else None,
                                vad_filter=True,
                            )
                        ),
                    )

                    for seg in segments:
                        text = (seg.text or "").strip()
                        if text:
                            yield text

                    # Keep last 0.5s for overlap
                    overlap_bytes = int(sample_rate * 2 * 0.5)
                    if len(buffer) > overlap_bytes:
                        buffer = buffer[-overlap_bytes:]
                    else:
                        buffer.clear()

                finally:
                    os.unlink(tmp_path)
