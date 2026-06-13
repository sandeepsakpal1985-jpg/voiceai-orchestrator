"""
Real-time Conversation Orchestrator — Ties together all advanced modules.

Provides a unified interface for the voice pipeline to interact with:
- InterruptDetector → barge-in detection during playback
- ConversationStateEngine → state machine with emotion tracking
- AdaptivePlaybackEngine → emotional pacing and flow generation
- ConversationAnalyzer → semantic analysis of user input
- AudioRegistry → audio clip library management
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from app.config import settings
from app.services.adaptive_conversation import CustomerEmotion

logger = logging.getLogger("ai_sales_agent.advanced.orchestrator")


@dataclass
class OrchestratorState:
    """Snapshot of the current orchestrator state for client responses."""
    emotion: str = "neutral"
    state: str = "LISTENING"
    trust: int = 5
    patience: int = 5
    transition_count: int = 0
    interrupt_count: int = 0
    talk_count: int = 0
    last_intent_type: str | None = None
    next_intent_type: str | None = None


class RealtimeConversationOrchestrator:
    """Top-level orchestrator that coordinates all advanced modules.

    Provides a single entry point for the voice pipeline to:
    1. Process user input through state engine and emotion tracking
    2. Detect and handle barge-in interruptions
    3. Generate adaptive playback flows
    4. Run optional semantic analysis
    5. Produce a unified response context for LLM injection
    """

    def __init__(self):
        self._state_engine = None
        self._interrupt_detector = None
        self._adaptive_playback = None
        self._conversation_analyzer = None
        self._active = True

    # ── Lazy Module Loading ─────────────────────────────────────

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

    @property
    def is_active(self) -> bool:
        return self._active

    def deactivate(self) -> None:
        self._active = False

    # ── Reset ───────────────────────────────────────────────────

    def reset(self) -> None:
        if self.state_engine:
            self.state_engine.reset()
        if self.interrupt_detector:
            self.interrupt_detector.reset()
        if self.adaptive_playback:
            self.adaptive_playback.reset_position()
        self._active = True
        logger.info("Orchestrator reset for new conversation")

    # ── Core Processing ─────────────────────────────────────────

    async def process_utterance(self, text: str, emotion: CustomerEmotion | None = None, scenario: str | None = None) -> OrchestratorState:
        if not self._active:
            return self.get_state_snapshot(emotion)
        if self.state_engine:
            self.state_engine.process_input(transcript=text, detected_emotion=emotion, scenario=scenario)
        if self.conversation_analyzer:
            asyncio.create_task(self._run_semantic_analysis(text))
        next_intent = None
        if self.adaptive_playback and emotion:
            talk_count = len(self.state_engine.transitions) if self.state_engine else 0
            next_intent = self.adaptive_playback.get_next_intent(emotion=emotion, talk_count=talk_count)
        state = self.get_state_snapshot(emotion)
        state.next_intent_type = next_intent
        return state

    async def _run_semantic_analysis(self, text: str) -> None:
        try:
            if self.conversation_analyzer:
                results = await self.conversation_analyzer.analyze(text, top_k=3)
                if results:
                    logger.debug("Semantic analysis: %s", results[0])
        except Exception as e:
            logger.debug("Semantic analysis skipped: %s", e)

    # ── Interrupt Handling ──────────────────────────────────────

    def handle_interrupt(self) -> dict[str, Any]:
        if not self._active:
            return {"recovery": None}
        recovery_info = {"interrupt_handled": False}
        if self.interrupt_detector:
            self.interrupt_detector.signal_interrupt()
            recovery_info["interrupt_handled"] = True
            recovery_info["recovery_flow"] = self.interrupt_detector.get_recovery_flow()
            recovery_info["recovery_prompt"] = self.interrupt_detector.get_recovery_prompt()
        if self.state_engine:
            self.state_engine.transition_to("INTERRUPTED", trigger="interrupt", metadata={"recovery": recovery_info})
        if self.adaptive_playback:
            self.adaptive_playback.fire_interrupt()
        logger.info("Interrupt handled: %s", recovery_info)
        return recovery_info

    def clear_interrupt(self) -> None:
        if self.interrupt_detector:
            self.interrupt_detector.clear_interrupt()

    @property
    def is_interrupted(self) -> bool:
        if self.interrupt_detector:
            return self.interrupt_detector.is_interrupted
        return False

    # ── Context Generation ──────────────────────────────────────

    def get_llm_context(self, emotion: CustomerEmotion | None = None) -> str:
        parts = []
        if self.state_engine:
            parts.append(f"Conversation state: {self.state_engine.current_state}. Total transitions: {self.state_engine.transition_count}.")
        if self.adaptive_playback and emotion:
            parts.append(self.adaptive_playback.get_prompt_context(emotion))
        if self.is_interrupted:
            parts.append("Customer has interrupted — respond acknowledging their input.")
        return " ".join(parts) if parts else ""

    def get_state_snapshot(self, emotion: CustomerEmotion | None = None) -> OrchestratorState:
        state = OrchestratorState()
        if emotion:
            state.emotion = emotion.value
        if self.state_engine:
            state.state = self.state_engine.current_state
            state.transition_count = self.state_engine.transition_count
        if self.interrupt_detector:
            state.interrupt_count = self.interrupt_detector.interrupt_count
        try:
            from app.services.adaptive_conversation import get_adaptive_conversation_service
            adaptive = get_adaptive_conversation_service()
            state.trust = adaptive.customer_state.trust
            state.patience = adaptive.customer_state.patience
            state.talk_count = adaptive.customer_state.talk_count
        except Exception:
            pass
        return state

    # ── Playback Flow Generation ────────────────────────────────

    def generate_playback_flow(self, emotion: CustomerEmotion, turns: int = 6) -> list[Any]:
        if not self.adaptive_playback:
            return []
        return self.adaptive_playback.generate_flow(emotion, turns=turns)

    def build_playback_queue(self, emotion: CustomerEmotion, override_sequence: list[str] | None = None) -> list[Any]:
        if not self.adaptive_playback:
            return []
        return self.adaptive_playback.build_queue(emotion, override_sequence)

    # ── Summary ─────────────────────────────────────────────────

    def summary(self) -> str:
        parts = [f"Active: {self._active}"]
        if self.state_engine:
            parts.append(self.state_engine.state_summary())
        if self.interrupt_detector:
            parts.append(f"Interrupts: {self.interrupt_detector.interrupt_count}")
        return " | ".join(parts)

    def __repr__(self) -> str:
        return (f"RealtimeConversationOrchestrator(engine={'yes' if self._state_engine else 'lazy'}, "
                f"interrupt={'yes' if self._interrupt_detector else 'lazy'}, "
                f"playback={'yes' if self._adaptive_playback else 'lazy'})")


# ── Singleton ───────────────────────────────────────────────────────

_orch: RealtimeConversationOrchestrator | None = None


def get_orchestrator() -> RealtimeConversationOrchestrator:
    global _orch
    if _orch is None:
        _orch = RealtimeConversationOrchestrator()
    return _orch


def reset_orchestrator() -> None:
    global _orch
    if _orch:
        _orch.reset()
