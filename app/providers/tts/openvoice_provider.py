"""
OpenVoice TTS Provider — Voice cloning TTS via OpenVoice v2.

OpenVoice v2 architecture uses two models:
1. BaseSpeakerTTS — generates base audio from text (via MeloTTS)
2. ToneColorConverter — transfers the tone color from a reference audio

OpenVoice enables:
- Voice cloning from short audio samples
- Emotion/style control via parameters
- Multi-language support
- Fully local inference

Reference: https://github.com/myshell-ai/OpenVoice
"""

import asyncio
import logging
import os
import tempfile
from typing import AsyncIterator

from app.providers.base import TTSProvider

logger = logging.getLogger("voiceai.tts.openvoice")


class OpenVoiceTTSProvider(TTSProvider):
    """Text-to-Speech using OpenVoice v2 for voice cloning.

    Uses the two-stage architecture:
    1. BaseSpeakerTTS generates initial audio from text
    2. ToneColorConverter transfers voice characteristics from a reference

    Requires: Clone from https://github.com/myshell-ai/OpenVoice.git
    and install checkpoints from HuggingFace (myshell-ai/OpenVoice)
    """

    def __init__(
        self,
        base_speaker_path: str | None = None,
        converter_path: str | None = None,
        device: str = "cpu",
        speaker_sample: str | None = None,
    ):
        self._base_speaker_path = base_speaker_path
        self._converter_path = converter_path
        self._device = device
        self._speaker_sample = speaker_sample
        self._tts_model = None
        self._tone_converter = None
        self._model_lock = asyncio.Lock()

    async def _ensure_model(self):
        """Lazy-load the OpenVoice BaseSpeakerTTS and ToneColorConverter."""
        if self._tts_model is not None and self._tone_converter is not None:
            return self._tts_model, self._tone_converter

        async with self._model_lock:
            if self._tts_model is not None and self._tone_converter is not None:
                return self._tts_model, self._tone_converter

            loop = asyncio.get_running_loop()

            def _load():
                try:
                    from openvoice import BaseSpeakerTTS, ToneColorConverter
                except ImportError:
                    raise ImportError(
                        "OpenVoice requires the openvoice package. "
                        "Clone from: https://github.com/myshell-ai/OpenVoice.git "
                        "and run: pip install -e ."
                    )

                # Resolve checkpoint paths
                ckpt_base = self._base_speaker_path or "checkpoints/base_speakers/EN"
                ckpt_converter = self._converter_path or "checkpoints/converter"

                logger.info(
                    "Loading OpenVoice models on %s...\n  BaseSpeaker: %s\n  Converter: %s",
                    self._device, ckpt_base, ckpt_converter,
                )

                tts_model = BaseSpeakerTTS(
                    f"{ckpt_base}/config.json", device=self._device
                )
                tts_model.load_ckpt(f"{ckpt_base}/checkpoint.pth")

                tone_converter = ToneColorConverter(
                    f"{ckpt_converter}/config.json", device=self._device
                )
                tone_converter.load_ckpt(f"{ckpt_converter}/checkpoint.pth")

                logger.info("OpenVoice models loaded successfully")
                return tts_model, tone_converter

            self._tts_model, self._tone_converter = await loop.run_in_executor(
                None, _load
            )
            return self._tts_model, self._tone_converter

    @property
    def provider_name(self) -> str:
        return "openvoice"

    @property
    def supports_streaming(self) -> bool:
        return False

    @property
    def supported_voices(self) -> list[dict]:
        return [
            {"id": "default", "name": "Default Voice", "language": "multi"},
            {"id": "cloned", "name": "Voice Cloned from Sample", "language": "multi"},
        ]

    async def set_speaker_sample(self, audio_path: str) -> None:
        """Set a speaker audio sample for voice cloning."""
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Speaker sample not found: {audio_path}")
        self._speaker_sample = audio_path
        logger.info("OpenVoice speaker sample set to: %s", audio_path)

    async def synthesize(
        self,
        text: str,
        voice_id: str = "default",
        language: str = "en",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        **kwargs,
    ) -> bytes:
        """Synthesize text to speech using OpenVoice v2.

        Two-stage process:
        1. BaseSpeakerTTS generates raw audio from text
        2. ToneColorConverter transfers voice style from reference (if voice_id='cloned')

        Args:
            text: Text to synthesize
            voice_id: Voice ID ('default' or 'cloned')
            language: Language code
            speaking_rate: Speed multiplier
            pitch: Pitch adjustment in semitones

        Returns:
            WAV audio bytes
        """
        tts_model, tone_converter = await self._ensure_model()
        loop = asyncio.get_running_loop()

        def _synthesize():
            import soundfile as sf

            emotion = kwargs.get("emotion", "neutral")
            style = kwargs.get("style", 1.0)

            import uuid
            tmp_wav = os.path.join(
                tempfile.gettempdir(), f"openvoice_base_{uuid.uuid4().hex}.wav"
            )
            cloned_wav = None
            try:
                # Map language codes to OpenVoice expected names
                lang_map = {
                    "en": "English",
                    "zh": "Chinese",
                    "jp": "Japanese",
                    "kr": "Korean",
                    "es": "Spanish",
                    "fr": "French",
                }
                ov_lang = lang_map.get(language, "English")

                tts_model.tts(
                    text=text,
                    output_path=tmp_wav,
                    speaker="default",
                    language=ov_lang,
                )

                if voice_id == "cloned" and self._speaker_sample:
                    # Stage 2: Convert tone color using reference audio
                    from openvoice.se_extractor import get_se

                    cloned_wav = os.path.join(
                        tempfile.gettempdir(),
                        f"openvoice_cloned_{uuid.uuid4().hex}.wav"
                    )

                    target_se, _ = get_se(
                        self._speaker_sample,
                        tone_converter,
                        target_dir=tempfile.gettempdir(),
                    )

                    tone_converter.convert(
                        audio_src_path=tmp_wav,
                        src_se=None,
                        tgt_se=target_se,
                        output_path=cloned_wav,
                        message="@MyShell",
                    )

                    with open(cloned_wav, "rb") as f:
                        return f.read()
                else:
                    # Use default voice
                    with open(tmp_wav, "rb") as f:
                        return f.read()
            finally:
                paths_to_clean = [tmp_wav]
                if cloned_wav:
                    paths_to_clean.append(cloned_wav)
                for path in paths_to_clean:
                    try:
                        os.unlink(path)
                    except OSError:
                        pass

        audio_bytes = await loop.run_in_executor(None, _synthesize)
        logger.debug("OpenVoice generated %d bytes of audio", len(audio_bytes))
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
        """Streaming is not supported by OpenVoice.

        Falls back to full synthesis and yields complete audio.
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
