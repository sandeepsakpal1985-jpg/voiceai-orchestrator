"""
Kokoro TTS Provider — Ultra-lightweight local TTS via Kokoro (~82M params).
Ideal for self-hosted voice agents with low latency CPU inference.
"""

import asyncio
import io
import logging
from typing import AsyncIterator

import numpy as np
import soundfile as sf

from app.providers.base import TTSProvider

logger = logging.getLogger("ai_sales_agent.tts.kokoro")


class KokoroTTSProvider(TTSProvider):
    """Text-to-Speech using Kokoro for lightweight local inference."""

    LANG_CODE_MAP: dict[str, str] = {
        "en": "a", "en-us": "a", "en-gb": "b",
        "es": "e", "fr": "f", "hi": "h", "it": "i",
        "ja": "j", "ko": "k", "zh": "z", "pt": "p",
    }

    def __init__(self, voice: str = "default"):
        self._voice = voice
        self._model = None
        self._model_lock = asyncio.Lock()

    async def _ensure_model(self, lang_code: str = "a"):
        if self._model is not None:
            return self._model
        async with self._model_lock:
            if self._model is not None:
                return self._model

            def _load():
                try:
                    from kokoro import KPipeline
                except ImportError:
                    raise ImportError("Kokoro requires the kokoro package. Install with: pip install kokoro")
                logger.info("Loading Kokoro KPipeline (lang_code=%s)...", lang_code)
                pipeline = KPipeline(lang_code=lang_code)
                logger.info("Kokoro KPipeline loaded successfully")
                return pipeline

            loop = asyncio.get_running_loop()
            self._model = await loop.run_in_executor(None, _load)
            return self._model

    @property
    def provider_name(self) -> str:
        return "kokoro"

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supported_voices(self) -> list[dict]:
        return [
            {"id": "af_bella", "name": "Bella (American female)", "language": "en"},
            {"id": "am_adam", "name": "Adam (American male)", "language": "en"},
            {"id": "bf_emma", "name": "Emma (British female)", "language": "en"},
            {"id": "bm_george", "name": "George (British male)", "language": "en"},
        ]

    async def synthesize(self, text: str, voice_id: str = "default", language: str = "en", speaking_rate: float = 1.0, pitch: float = 0.0, **kwargs) -> bytes:
        resolved_lang = self.LANG_CODE_MAP.get(language.lower(), "a")
        pipeline = await self._ensure_model(lang_code=resolved_lang)
        loop = asyncio.get_running_loop()

        def _synthesize():
            audio_segments = []
            sample_rate = 24000
            resolved_voice = voice_id if voice_id != "default" else "af_bella"

            gen = pipeline(text, voice=resolved_voice, speed=speaking_rate, split_pattern=r'\n+')
            for _, _, audio_tensor in gen:
                if audio_tensor is not None:
                    audio_segments.append(np.array(audio_tensor))

            if not audio_segments:
                return b''

            full_audio = np.concatenate(audio_segments) if len(audio_segments) > 1 else audio_segments[0]
            buf = io.BytesIO()
            sf.write(buf, full_audio, sample_rate, format='WAV')
            return buf.getvalue()

        audio_bytes = await loop.run_in_executor(None, _synthesize)
        logger.debug("Kokoro generated %d bytes of audio", len(audio_bytes))
        return audio_bytes

    async def synthesize_stream(self, text: str, voice_id: str = "default", language: str = "en", speaking_rate: float = 1.0, pitch: float = 0.0, **kwargs) -> AsyncIterator[bytes]:
        audio = await self.synthesize(text=text, voice_id=voice_id, language=language, speaking_rate=speaking_rate, pitch=pitch, **kwargs)
        yield audio
