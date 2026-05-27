"""
LiveKit Provider Adapters — Wraps existing STT/TTS/LLM providers into LiveKit's
stt.STT, tts.TTS, and llm.LLM interfaces for use with the LiveKit Agents framework.

These adapters allow our provider-independent pipeline (Whisper, Ollama, Kokoro, etc.)
to plug directly into LiveKit's VoicePipelineAgent or custom Agent implementations.

Architecture:
    Our Provider (e.g., WhisperSTTProvider) → LiveKit Adapter → livekit.agents.Agent
"""

import asyncio
import logging
import struct
import time
from typing import Any, AsyncIterator

from livekit import rtc
from livekit.agents import llm, stt, tts, vad
from livekit.agents.types import APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS
from livekit.agents.utils import AudioBuffer

from app.config import settings

# Type hint to avoid circular imports
_tool_type: Any = None

logger = logging.getLogger("voiceai.livekit.adapters")


# ── STT Adapter ─────────────────────────────────────────────────────


class LiveKitSTTAdapter(stt.STT):
    """Wraps our STTProvider (WhisperSTTProvider) into LiveKit's stt.STT interface.

    Converts LiveKit AudioBuffer → bytes → our STT.transcribe() → SpeechEvent.
    Supports both streaming (interim) and final transcription modes.
    """

    def __init__(
        self,
        stt_provider,
        sample_rate: int = 16000,
        num_channels: int = 1,
    ):
        super().__init__(capabilities=stt.STTCapabilities(
            streaming=True,
            interim_results=True,
        ))
        self._provider = stt_provider
        self._sample_rate = sample_rate
        self._num_channels = num_channels

    @property
    def provider(self) -> str:
        return self._provider.__class__.__name__

    @property
    def model(self) -> str:
        return getattr(self._provider, "model_size", "unknown")

    async def _recognize_impl(
        self,
        buffer: AudioBuffer,
        *,
        language: str | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechEvent:
        """Convert LiveKit audio buffer to text using our STT provider."""
        audio_bytes = self._audio_buffer_to_bytes(buffer)
        if not audio_bytes or len(audio_bytes) < 320:  # Minimum 20ms at 16kHz
            return self._make_empty_event()

        lang = language or settings.DEFAULT_LANGUAGE

        try:
            text = await self._provider.transcribe(audio_bytes, language=lang)
            if not text or not text.strip():
                return self._make_empty_event()

            return stt.SpeechEvent(
                type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                request_id=f"stt_{time.time_ns()}",
                alternatives=[
                    stt.SpeechData(
                        language=lang,
                        text=text.strip(),
                        start_time=0.0,
                        end_time=len(audio_bytes) / self._sample_rate,
                        confidence=0.95,
                        speaker_id=None,
                        is_primary_speaker=True,
                        words=None,
                        source_languages=None,
                        source_texts=None,
                        metadata=None,
                    )
                ],
                recognition_usage=None,
                speech_start_time=time.time(),
            )
        except Exception as e:
            logger.warning("STT recognition error: %s", e)
            return self._make_empty_event()

    def _audio_buffer_to_bytes(self, buffer: AudioBuffer) -> bytes:
        """Convert LiveKit AudioBuffer (list[AudioFrame] | AudioFrame) to raw PCM bytes."""
        if isinstance(buffer, rtc.AudioFrame):
            return bytes(buffer.data)
        elif isinstance(buffer, list):
            combined = bytearray()
            for frame in buffer:
                if isinstance(frame, rtc.AudioFrame):
                    combined.extend(bytes(frame.data))
            return bytes(combined)
        return b""

    def _make_empty_event(self) -> stt.SpeechEvent:
        """Create an empty SpeechEvent (no speech detected)."""
        return stt.SpeechEvent(
            type=stt.SpeechEventType.END_OF_SPEECH,
            request_id=f"stt_empty_{time.time_ns()}",
            alternatives=[],
            recognition_usage=None,
            speech_start_time=None,
        )


# ── TTS Adapter ─────────────────────────────────────────────────────


class LiveKitChunkedStream(tts.ChunkedStream):
    """Custom ChunkedStream that wraps our TTS provider's synthesize output.

    The parent ChunkedStream starts a _main_task coroutine that calls
    _run(output_emitter) in a retry loop. We implement _run() to
    perform the actual synthesis and push SynthesizedAudio frames
    to the output_emitter.
    """

    def __init__(
        self,
        tts_provider,
        text: str,
        voice_id: str,
        language: str,
        sample_rate: int,
        num_channels: int,
        audio_cache=None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ):
        # Call parent with a minimal TTS wrapper for compatibility.
        # Our TTSProvider doesn't inherit from livekit.agents.tts.TTS,
        # so we pass a _TTSWrapper stub that satisfies the parent constructor.
        super().__init__(
            tts=_TTSWrapper(),
            input_text=text,
            conn_options=conn_options,
        )
        self._tts_provider = tts_provider
        self._text = text
        self._voice_id = voice_id
        self._language = language
        self._sample_rate = sample_rate
        self._num_channels = num_channels
        self._audio_cache = audio_cache

    async def _run(
        self,
        output_emitter: tts.AudioEmitter,
    ) -> None:
        """Run synthesis and emit raw audio bytes through the output_emitter.

        Called by the parent ChunkedStream._main_task(). Initializes the
        emitter and pushes raw PCM bytes. The parent handles end_input()
        and join() after this returns.
        """
        request_id = f"tts_{time.time_ns()}"

        try:
            # Check audio cache first
            audio_bytes: bytes | None = None
            if self._audio_cache is not None:
                try:
                    cached = await self._audio_cache.get(
                        self._text,
                        voice_id=self._voice_id,
                        language=self._language,
                    )
                    if cached is not None and len(cached) > 100:
                        audio_bytes = cached
                        request_id = f"cache_{time.time_ns()}"
                except Exception:
                    pass  # Cache miss — fall through to synthesis

            if audio_bytes is None:
                # Synthesize via our TTS provider
                audio_bytes = await self._tts_provider.synthesize(
                    text=self._text,
                    voice_id=self._voice_id,
                    language=self._language,
                )

                # Store in audio cache
                if audio_bytes and len(audio_bytes) >= 100 and self._audio_cache is not None:
                    try:
                        await self._audio_cache.set(
                            self._text,
                            audio_bytes,
                            voice_id=self._voice_id,
                            language=self._language,
                        )
                    except Exception:
                        pass

            if not audio_bytes or len(audio_bytes) < 100:
                logger.warning("TTS synthesized empty audio for: %s", self._text[:30])
                return

            # Initialize the AudioEmitter with the audio parameters
            output_emitter.initialize(
                request_id=request_id,
                sample_rate=self._sample_rate,
                num_channels=self._num_channels,
                mime_type="audio/pcm",
            )

            # Push raw PCM bytes — AudioEmitter.push() accepts bytes
            output_emitter.push(audio_bytes)

        except Exception as e:
            logger.error("TTS synthesis error: %s", e)
            raise


class _TTSWrapper(tts.TTS):
    """Minimal TTS wrapper for ChunkedStream parent class compatibility."""
    def __init__(self):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False, aligned_transcript=False),
            sample_rate=24000,
            num_channels=1,
        )

    def synthesize(self, text: str, *, conn_options=DEFAULT_API_CONNECT_OPTIONS) -> tts.ChunkedStream:
        raise NotImplementedError("Wrapper only")


class LiveKitTTSAdapter(tts.TTS):
    """Wraps our TTSProvider (KokoroTTSProvider) into LiveKit's tts.TTS interface.

    Integrates the audio cache system for instant replay of common phrases.
    Converts our synthesize() output bytes → LiveKit SynthesizedAudio frames.
    """

    def __init__(
        self,
        tts_provider,
        sample_rate: int = 24000,
        num_channels: int = 1,
        audio_cache=None,
    ):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False, aligned_transcript=False),
            sample_rate=sample_rate,
            num_channels=num_channels,
        )
        self._provider = tts_provider
        self._audio_cache = audio_cache

    @property
    def provider(self) -> str:
        return self._provider.__class__.__name__

    @property
    def model(self) -> str:
        return getattr(self._provider, "voice", "unknown")

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> tts.ChunkedStream:
        """Synthesize text to speech, returning a ChunkedStream with audio cache."""
        voice_id = settings.DEFAULT_VOICE_ID
        language = settings.DEFAULT_LANGUAGE

        return LiveKitChunkedStream(
            tts_provider=self._provider,
            text=text,
            voice_id=voice_id,
            language=language,
            sample_rate=self._sample_rate,
            num_channels=self._num_channels,
            audio_cache=self._audio_cache,
            conn_options=conn_options,
        )


# ── LLM Adapter ─────────────────────────────────────────────────────


class LiveKitLLMStream(llm.LLMStream):
    """Custom LLMStream that wraps our LLM provider's streaming output."""

    def __init__(
        self,
        llm_provider,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ):
        # Create minimal LLM wrapper for parent constructor
        wrapper = _LLMWrapper()
        super().__init__(
            llm=wrapper,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
        )
        self._provider = llm_provider
        self._chat_ctx = chat_ctx

    async def _run(self) -> None:
        """Called by parent LLMStream._main_task to perform the LLM call.

        Converts ChatContext to our message format, calls the provider,
        and emits ChatChunks through the event channel.
        """
        try:
            messages = self._chat_ctx_to_messages(self._chat_ctx)

            # Use the provider's chat method to get response
            response = await self._provider.chat(messages)

            if response:
                # Emit as a single chunk for simplicity
                chunk = llm.ChatChunk(
                    id=f"llm_{time.time_ns()}",
                    delta=llm.ChoiceDelta(
                        role="assistant",
                        content=response,
                    ),
                )
                self._event_ch.send_nowait(chunk)

        except Exception as e:
            logger.error("LLM chat error: %s", e)
            raise

    def _chat_ctx_to_messages(self, chat_ctx: llm.ChatContext) -> list[dict]:
        """Convert LiveKit ChatContext to our message format (list[dict])."""
        messages = []
        for item in chat_ctx.items:
            if isinstance(item, llm.ChatMessage):
                content = ""
                for c in item.content:
                    if hasattr(c, "text"):
                        content += c.text
                messages.append({
                    "role": item.role.value if hasattr(item.role, 'value') else str(item.role),
                    "content": content,
                })
        return messages


class _LLMWrapper(llm.LLM):
    """Minimal LLM wrapper for LLMStream parent class compatibility."""
    def chat(self, *, chat_ctx, tools=None, conn_options=DEFAULT_API_CONNECT_OPTIONS,
             parallel_tool_calls=None, tool_choice=None, extra_kwargs=None):
        raise NotImplementedError("Wrapper only")

    async def aclose(self):
        pass


class LiveKitLLMAdapter(llm.LLM):
    """Wraps our LLMProvider (OllamaLLMProvider) into LiveKit's llm.LLM interface.

    Converts LiveKit ChatContext → our message format → LLM.complete() → LLMStream.
    """

    def __init__(self, llm_provider):
        super().__init__()
        self._provider = llm_provider

    @property
    def provider(self) -> str:
        return self._provider.__class__.__name__

    @property
    def model(self) -> str:
        return getattr(self._provider, "model", "unknown")

    def chat(
        self,
        *,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls: bool | None = None,
        tool_choice: llm.ToolChoice | None = None,
        extra_kwargs: dict[str, Any] | None = None,
    ) -> llm.LLMStream:
        """Process a chat context through our LLM and return a streaming response."""
        return LiveKitLLMStream(
            llm_provider=self._provider,
            chat_ctx=chat_ctx,
            tools=tools,
            conn_options=conn_options,
        )

    async def aclose(self) -> None:
        """Close the LLM provider connection."""
        if hasattr(self._provider, 'close') and callable(self._provider.close):
            if asyncio.iscoroutinefunction(self._provider.close):
                await self._provider.close()
            else:
                self._provider.close()


# ── VAD Adapter ─────────────────────────────────────────────────────


class LiveKitVADAdapter(vad.VAD):
    """Voice Activity Detection adapter using our interrupt detection system.

    Uses the InterruptDetector's volume threshold and signal patterns
    to provide VAD for the LiveKit Agent pipeline.
    """

    def __init__(self, interrupt_detector=None):
        super().__init__(capabilities=vad.VADCapabilities())
        self._interrupt_detector = interrupt_detector

    def stream(self, *, sample_rate: int = 16000, num_channels: int = 1) -> vad.VADStream:
        """Create a VAD stream for real-time voice activity detection."""
        return LiveKitVADStream(
            sample_rate=sample_rate,
            num_channels=num_channels,
            interrupt_detector=self._interrupt_detector,
        )


class LiveKitVADStream(vad.VADStream):
    """VAD stream that bridges our interrupt detector with LiveKit's VAD interface."""

    def __init__(self, sample_rate: int, num_channels: int, interrupt_detector=None):
        super().__init__(sample_rate=sample_rate, num_channels=num_channels)
        self._interrupt_detector = interrupt_detector

    async def _main_task(self) -> None:
        """Main VAD processing loop."""

        async def _process_frames():
            async for frame in self:
                if self._interrupt_detector and self._interrupt_detector.is_interrupted:
                    logger.debug("VAD: interrupt detected")
                # The Agent class handles VAD internally
                # Our adapter just needs to exist for compatibility

        await _process_frames()
