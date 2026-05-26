"""
Voice Pipeline — Orchestrates the STT → LLM → TTS flow.

This is the core pipeline that processes voice input through
speech recognition, language model reasoning, and speech synthesis.

Integrates advanced modules for:
- Interrupt detection (barge-in during playback)
- State engine (conversation state machine)
- Adaptive playback (emotional pacing)
- Semantic analysis (multi-dimension text analysis)
"""

import time
from typing import Any, AsyncIterator

from app.config import settings
from app.providers import (
    STTProvider,
    LLMProvider,
    TTSProvider,
    ProviderRegistry,
    get_default_registry,
)
from app.services.conversation import get_conversation_service
from app.services.intent import get_intent_service
from app.services.adaptive_conversation import get_adaptive_conversation_service


class VoicePipeline:
    """
    End-to-end voice pipeline: STT → LLM → TTS.

    Each stage uses the configured provider from the registry,
    making it fully provider-independent.

    Flow:
        User Voice → STT → Text → LLM → Response Text → TTS → Audio

    When advanced modules are enabled (via settings), the pipeline also:
    - Tracks conversation state transitions
    - Detects barge-in interruptions during TTS playback
    - Provides emotional pacing context to the LLM
    - Runs optional semantic analysis on user input
    """

    def __init__(self, registry: ProviderRegistry | None = None):
        self._registry = registry or get_default_registry()

        # Lazy-init advanced modules
        self._state_engine = None
        self._interrupt_detector = None
        self._adaptive_playback = None
        self._conversation_analyzer = None

    @property
    def stt(self) -> STTProvider:
        return self._registry.get_stt(settings.STT_PROVIDER)

    @property
    def llm(self) -> LLMProvider:
        return self._registry.get_llm(settings.LLM_PROVIDER)

    @property
    def tts(self) -> TTSProvider:
        return self._registry.get_tts(settings.TTS_PROVIDER)

    # ── Advanced Module Accessors (lazy-loaded) ───────────────────

    @property
    def state_engine(self):
        if self._state_engine is None and settings.ADVANCED_STATE_ENGINE_ENABLED:
            from app.advanced.state_engine import get_state_engine
            self._state_engine = get_state_engine()
        return self._state_engine

    @property
    def interrupt_detector(self):
        if self._interrupt_detector is None and settings.INTERRUPT_DETECTION_ENABLED:
            from app.advanced.interrupt_detector import get_interrupt_detector
            self._interrupt_detector = get_interrupt_detector()
        return self._interrupt_detector

    @property
    def adaptive_playback(self):
        if self._adaptive_playback is None and settings.ADAPTIVE_PLAYBACK_ENABLED:
            from app.advanced.adaptive_playback import get_adaptive_playback_engine
            self._adaptive_playback = get_adaptive_playback_engine()
        return self._adaptive_playback

    @property
    def conversation_analyzer(self):
        if self._conversation_analyzer is None and settings.SEMANTIC_ANALYSIS_ENABLED:
            from app.advanced.conversation_analyzer import get_conversation_analyzer
            self._conversation_analyzer = get_conversation_analyzer()
        return self._conversation_analyzer

    # ── Core Pipeline ─────────────────────────────────────────────

    async def process_audio(
        self,
        audio_data: bytes,
        conversation_id: str | None = None,
        language: str = "en",
        system_prompt: str | None = None,
    ) -> dict[str, Any]:
        """Process audio through the full pipeline with adaptive conversation awareness.

        Integrates emotional state tracking, intent-driven pacing,
        and customer context into the LLM prompt.

        Args:
            audio_data: Raw audio bytes
            conversation_id: Optional conversation ID for context
            language: Language code
            system_prompt: Optional system prompt override

        Returns:
            Dict with transcription, LLM response, and (optionally) audio output
        """
        conv_service = get_conversation_service()
        adaptive = get_adaptive_conversation_service() if settings.ADAPTIVE_CONVERSATION_ENABLED else None

        # Step 1: STT
        transcription = await self.stt.transcribe(audio_data, language=language)

        if not transcription.strip():
            return {
                "transcription": "",
                "response": "",
                "intent": None,
                "conversation_id": conversation_id,
            }

        # Step 2: Adaptive state tracking (if enabled)
        if adaptive:
            adaptive.update_customer_state(transcription)
            adaptive.add_to_history("user", transcription)
            adaptive.conversation_state = "listening"

        # Step 2b: Advanced state engine (if enabled)
        state_result = None
        if self.state_engine:
            state_result = self.state_engine.process_input(
                transcript=transcription,
                detected_emotion=adaptive.customer_state.emotion if adaptive else None,
            )

        # Step 3: Intent detection
        intent_service = get_intent_service()
        intent = await intent_service.detect(transcription)

        # Step 3b: Optional semantic analysis (if enabled)
        semantic_result = None
        if self.conversation_analyzer:
            semantic_result = await self.conversation_analyzer.analyze(transcription, top_k=3)

        # Step 4: Build LLM context with adaptive and advanced awareness
        advanced_context = None
        if adaptive:
            advanced_context = adaptive.get_context_summary()
        if state_result:
            state_extra = f" Conversation state: {state_result['next_state']} (after {state_result['transition_count']} transitions)."
            advanced_context = (advanced_context or "") + state_extra
        if self.adaptive_playback and adaptive:
            pacing_context = self.adaptive_playback.get_prompt_context(
                adaptive.customer_state.emotion
            )
            advanced_context = (advanced_context or "") + f" {pacing_context}"

        messages = self._build_messages(
            transcription,
            conversation_id=conversation_id,
            system_prompt=system_prompt,
            intent=intent.intent if intent.confidence > 0.4 else None,
            adaptive_context=advanced_context,
        )

        # Step 5: LLM
        response_text = await self.llm.complete(messages)

        # Step 6: Adaptive post-processing
        if adaptive:
            adaptive.add_to_history("agent", response_text)
            adaptive.conversation_state = "processing"

        # Step 7: Store in conversation
        if conversation_id:
            from app.models.schemas import Message

            conv_service.add_message(
                conversation_id,
                Message(role="user", content=transcription, timestamp=time.time()),
            )
            conv_service.add_message(
                conversation_id,
                Message(role="agent", content=response_text, timestamp=time.time()),
            )

            # Update sentiment
            sentiment_label, sentiment_score = conv_service.analyze_sentiment(transcription)
            conv_service.update_sentiment(conversation_id, sentiment_label, sentiment_score)

        return {
            "transcription": transcription,
            "response": response_text,
            "intent": {"name": intent.intent, "confidence": intent.confidence},
            "conversation_id": conversation_id,
            "adaptive": {
                "emotion": adaptive.customer_state.emotion.value if adaptive else "neutral",
                "trust": adaptive.customer_state.trust if adaptive else 5,
                "patience": adaptive.customer_state.patience if adaptive else 5,
            } if adaptive else None,
            "state": state_result,
            "semantic": semantic_result if settings.SEMANTIC_ANALYSIS_ENABLED else None,
        }

    async def process_audio_stream(
        self,
        audio_stream: AsyncIterator[bytes],
        conversation_id: str | None = None,
        language: str = "en",
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        """Process streaming audio through STT → LLM pipeline.

        Yields LLM response chunks as they're generated.
        For true streaming, STT must support streaming transcription.
        """
        # Step 1: Streaming STT
        async for transcript_chunk in self.stt.transcribe_stream(
            audio_stream, language=language
        ):
            if not transcript_chunk.strip():
                continue

            # Step 2: Build LLM context
            messages = self._build_messages(
                transcript_chunk,
                conversation_id=conversation_id,
                system_prompt=system_prompt,
            )

            # Step 3: Streaming LLM
            async for response_chunk in self.llm.complete_stream(messages):
                yield response_chunk

    async def synthesize_response(
        self,
        text: str,
        voice_id: str | None = None,
        language: str | None = None,
    ) -> bytes:
        """Synthesize text to speech audio.

        Args:
            text: Text to synthesize
            voice_id: Voice ID to use
            language: Language code

        Returns:
            Audio bytes
        """
        audio = await self.tts.synthesize(
            text=text,
            voice_id=voice_id or settings.DEFAULT_VOICE_ID,
            language=language or settings.DEFAULT_LANGUAGE,
            speaking_rate=settings.DEFAULT_SPEAKING_RATE,
            pitch=settings.DEFAULT_PITCH,
        )
        return audio

    def _build_messages(
        self,
        user_input: str,
        conversation_id: str | None = None,
        system_prompt: str | None = None,
        intent: str | None = None,
        adaptive_context: str | None = None,
    ) -> list[dict]:
        """Build the message list for LLM completion with adaptive context."""
        messages: list[dict] = []

        system = system_prompt or (
            "You are a friendly and professional AI voice assistant. "
            "Keep responses concise and conversational, suitable for a voice call. "
            "Speak naturally and ask relevant follow-up questions. "
            "Responses should be under 100 words unless complex."
        )

        if intent:
            system += (
                f"\n\nThe detected customer intent is: '{intent}'. "
                f"Tailor your response appropriately to address this intent."
            )

        if adaptive_context:
            system += f"\n\nCustomer context: {adaptive_context}"

        messages.append({"role": "system", "content": system})

        # Add conversation context if available
        if conversation_id:
            conv_service = get_conversation_service()
            history = conv_service.get_history(conversation_id, limit=4)
            for msg in history[:-1]:  # Exclude the current message
                role = "assistant" if msg.role == "agent" else msg.role
                messages.append({"role": role, "content": msg.content})

        messages.append({"role": "user", "content": user_input})
        return messages


# Singleton instance
_pipeline: VoicePipeline | None = None


def get_voice_pipeline() -> VoicePipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = VoicePipeline()
    return _pipeline
