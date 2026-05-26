"""
XTTS TTS Provider — Real implementation using Coqui XTTS for fully local inference.

Supports:
- Fully local TTS via Coqui XTTS-v2
- Voice cloning from audio samples
- Multi-language support (English, Hindi, Spanish, etc.)
- No external API dependencies
- GPU-accelerated inference when available

Requires: pip install TTS
Model: XTTS-v2 is downloaded on first use (~1.8GB)
"""

import asyncio
import logging
import os
import tempfile
from typing import AsyncIterator

from app.providers.base import TTSProvider

logger = logging.getLogger("voiceai.tts.xtts")

# Shared thread pool executor for CPU/GPU-bound TTS operations
_thread_pool = None


def _get_thread_pool():
    global _thread_pool
    if _thread_pool is None:
        import concurrent.futures
        _thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    return _thread_pool


class XTTSTTSProvider(TTSProvider):
    """Text-to-Speech using Coqui XTTS for fully local inference.

    Lazy-loads the XTTS model on first use. The model is ~1.8GB
    and will be downloaded automatically on first inference.

    Usage:
        provider = XTTSTTSProvider()
        audio = await provider.synthesize("Hello, how can I help you?")

    Requires: pip install TTS
    Model: XTTS-v2 (automatic download)
    """

    def __init__(
        self,
        model_name: str = "tts_models/multilingual/multi-dataset/xtts_v2",
        device: str = "cpu",
        speaker_sample: str | None = None,
    ):
        self._model_name = model_name
        self._device = device
        self._speaker_sample = speaker_sample  # Path to a speaker audio sample for voice cloning
        self._model = None
        self._model_lock = asyncio.Lock()

    async def _ensure_model(self):
        """Lazy-load the XTTS model in a thread to avoid blocking the event loop."""
        if self._model is not None:
            return self._model

        async with self._model_lock:
            if self._model is not None:
                return self._model

            loop = asyncio.get_running_loop()

            def _load():
                try:
                    from TTS.api import TTS
                except ImportError:
                    raise ImportError(
                        "XTTS requires the TTS package. Install with: pip install TTS\n"
                        "Note: TTS has system dependencies. See: https://github.com/coqui-ai/TTS"
                    )

                logger.info(
                    "Loading XTTS model '%s' on %s (this may take a minute on first run)...",
                    self._model_name,
                    self._device,
                )

                tts = TTS(self._model_name, device=self._device)
                logger.info("XTTS model loaded successfully on %s", self._device)
                return tts

            self._model = await loop.run_in_executor(
                _get_thread_pool(),
                _load,
            )
            return self._model

    @property
    def provider_name(self) -> str:
        return "xtts"

    @property
    def supports_streaming(self) -> bool:
        return False  # XTTS v2 doesn't support true streaming

    @property
    def supported_voices(self) -> list[dict]:
        return [
            {"id": "default", "name": "Default Voice (multi-language)", "language": "multi"},
            {"id": "custom", "name": "Voice Cloned from Sample", "language": "multi"},
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
        """Synthesize text to speech using local XTTS inference.

        Args:
            text: Text to synthesize
            voice_id: Voice ID ('default' or 'custom' for cloned voice)
            language: Language code ('en', 'hi', 'es', 'fr', etc.)
            speaking_rate: Speed multiplier (not directly supported by XTTS)
            pitch: Pitch adjustment (not directly supported by XTTS)

        Returns:
            WAV audio bytes
        """
        model = await self._ensure_model()
        loop = asyncio.get_running_loop()

        # Map language codes to XTTS format
        lang_map = {
            "en": "en",
            "hi": "hi",
            "es": "es",
            "fr": "fr",
            "de": "de",
            "pt": "pt",
            "it": "it",
            "pl": "pl",
            "tr": "tr",
            "ru": "ru",
            "nl": "nl",
            "cz": "cs",
            "ar": "ar",
            "zh": "zh-cn",
            "ja": "ja",
            "ko": "ko",
        }
        xtts_lang = lang_map.get(language, "en")

        # Check if language is supported by the loaded model
        supported_langs = getattr(model, "languages", None)
        if supported_langs and xtts_lang not in supported_langs:
            logger.warning(
                "Language '%s' not in XTTS supported languages (%s). Falling back to 'en'.",
                language,
                supported_langs,
            )
            xtts_lang = "en"

        logger.debug(
            "XTTS synthesizing %d chars (lang=%s, voice=%s)",
            len(text),
            xtts_lang,
            voice_id,
        )

        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            output_path = tmp.name

        try:
            def _synthesize():
                if voice_id == "custom" and self._speaker_sample:
                    # Use voice cloning from speaker sample
                    model.tts_to_file(
                        text=text,
                        speaker_wav=self._speaker_sample,
                        language=xtts_lang,
                        file_path=output_path,
                    )
                else:
                    # Use default speaker
                    model.tts_to_file(
                        text=text,
                        language=xtts_lang,
                        file_path=output_path,
                    )

            await loop.run_in_executor(
                _get_thread_pool(),
                _synthesize,
            )

            with open(output_path, "rb") as f:
                audio_bytes = f.read()

            logger.debug("XTTS generated %d bytes of audio", len(audio_bytes))
            return audio_bytes

        finally:
            try:
                os.unlink(output_path)
            except OSError:
                pass

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str = "default",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> AsyncIterator[bytes]:
        """Streaming is not supported by XTTS v2.

        Falls back to full synthesis and yields the complete audio.
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

    async def set_speaker_sample(self, audio_path: str) -> None:
        """Set a speaker audio sample for voice cloning.

        Args:
            audio_path: Path to a WAV/MP3 file with the target voice
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Speaker sample not found: {audio_path}")
        self._speaker_sample = audio_path
        logger.info("XTTS speaker sample set to: %s", audio_path)
