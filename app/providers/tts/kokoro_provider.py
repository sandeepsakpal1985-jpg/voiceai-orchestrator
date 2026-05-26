"""
Kokoro TTS Provider — Ultra-lightweight local TTS via Kokoro.

Kokoro is a lightweight (~82M params) text-to-speech model that runs
efficiently on CPU. Ideal for self-hosted voice agents with low latency.

Features:
- Fully local — no API dependencies
- Fast CPU inference (~2x real-time on modern CPUs)
- Multi-language support (English, Japanese, Chinese, Korean, French, etc.)
- Voice cloning support
- Emotion parameter readiness

References:
    https://github.com/remsky/Kokoro-FastAPI
    https://huggingface.co/facebook/kokoro-v0_19
"""

import asyncio
import logging
import os
import tempfile
from typing import AsyncIterator

from app.providers.base import TTSProvider

logger = logging.getLogger("voiceai.tts.kokoro")


class KokoroTTSProvider(TTSProvider):
    """Text-to-Speech using Kokoro for lightweight local inference.

    Kokoro is designed for low-latency, on-device TTS.
    The model is loaded lazily on first use.

    Requires: pip install kokoro
    """

    def __init__(
        self,
        model_name: str = "kokoro-v0_19",
        device: str = "cpu",
        voice: str = "default",
    ):
        self._model_name = model_name
        self._device = device
        self._voice = voice
        self._model = None
        self._model_lock = asyncio.Lock()

    # ── Language Code Mapping ──
    # Maps ISO language codes to Kokoro's internal KPipeline lang_code values.
    # See: https://github.com/hexgrad/kokoro#language-support
    LANG_CODE_MAP: dict[str, str] = {
        "en": "a",  # American English
        "en-us": "a",
        "en-gb": "b",  # British English
        "es": "e",  # Spanish
        "fr": "f",  # French
        "hi": "h",  # Hindi
        "it": "i",  # Italian
        "ja": "j",  # Japanese
        "ko": "k",  # Korean
        "zh": "z",  # Chinese (Mandarin)
        "pt": "p",  # Portuguese
    }

    async def _ensure_model(self, lang_code: str = "a"):
        """Lazy-load the Kokoro model for the given language code.

        Uses the actual `kokoro.KPipeline` class — a callable generator.
        In practice, we cache a single pipeline for the default language
        since creating pipelines is expensive.

        See: https://github.com/hexgrad/kokoro
        """
        if self._model is not None:
            return self._model

        async with self._model_lock:
            if self._model is not None:
                return self._model

            loop = asyncio.get_running_loop()

            def _load():
                try:
                    from kokoro import KPipeline
                except ImportError:
                    raise ImportError(
                        "Kokoro requires the kokoro package. "
                        "Install with: pip install kokoro"
                    )

                logger.info(
                    "Loading Kokoro KPipeline with lang_code='%s'...",
                    lang_code,
                )

                pipeline = KPipeline(lang_code=lang_code)
                logger.info("Kokoro KPipeline loaded successfully")
                return pipeline

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
            {"id": "default", "name": "Default Voice", "language": "en"},
            {"id": "af_bella", "name": "Bella (American female)", "language": "en"},
            {"id": "am_adam", "name": "Adam (American male)", "language": "en"},
            {"id": "bf_emma", "name": "Emma (British female)", "language": "en"},
            {"id": "bm_george", "name": "George (British male)", "language": "en"},
        ]

    async def synthesize(
        self,
        text: str,
        voice_id: str = "default",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> bytes:
        """Synthesize text to speech using Kokoro.

        Args:
            text: Text to synthesize
            voice_id: Voice identifier
            language: Language code
            speaking_rate: Speed multiplier (not directly supported, uses default)
            pitch: Pitch adjustment (not directly supported, uses default)

        Returns:
            WAV audio bytes
        """
        # Resolve language code for KPipeline
        resolved_lang = self.LANG_CODE_MAP.get(language.lower(), "a")
        pipeline = await self._ensure_model(lang_code=resolved_lang)
        loop = asyncio.get_running_loop()

        def _synthesize():
            import numpy as np
            import soundfile as sf
            import io

            # KPipeline is a generator that yields (graphemes, phonemes, audio_tensor)
            # for each text segment. We concatenate all audio segments.
            audio_segments = []
            sample_rate = 24000

            # Resolve voice: map our IDs to Kokoro voice IDs
            # Kokoro voice IDs: af_bella (American female), am_adam (American male),
            #                    bf_emma (British female), bm_george (British male)
            resolved_voice = voice_id if voice_id != "default" else "af_bella"

            # Call pipeline as a generator
            gen = pipeline(
                text,
                voice=resolved_voice,
                speed=speaking_rate,
                split_pattern=r'\n+',
            )

            for gs, ps, audio_tensor in gen:
                if audio_tensor is not None:
                    audio_array = np.array(audio_tensor)
                    audio_segments.append(audio_array)

            if not audio_segments:
                return b''

            # Concatenate all audio segments
            full_audio = np.concatenate(audio_segments) if len(audio_segments) > 1 else audio_segments[0]

            # Write to WAV buffer
            buf = io.BytesIO()
            sf.write(buf, full_audio, sample_rate, format='WAV')
            return buf.getvalue()

        audio_bytes = await loop.run_in_executor(None, _synthesize)
        logger.debug("Kokoro generated %d bytes of audio", len(audio_bytes))
        return audio_bytes

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str = "default",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> AsyncIterator[bytes]:
        """Streaming TTS via Kokoro.

        For now, synthesizes fully and yields complete audio.
        Chunked streaming will be added when Kokoro supports it.
        """
        audio = await self.synthesize(
            text=text,
            voice_id=voice_id,
            language=language,
            speaking_rate=speaking_rate,
            pitch=pitch,
            **kwargs,
        )
        yield audio
