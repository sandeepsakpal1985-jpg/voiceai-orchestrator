"""
State Engine — Conversation state machine with emotion tracking and flow transitions.

Integrates concepts from:
- state_engine.py: FastAPI state machine for conversation routing
- live_state_engine.py: Real-time state with emotion tracking
- dynamic_flow.py: Dynamic flow transitions based on state
"""

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from app.services.adaptive_conversation import CustomerEmotion

logger = logging.getLogger("voiceai.advanced.state_engine")


# ── Scenario Definitions (from state_engine.py + scenarios.json) ───

# Maps scenario keywords -> (emotion, next_state)
SCENARIO_ROUTES: dict[str, tuple[str, str]] = {
    "staff-complaint": ("frustrated", "EMPATHY"),
    "room-cleanliness": ("disappointed", "EMPATHY"),
    "refund-request": ("angry", "REASSURANCE"),
    "wrong-number": ("neutral", "CLOSING"),
    "billing-issue": ("frustrated", "APOLOGY"),
    "general-inquiry": ("neutral", "QUESTION"),
    "positive-feedback": ("happy", "CLOSING"),
    "technical-support": ("neutral", "ACTION"),
    "callback-request": ("neutral", "CLOSING"),
    "flirting": ("playful", "CLOSING"),
    "threatening": ("scared", "EMPATHY"),
    "audio-problem": ("frustrated", "REASSURANCE"),
}

# Transcript keywords -> next state (from state_engine.py)
KEYWORD_ROUTES: dict[str, str] = {
    "refund": "REASSURANCE",
    "bad": "EMPATHY",
    "dirty": "EMPATHY",
    "wrong number": "CLOSING",
    "call later": "CLOSING",
    "busy": "CLOSING",
    "thank": "CLOSING",
    "help": "ACTION",
    "explain": "QUESTION",
    "sorry": "APOLOGY",
}


@dataclass
class StateTransition:
    """A record of a state transition."""
    from_state: str
    to_state: str
    trigger: str  # keyword, scenario, emotion_change, manual
    timestamp: float
    metadata: dict[str, Any] = field(default_factory=dict)


class ConversationStateEngine:
    """Manages conversation state transitions, emotion tracking, and flow routing.

    Provides a state machine that determines the next appropriate action
    based on conversation context, detected keywords, emotional state,
    and scenario definitions.
    """

    def __init__(self):
        self._current_state: str = "LISTENING"
        self._previous_state: str | None = None
        self._transitions: list[StateTransition] = []
        self._state_entry_times: dict[str, float] = {"LISTENING": time.time()}

    # ── State Management ───────────────────────────────────────────

    @property
    def current_state(self) -> str:
        return self._current_state

    @property
    def previous_state(self) -> str | None:
        return self._previous_state

    @property
    def transitions(self) -> list[StateTransition]:
        return list(self._transitions)

    @property
    def transition_count(self) -> int:
        return len(self._transitions)

    @property
    def time_in_current_state(self) -> float:
        """Seconds spent in the current state."""
        entry = self._state_entry_times.get(self._current_state, time.time())
        return time.time() - entry

    def transition_to(self, new_state: str, trigger: str = "manual", metadata: dict | None = None) -> str:
        """Transition to a new conversation state.

        Args:
            new_state: The state to transition to
            trigger: What triggered the transition (keyword, scenario, etc.)
            metadata: Optional metadata about the transition

        Returns:
            The new state name
        """
        if new_state == self._current_state:
            return self._current_state

        transition = StateTransition(
            from_state=self._current_state,
            to_state=new_state,
            trigger=trigger,
            timestamp=time.time(),
            metadata=metadata or {},
        )

        self._previous_state = self._current_state
        self._current_state = new_state
        self._transitions.append(transition)
        self._state_entry_times[new_state] = time.time()

        logger.debug(
            f"State transition: {transition.from_state} → {transition.to_state} "
            f"(trigger: {trigger})"
        )

        return new_state

    def get_state_history(self, limit: int = 10) -> list[StateTransition]:
        """Get recent state transitions."""
        return self._transitions[-limit:]

    # ── Route Determination (from state_engine.py + scenarios.json) ─

    def determine_next_state(
        self,
        transcript: str,
        detected_emotion: CustomerEmotion | None = None,
        scenario: str | None = None,
    ) -> str:
        """Determine the next appropriate state based on input.

        Priority:
        1. Scenario match (if provided)
        2. Keyword match in transcript
        3. Emotion-based default

        Args:
            transcript: The user's transcribed speech
            detected_emotion: The detected emotional state
            scenario: Optional scenario identifier

        Returns:
            The next state name
        """
        lower = transcript.lower()

        # 1. Check explicit scenario
        if scenario and scenario in SCENARIO_ROUTES:
            _, state = SCENARIO_ROUTES[scenario]
            return state

        # 2. Check keyword routes
        for keyword, state in KEYWORD_ROUTES.items():
            if keyword in lower:
                return state

        # 3. Emotion-based default
        if detected_emotion == CustomerEmotion.ANGRY:
            return "EMPATHY"
        elif detected_emotion == CustomerEmotion.CONFUSED:
            return "QUESTION"
        elif detected_emotion == CustomerEmotion.BUSY:
            return "ACTION"
        elif detected_emotion == CustomerEmotion.POSITIVE:
            return "REASSURANCE"
        elif detected_emotion == CustomerEmotion.WRONG_NUMBER:
            return "CLOSING"
        elif detected_emotion == CustomerEmotion.EMOTIONAL:
            return "EMPATHY"

        # Default
        return "QUESTION"

    def process_input(
        self,
        transcript: str,
        detected_emotion: CustomerEmotion | None = None,
        scenario: str | None = None,
    ) -> dict[str, Any]:
        """Process a user input and determine the full state response.

        Args:
            transcript: The user's transcribed speech
            detected_emotion: Optional detected emotion
            scenario: Optional scenario identifier

        Returns:
            Dict with next_state, emotion, and transition info
        """
        next_state = self.determine_next_state(transcript, detected_emotion, scenario)

        transition_result = self.transition_to(
            next_state,
            trigger="scenario" if scenario else "keyword" if any(
                kw in transcript.lower() for kw in KEYWORD_ROUTES
            ) else "emotion_change",
            metadata={
                "transcript_snippet": transcript[:100],
                "emotion": detected_emotion.value if detected_emotion else "unknown",
                "scenario": scenario,
            },
        )

        return {
            "next_state": transition_result,
            "previous_state": self._previous_state,
            "emotion": detected_emotion.value if detected_emotion else "neutral",
            "transition_count": self.transition_count,
        }

    # ── Utility ────────────────────────────────────────────────────

    def reset(self) -> None:
        """Reset the state engine to initial state."""
        self._current_state = "LISTENING"
        self._previous_state = None
        self._transitions.clear()
        self._state_entry_times = {"LISTENING": time.time()}

    def state_summary(self) -> str:
        """Get a human-readable summary of the current state."""
        return (
            f"Current state: {self._current_state}. "
            f"Previous state: {self._previous_state or 'N/A'}. "
            f"Time in state: {self.time_in_current_state:.1f}s. "
            f"Total transitions: {self.transition_count}."
        )

    def __repr__(self) -> str:
        return (
            f"ConversationStateEngine(state={self._current_state}, "
            f"transitions={self.transition_count})"
        )


# ── Singleton ───────────────────────────────────────────────────────

_engine: ConversationStateEngine | None = None


def get_state_engine() -> ConversationStateEngine:
    global _engine
    if _engine is None:
        _engine = ConversationStateEngine()
    return _engine
