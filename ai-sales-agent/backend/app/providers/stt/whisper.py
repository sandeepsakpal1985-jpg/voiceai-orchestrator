"""
Whisper STT Provider — Local inference via faster-whisper.
Supports both file and streaming transcription with VAD filtering.
"""

import asyncio
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from typing import AsyncIterator

from faster_whisper import WhisperModel

from app.providers.base import STTProvider

_thread_pool = None


def _get_thread_pool():
    global _thread_pool
    if _thread_pool is None:
        _thread_pool = ThreadPoolExecutor(max_workers=2)
    return _thread_pool


class WhisperSTTProvider(STTProvider):
    """Speech-to-Text using faster-whisper."""

    def __init__(self, model_size: str = "base", device: str = "cpu", compute_type: str = "int8", cpu_threads: int = 4, num_workers: int = 1):
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._cpu_threads = cpu_threads
        self._num_workers = num_workers
        self._model = None

    async def _ensure_model(self):
        if self._model is None:
            loop = asyncio.get_running_loop()
            self._model = await loop.run_in_executor(
                _get_thread_pool(),
                lambda: WhisperModel(self._model_size, device=self._device, compute_type=self._compute_type, cpu_threads=self._cpu_threads, num_workers=self._num_workers),
            )
        return self._model

    @property
    def provider_name(self) -> str:
        return "whisper"

    @property
    def supports_streaming(self) -> bool:
        return True

    async def transcribe(self, audio_data: bytes, language: str = "en", **kwargs) -> str:
        model = await self._ensure_model()
        loop = asyncio.get_running_loop()

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name

        try:
            def _transcribe_sync(path):
                segments, _ = model.transcribe(path, beam_size=kwargs.get("beam_size", 5), language=None if language == "auto" else language, vad_filter=kwargs.get("vad_filter", True))
                return list(segments)

            segments = await loop.run_in_executor(_get_thread_pool(), lambda: _transcribe_sync(tmp_path))
            result_parts = []
            for seg in segments:
                text = (seg.text or "").strip()
                if text:
                    result_parts.append(text)
            return " ".join(result_parts)
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    async def transcribe_stream(self, audio_stream: AsyncIterator[bytes], language: str = "en", **kwargs) -> AsyncIterator[str]:
        model = await self._ensure_model()
        buffer = bytearray()
        min_chunk_duration = kwargs.get("min_chunk_duration", 2.0)
        sample_rate = kwargs.get("sample_rate", 16000)

        async for chunk in audio_stream:
            buffer.extend(chunk)
            estimated_duration = len(buffer) / (sample_rate * 2)
            if estimated_duration < min_chunk_duration:
                continue

            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                tmp.write(bytes(buffer))
                tmp_path = tmp.name

            try:
                def _transcribe_sync(path):
                    segments, _ = model.transcribe(path, beam_size=1, language=None if language == "auto" else language, vad_filter=True)
                    return list(segments)

                segments = await asyncio.get_running_loop().run_in_executor(_get_thread_pool(), lambda: _transcribe_sync(tmp_path))
                for seg in segments:
                    text = (seg.text or "").strip()
                    if text:
                        yield text

                overlap_bytes = int(sample_rate * 2 * 0.5)
                buffer = buffer[-overlap_bytes:] if len(buffer) > overlap_bytes else bytearray()
            finally:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
