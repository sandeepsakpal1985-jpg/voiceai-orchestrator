"""
Real-time Conversation Orchestrator — Ties together all advanced modules.

This module is the top-level integration point for:
- InterruptDetector → barge-in detection during playback
- ConversationStateEngine → state machine with emotion tracking
- AdaptivePlaybackEngine → emotional pacing and flow generation
- ConversationAnalyzer → semantic analysis of user input
- AudioRegistry → audio clip library management

It provides a unified interface for the voice pipeline and WebSocket router
to interact with all advanced features through a single coordinator.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from app.config import settings
from app.services.adaptive_conversation import CustomerEmotion

logger = logging.getLogger("voiceai.advanced.orchestrator")


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

    Usage:
        orchestrator = get_orchestrator()
        orchestrator.reset()

        # On each user utterance:
        result = await orchestrator.process_utterance("user text here")
        context = orchestrator.get_llm_context()

        # For TTS playback:
        flow = orchestrator.generate_playback_flow()

        # On interrupt:
        orchestrator.handle_interrupt()
    """

    def __init__(self):
        self._state_engine = None
        self._interrupt_detector = None
        self._adaptive_playback = None
        self._conversation_analyzer = None
        self._active = True

    # ── Lazy Module Loading ───────────────────────────────────────

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

    # ── Reset ─────────────────────────────────────────────────────

    def reset(self) -> None:
        """Reset all advanced modules for a new conversation."""
        if self.state_engine:
            self.state_engine.reset()
        if self.interrupt_detector:
            self.interrupt_detector.reset()
        if self.adaptive_playback:
            self.adaptive_playback.reset_position()
        self._active = True
        logger.info("Orchestrator reset for new conversation")

    # ── Core Processing ───────────────────────────────────────────

    async def process_utterance(
        self,
        text: str,
        emotion: CustomerEmotion | None = None,
        scenario: str | None = None,
    ) -> OrchestratorState:
        """Process a user utterance through all enabled advanced modules.

        This is the main entry point for the voice pipeline. It:
        1. Processes through the state engine (if enabled)
        2. Runs semantic analysis (if enabled)
        3. Determines next intent via adaptive playback (if enabled)
        4. Returns a unified state snapshot

        Args:
            text: The user's transcribed speech or text input
            emotion: Optional detected emotion (from adaptive conversation service)
            scenario: Optional scenario identifier

        Returns:
            OrchestratorState snapshot with current status
        """
        if not self._active:
            return self.get_state_snapshot(emotion)

        # 1. Process through state engine
        state_result = None
        if self.state_engine:
            state_result = self.state_engine.process_input(
                transcript=text,
                detected_emotion=emotion,
                scenario=scenario,
            )

        # 2. Run semantic analysis (non-blocking, fire-and-forget style)
        if self.conversation_analyzer:
            # Don't await — semantic analysis is optional and non-critical
            asyncio.create_task(self._run_semantic_analysis(text))

        # 3. Determine next intent via adaptive playback
        next_intent = None
        if self.adaptive_playback and emotion:
            talk_count = len(self.state_engine.transitions) if self.state_engine else 0
            next_intent = self.adaptive_playback.get_next_intent(
                emotion=emotion,
                talk_count=talk_count,
            )

        # 4. Build state snapshot
        state = self.get_state_snapshot(emotion)
        state.next_intent_type = next_intent
        return state

    async def _run_semantic_analysis(self, text: str) -> None:
        """Run semantic analysis in the background (fire-and-forget)."""
        try:
            if self.conversation_analyzer:
                results = await self.conversation_analyzer.analyze(text, top_k=3)
                if results:
                    logger.debug("Semantic analysis: %s", results[0])
        except Exception as e:
            logger.debug("Semantic analysis skipped: %s", e)

    # ── Interrupt Handling ────────────────────────────────────────

    def handle_interrupt(self) -> dict[str, Any]:
        """Handle a barge-in interruption.

        Returns:
            Dict with recovery information and state changes
        """
        if not self._active:
            return {"recovery": None}

        recovery_info = {"interrupt_handled": False}

        # Signal the interrupt detector
        if self.interrupt_detector:
            self.interrupt_detector.signal_interrupt()
            recovery_flow = self.interrupt_detector.get_recovery_flow()
            recovery_prompt = self.interrupt_detector.get_recovery_prompt()
            recovery_info["interrupt_handled"] = True
            recovery_info["recovery_flow"] = recovery_flow
            recovery_info["recovery_prompt"] = recovery_prompt

        # Update state engine
        if self.state_engine:
            self.state_engine.transition_to(
                "INTERRUPTED",
                trigger="interrupt",
                metadata={"recovery": recovery_info},
            )

        # Fire adaptive playback interrupt callbacks
        if self.adaptive_playback:
            self.adaptive_playback.fire_interrupt()

        logger.info("Interrupt handled: %s", recovery_info)
        return recovery_info

    def clear_interrupt(self) -> None:
        """Clear the interrupt state after handling."""
        if self.interrupt_detector:
            self.interrupt_detector.clear_interrupt()

    @property
    def is_interrupted(self) -> bool:
        """Check if an interrupt is currently active."""
        if self.interrupt_detector:
            return self.interrupt_detector.is_interrupted
        return False

    # ── Context Generation ────────────────────────────────────────

    def get_llm_context(self, emotion: CustomerEmotion | None = None) -> str:
        """Build a unified context string for LLM prompt injection.

        Combines state engine status, adaptive playback pacing,
        and interrupt status into a single string.

        Args:
            emotion: Optional current emotion for pacing context

        Returns:
            Context string for LLM system prompt injection
        """
        parts = []

        # State engine context
        if self.state_engine:
            parts.append(
                f"Conversation state: {self.state_engine.current_state}. "
                f"Total transitions: {self.state_engine.transition_count}."
            )

        # Adaptive playback pacing context
        if self.adaptive_playback and emotion:
            parts.append(self.adaptive_playback.get_prompt_context(emotion))

        # Interrupt status
        if self.is_interrupted:
            parts.append("Customer has interrupted — respond acknowledging their input.")

        return " ".join(parts) if parts else ""

    def get_state_snapshot(self, emotion: CustomerEmotion | None = None) -> OrchestratorState:
        """Get a snapshot of the current orchestrator state."""
        state = OrchestratorState()

        if emotion:
            state.emotion = emotion.value

        if self.state_engine:
            state.state = self.state_engine.current_state
            state.transition_count = self.state_engine.transition_count

        if self.interrupt_detector:
            state.interrupt_count = self.interrupt_detector.interrupt_count

        # Copy from adaptive conversation service if available
        try:
            from app.services.adaptive_conversation import get_adaptive_conversation_service
            adaptive = get_adaptive_conversation_service()
            state.trust = adaptive.customer_state.trust
            state.patience = adaptive.customer_state.patience
            state.talk_count = adaptive.customer_state.talk_count
        except Exception:
            pass

        return state

    # ── Playback Flow Generation ──────────────────────────────────

    def generate_playback_flow(
        self,
        emotion: CustomerEmotion,
        turns: int = 6,
    ) -> list[Any]:
        """Generate an adaptive playback flow for the given emotion.

        Args:
            emotion: Customer emotion to base the flow on
            turns: Number of conversation turns to generate

        Returns:
            List of PlaybackItem objects from the adaptive playback engine
        """
        if not self.adaptive_playback:
            return []
        return self.adaptive_playback.generate_flow(emotion, turns=turns)

    def build_playback_queue(
        self,
        emotion: CustomerEmotion,
        override_sequence: list[str] | None = None,
    ) -> list[Any]:
        """Build a playback queue for the given emotion.

        Args:
            emotion: Customer emotion to base the queue on
            override_sequence: Optional custom sequence

        Returns:
            Ordered list of PlaybackItems
        """
        if not self.adaptive_playback:
            return []
        return self.adaptive_playback.build_queue(emotion, override_sequence)

    # ── Summary ───────────────────────────────────────────────────

    def summary(self) -> str:
        """Get a human-readable summary of the orchestrator status."""
        parts = [f"Active: {self._active}"]
        if self.state_engine:
            parts.append(self.state_engine.state_summary())
        if self.interrupt_detector:
            parts.append(f"Interrupts: {self.interrupt_detector.interrupt_count}")
        return " | ".join(parts)

    def __repr__(self) -> str:
        return (
            f"RealtimeConversationOrchestrator("
            f"state_engine={'yes' if self._state_engine else 'lazy'}, "
            f"interrupt_detector={'yes' if self._interrupt_detector else 'lazy'}, "
            f"adaptive_playback={'yes' if self._adaptive_playback else 'lazy'})"
        )


# ── Singleton ───────────────────────────────────────────────────────

_orch: RealtimeConversationOrchestrator | None = None


def get_orchestrator() -> RealtimeConversationOrchestrator:
    global _orch
    if _orch is None:
        _orch = RealtimeConversationOrchestrator()
    return _orch


def reset_orchestrator() -> None:
    """Reset the orchestrator singleton (for testing)."""
    global _orch
    if _orch:
        _orch.reset()
