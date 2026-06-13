"""
LiveKit Provider Adapters — Wraps existing STT/TTS/LLM providers into LiveKit's interfaces.
"""

import asyncio
import logging
import time

from livekit import rtc
from livekit.agents import llm, stt, tts, vad
from livekit.agents.types import APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS
from livekit.agents.utils import AudioBuffer

from app.config import settings

logger = logging.getLogger("ai_sales_agent.livekit.adapters")


class LiveKitSTTAdapter(stt.STT):
    """Wraps our STTProvider into LiveKit's stt.STT interface."""

    def __init__(self, stt_provider, sample_rate: int = 16000, num_channels: int = 1):
        super().__init__(capabilities=stt.STTCapabilities(streaming=True, interim_results=True))
        self._provider = stt_provider
        self._sample_rate = sample_rate
        self._num_channels = num_channels

    async def _recognize_impl(self, buffer: AudioBuffer, *, language: str | None = None, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS) -> stt.SpeechEvent:
        audio_bytes = self._audio_buffer_to_bytes(buffer)
        if not audio_bytes or len(audio_bytes) < 320:
            return self._make_empty_event()
        lang = language or settings.DEFAULT_LANGUAGE
        try:
            text = await self._provider.transcribe(audio_bytes, language=lang)
            if not text or not text.strip():
                return self._make_empty_event()
            return stt.SpeechEvent(type=stt.SpeechEventType.FINAL_TRANSCRIPT, request_id=f"stt_{time.time_ns()}", alternatives=[stt.SpeechData(language=lang, text=text.strip(), start_time=0.0, end_time=len(audio_bytes) / self._sample_rate, confidence=0.95)])
        except Exception as e:
            logger.warning("STT error: %s", e)
            return self._make_empty_event()

    def _audio_buffer_to_bytes(self, buffer: AudioBuffer) -> bytes:
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
        return stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH, request_id=f"stt_empty_{time.time_ns()}", alternatives=[])


class LiveKitChunkedStream(tts.ChunkedStream):
    """Custom ChunkedStream wrapping our TTS provider."""

    def __init__(self, tts_provider, text: str, voice_id: str, language: str, sample_rate: int, num_channels: int, audio_cache=None, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS):
        super().__init__(tts=_TTSWrapper(), input_text=text, conn_options=conn_options)
        self._tts_provider = tts_provider
        self._text = text
        self._voice_id = voice_id
        self._language = language
        self._sample_rate = sample_rate
        self._num_channels = num_channels
        self._audio_cache = audio_cache

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        request_id = f"tts_{time.time_ns()}"
        try:
            audio_bytes = None
            if self._audio_cache is not None:
                try:
                    cached = await self._audio_cache.get(self._text, voice_id=self._voice_id, language=self._language)
                    if cached and len(cached) > 100:
                        audio_bytes = cached
                except Exception:
                    pass
            if audio_bytes is None:
                audio_bytes = await self._tts_provider.synthesize(text=self._text, voice_id=self._voice_id, language=self._language)
                if audio_bytes and len(audio_bytes) >= 100 and self._audio_cache is not None:
                    try:
                        await self._audio_cache.set(self._text, audio_bytes, voice_id=self._voice_id, language=self._language)
                    except Exception:
                        pass
            if not audio_bytes or len(audio_bytes) < 100:
                return
            output_emitter.initialize(request_id=request_id, sample_rate=self._sample_rate, num_channels=self._num_channels, mime_type="audio/pcm")
            output_emitter.push(audio_bytes)
        except Exception as e:
            logger.error("TTS synthesis error: %s", e)


class _TTSWrapper(tts.TTS):
    def __init__(self):
        super().__init__(capabilities=tts.TTSCapabilities(streaming=False, aligned_transcript=False), sample_rate=24000, num_channels=1)

    def synthesize(self, text: str, *, conn_options=DEFAULT_API_CONNECT_OPTIONS) -> tts.ChunkedStream:
        raise NotImplementedError("Wrapper only")


class LiveKitTTSAdapter(tts.TTS):
    """Wraps our TTSProvider into LiveKit's tts.TTS interface."""

    def __init__(self, tts_provider, sample_rate: int = 24000, num_channels: int = 1, audio_cache=None):
        super().__init__(capabilities=tts.TTSCapabilities(streaming=False, aligned_transcript=False), sample_rate=sample_rate, num_channels=num_channels)
        self._provider = tts_provider
        self._audio_cache = audio_cache

    def synthesize(self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS) -> tts.ChunkedStream:
        voice_id = settings.DEFAULT_VOICE_ID
        language = settings.DEFAULT_LANGUAGE
        return LiveKitChunkedStream(tts_provider=self._provider, text=text, voice_id=voice_id, language=language, sample_rate=self._sample_rate, num_channels=self._num_channels, audio_cache=self._audio_cache, conn_options=conn_options)


class LiveKitLLMStream(llm.LLMStream):
    """Custom LLMStream wrapping our LLM provider's output."""

    def __init__(self, llm_provider, chat_ctx: llm.ChatContext, tools: list[llm.Tool] | None = None, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS):
        super().__init__(llm=_LLMWrapper(), chat_ctx=chat_ctx, tools=tools or [], conn_options=conn_options)
        self._provider = llm_provider
        self._chat_ctx = chat_ctx

    async def _run(self) -> None:
        try:
            messages = self._chat_ctx_to_messages(self._chat_ctx)
            response = await self._provider.complete(messages)
            if response:
                chunk = llm.ChatChunk(id=f"llm_{time.time_ns()}", delta=llm.ChoiceDelta(role="assistant", content=response))
                self._event_ch.send_nowait(chunk)
        except Exception as e:
            logger.error("LLM error: %s", e)

    def _chat_ctx_to_messages(self, chat_ctx: llm.ChatContext) -> list[dict]:
        messages = []
        for item in chat_ctx.items:
            if isinstance(item, llm.ChatMessage):
                content = ""
                for c in item.content:
                    if hasattr(c, "text"):
                        content += c.text
                messages.append({"role": item.role.value if hasattr(item.role, 'value') else str(item.role), "content": content})
        return messages


class _LLMWrapper(llm.LLM):
    def chat(self, *, chat_ctx, tools=None, conn_options=DEFAULT_API_CONNECT_OPTIONS, parallel_tool_calls=None, tool_choice=None, extra_kwargs=None):
        raise NotImplementedError("Wrapper only")

    async def aclose(self):
        pass


class LiveKitLLMAdapter(llm.LLM):
    """Wraps our LLMProvider into LiveKit's llm.LLM interface."""

    def __init__(self, llm_provider):
        super().__init__()
        self._provider = llm_provider

    def chat(self, *, chat_ctx: llm.ChatContext, tools: list[llm.Tool] | None = None, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS, parallel_tool_calls: bool | None = None, tool_choice: llm.ToolChoice | None = None, extra_kwargs: dict | None = None) -> llm.LLMStream:
        return LiveKitLLMStream(llm_provider=self._provider, chat_ctx=chat_ctx, tools=tools, conn_options=conn_options)

    async def aclose(self) -> None:
        if hasattr(self._provider, 'close') and callable(self._provider.close):
            if asyncio.iscoroutinefunction(self._provider.close):
                await self._provider.close()
            else:
                self._provider.close()


class LiveKitVADAdapter(vad.VAD):
    """Voice Activity Detection adapter."""

    def __init__(self, interrupt_detector=None):
        super().__init__(capabilities=vad.VADCapabilities())
        self._interrupt_detector = interrupt_detector

    def stream(self, *, sample_rate: int = 16000, num_channels: int = 1) -> vad.VADStream:
        return LiveKitVADStream(sample_rate=sample_rate, num_channels=num_channels, interrupt_detector=self._interrupt_detector)


class LiveKitVADStream(vad.VADStream):
    def __init__(self, sample_rate: int, num_channels: int, interrupt_detector=None):
        super().__init__(sample_rate=sample_rate, num_channels=num_channels)
        self._interrupt_detector = interrupt_detector

    async def _main_task(self) -> None:
        async def _process_frames():
            async for frame in self:
                pass
        await _process_frames()
