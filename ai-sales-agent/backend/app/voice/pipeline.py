"""
Voice Pipeline — Orchestrates the STT → LLM → TTS flow.

This is the core pipeline that processes voice input through
speech recognition, language model reasoning, and speech synthesis.
"""

import time
from typing import Any, AsyncIterator

from app.config import settings
from app.providers import STTProvider, LLMProvider, TTSProvider, ProviderRegistry, get_default_registry
from app.services.conversation import get_conversation_service
from app.services.intent import get_intent_service


class VoicePipeline:
    """End-to-end voice pipeline: STT → LLM → TTS."""

    def __init__(self, registry: ProviderRegistry | None = None):
        self._registry = registry or get_default_registry()
        self._state_engine = None

    @property
    def stt(self) -> STTProvider:
        return self._registry.get_stt(settings.STT_PROVIDER)

    @property
    def llm(self) -> LLMProvider:
        return self._registry.get_llm(settings.LLM_PROVIDER)

    @property
    def tts(self) -> TTSProvider:
        return self._registry.get_tts(settings.TTS_PROVIDER)

    @property
    def state_engine(self):
        if self._state_engine is None and settings.ADVANCED_STATE_ENGINE_ENABLED:
            from app.voice.state_engine import get_state_engine
            self._state_engine = get_state_engine()
        return self._state_engine

    async def process_audio(self, audio_data: bytes, conversation_id: str | None = None, language: str = "en", system_prompt: str | None = None) -> dict[str, Any]:
        conv_service = get_conversation_service()

        transcription = await self.stt.transcribe(audio_data, language=language)
        if not transcription.strip():
            return {"transcription": "", "response": "", "intent": None, "conversation_id": conversation_id}

        intent_service = get_intent_service()
        intent = await intent_service.detect(transcription)

        messages = self._build_messages(transcription, conversation_id=conversation_id, system_prompt=system_prompt, intent=intent.intent if intent.confidence > 0.4 else None)
        response_text = await self.llm.complete(messages)

        if conversation_id:
            from app.models.schemas import Message
            conv_service.add_message(conversation_id, Message(role="user", content=transcription, timestamp=time.time()))
            conv_service.add_message(conversation_id, Message(role="agent", content=response_text, timestamp=time.time()))
            sentiment_label, sentiment_score = conv_service.analyze_sentiment(transcription)
            conv_service.update_sentiment(conversation_id, sentiment_label, sentiment_score)

        return {"transcription": transcription, "response": response_text, "intent": {"name": intent.intent, "confidence": intent.confidence}, "conversation_id": conversation_id}

    async def process_audio_stream(self, audio_stream: AsyncIterator[bytes], conversation_id: str | None = None, language: str = "en", system_prompt: str | None = None) -> AsyncIterator[str]:
        async for transcript_chunk in self.stt.transcribe_stream(audio_stream, language=language):
            if not transcript_chunk.strip():
                continue
            messages = self._build_messages(transcript_chunk, conversation_id=conversation_id, system_prompt=system_prompt)
            async for response_chunk in self.llm.complete_stream(messages):
                yield response_chunk

    async def synthesize_response(self, text: str, voice_id: str | None = None, language: str | None = None) -> bytes:
        voice_id = voice_id or settings.DEFAULT_VOICE_ID
        language = language or settings.DEFAULT_LANGUAGE

        cache_lookup = None
        if settings.AUDIO_CACHE_ENABLED:
            try:
                from app.services.audio_cache import get_audio_cache_service
                cache = get_audio_cache_service()
                if cache.is_initialized:
                    cache_lookup = cache
                    cached = await cache.get(text, voice_id=voice_id, language=language)
                    if cached is not None:
                        return cached
            except Exception:
                pass

        audio = await self.tts.synthesize(text=text, voice_id=voice_id, language=language, speaking_rate=settings.DEFAULT_SPEAKING_RATE, pitch=settings.DEFAULT_PITCH)

        if cache_lookup is not None and audio and len(audio) > 100:
            try:
                await cache_lookup.set(text, audio, voice_id=voice_id, language=language)
            except Exception:
                pass
        return audio

    def build_messages(self, user_input: str, conversation_id: str | None = None, system_prompt: str | None = None, intent: str | None = None, adaptive_context: str | None = None) -> list[dict]:
        """Build a message list for the LLM from user input and conversation history.

        This is the public API for constructing LLM messages. External consumers
        (e.g., FreeSWITCH call handler) should use this instead of _build_messages.
        """
        return self._build_messages(
            user_input=user_input,
            conversation_id=conversation_id,
            system_prompt=system_prompt,
            intent=intent,
            adaptive_context=adaptive_context,
        )

    def _build_messages(self, user_input: str, conversation_id: str | None = None, system_prompt: str | None = None, intent: str | None = None, adaptive_context: str | None = None) -> list[dict]:
        messages: list[dict] = []
        system = system_prompt or (
            "You are a friendly and professional AI sales assistant. "
            "Keep responses concise and conversational, suitable for a voice call. "
            "Speak naturally and ask relevant follow-up questions. "
            "Responses should be under 100 words unless complex."
        )
        if intent:
            system += f"\n\nThe detected customer intent is: '{intent}'. Tailor your response accordingly."
        if adaptive_context:
            system += f"\n\nCustomer context: {adaptive_context}"
        messages.append({"role": "system", "content": system})

        if conversation_id:
            conv_service = get_conversation_service()
            history = conv_service.get_history(conversation_id, limit=4)
            for msg in history[:-1]:
                messages.append({"role": "assistant" if msg.role == "agent" else msg.role, "content": msg.content})

        messages.append({"role": "user", "content": user_input})
        return messages


_pipeline: VoicePipeline | None = None


def get_voice_pipeline() -> VoicePipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = VoicePipeline()
    return _pipeline
