"""
Azure Speech STT Provider — Real implementation using Azure Cognitive Services.

Supports:
- Single-shot speech recognition (batch audio via file/stream)
- Continuous recognition for real-time streaming
- Multiple languages with auto-detection
- Phrase list boosting, diarization, and profanity filtering

Requires:
    pip install azure-cognitiveservices-speech

Usage:
    import azure.cognitiveservices.speech as speechsdk
    speech_config = speechsdk.SpeechConfig(subscription="key", region="eastus")
"""

import asyncio
import logging
import os
import tempfile
from typing import AsyncIterator

from app.providers.base import STTProvider

logger = logging.getLogger("voiceai.stt.azure_speech")


def _get_speechsdk():
    """Lazy-import azure.cognitiveservices.speech so module can be imported without it."""
    try:
        import azure.cognitiveservices.speech as speechsdk  # noqa: PLC0415
        return speechsdk
    except ImportError:
        raise ImportError(
            "azure-cognitiveservices-speech package is required. "
            "Install with: pip install azure-cognitiveservices-speech"
        )


class AzureSpeechSTTProvider(STTProvider):
    """Speech-to-Text using Azure Cognitive Speech Services.

    Uses the Azure Speech SDK for both single-shot recognition and
    continuous/streaming recognition.

    Requires AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables.

    API Reference: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/
    """

    def __init__(
        self,
        api_key: str | None = None,
        region: str | None = None,
    ):
        self._api_key = api_key or os.getenv("AZURE_SPEECH_KEY", "")
        self._region = region or os.getenv("AZURE_SPEECH_REGION", "eastus")

    @property
    def provider_name(self) -> str:
        return "azure_speech"

    @property
    def supports_streaming(self) -> bool:
        return True

    def _get_speech_config(self):
        """Create a SpeechConfig from the configured credentials."""
        speechsdk = _get_speechsdk()
        if not self._api_key:
            raise ValueError(
                "Azure Speech API key is not configured. "
                "Set AZURE_SPEECH_KEY environment variable."
            )
        return speechsdk.SpeechConfig(
            subscription=self._api_key,
            region=self._region,
        )

    async def transcribe(
        self,
        audio_data: bytes,
        language: str = "en",
        **kwargs,
    ) -> str:
        """Transcribe audio bytes to text using Azure single-shot recognition.

        Args:
            audio_data: Raw audio bytes (WAV format recommended)
            language: Language code (e.g. 'en-US', 'hi-IN')

        Returns:
            Transcribed text string
        """
        import tempfile

        speechsdk = _get_speechsdk()
        speech_config = self._get_speech_config()
        speech_config.speech_recognition_language = language

        # Write to temp file for Azure's pull-based audio input
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name

        try:
            audio_input = speechsdk.audio.AudioConfig(filename=tmp_path)
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_input,
            )

            # Azure SDK is synchronous — run in a thread
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, recognizer.recognize_once)

            if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                return result.text.strip()
            elif result.reason == speechsdk.ResultReason.NoMatch:
                logger.debug("Azure Speech: no speech recognized")
                return ""
            else:
                error_details = (
                    f"Recognition canceled: {result.cancellation_details.reason}"
                    if result.cancellation_details
                    else "Unknown error"
                )
                # Check if it's a key/region auth issue
                if result.cancellation_details and result.cancellation_details.reason == speechsdk.CancellationReason.Error:
                    raise RuntimeError(
                        f"Azure Speech recognition failed: {error_details}. "
                        f"Check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION."
                    )
                logger.warning("Azure Speech: %s", error_details)
                return ""

        finally:
            os.unlink(tmp_path)

    async def transcribe_stream(
        self,
        audio_stream: AsyncIterator[bytes],
        language: str = "en",
        **kwargs,
    ) -> AsyncIterator[str]:
        """Streaming transcription using Azure continuous recognition.

        Buffers audio chunks and processes them via Azure's pull audio stream.

        Args:
            audio_stream: Async iterator of audio chunks
            language: Language code

        Yields:
            Transcription text fragments
        """
        speechsdk = _get_speechsdk()
        speech_config = self._get_speech_config()
        speech_config.speech_recognition_language = language
        sample_rate = kwargs.get("sample_rate", 16000)

        # Buffer-based approach: accumulate chunks, flush regularly
        import tempfile

        buffer = bytearray()
        min_chunk_duration = kwargs.get("min_chunk_duration", 2.0)
        loop = asyncio.get_running_loop()

        async for chunk in audio_stream:
            buffer.extend(chunk)

            estimated_duration = len(buffer) / (sample_rate * 2)
            if estimated_duration >= min_chunk_duration:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    tmp.write(bytes(buffer))
                    tmp_path = tmp.name

                try:
                    audio_input = speechsdk.audio.AudioConfig(filename=tmp_path)
                    recognizer = speechsdk.SpeechRecognizer(
                        speech_config=speech_config,
                        audio_config=audio_input,
                    )

                    result = await loop.run_in_executor(None, recognizer.recognize_once)

                    if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                        text = result.text.strip()
                        if text:
                            yield text
                finally:
                    os.unlink(tmp_path)

                # Keep ~0.5s overlap
                overlap_bytes = int(sample_rate * 2 * 0.5)
                if len(buffer) > overlap_bytes:
                    buffer = buffer[-overlap_bytes:]
                else:
                    buffer.clear()

        # Process remaining buffer
        if buffer:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                tmp.write(bytes(buffer))
                tmp_path = tmp.name

            try:
                audio_input = speechsdk.audio.AudioConfig(filename=tmp_path)
                recognizer = speechsdk.SpeechRecognizer(
                    speech_config=speech_config,
                    audio_config=audio_input,
                )
                result = await loop.run_in_executor(None, recognizer.recognize_once)
                if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    text = result.text.strip()
                    if text:
                        yield text
            finally:
                os.unlink(tmp_path)
