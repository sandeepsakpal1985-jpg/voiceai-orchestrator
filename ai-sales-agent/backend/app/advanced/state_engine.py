"""
State Engine — Conversation state machine with emotion tracking and flow transitions.

Integrates concepts from the advanced state engine:
- State machine for conversation routing
- Real-time state with emotion tracking
- Dynamic flow transitions based on state
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from app.services.adaptive_conversation import CustomerEmotion

logger = logging.getLogger("ai_sales_agent.advanced.state_engine")


# ── Scenario Definitions ────────────────────────────────────────────

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
    trigger: str
    timestamp: float
    metadata: dict[str, Any] = field(default_factory=dict)


class ConversationStateEngine:
    """Manages conversation state transitions, emotion tracking, and flow routing."""

    def __init__(self):
        self._current_state: str = "LISTENING"
        self._previous_state: str | None = None
        self._transitions: list[StateTransition] = []
        self._state_entry_times: dict[str, float] = {"LISTENING": time.time()}

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
        entry = self._state_entry_times.get(self._current_state, time.time())
        return time.time() - entry

    def transition_to(self, new_state: str, trigger: str = "manual", metadata: dict | None = None) -> str:
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
        logger.debug("State: %s → %s (trigger: %s)", transition.from_state, transition.to_state, trigger)
        return new_state

    def get_state_history(self, limit: int = 10) -> list[StateTransition]:
        return self._transitions[-limit:]

    def determine_next_state(self, transcript: str, detected_emotion: CustomerEmotion | None = None, scenario: str | None = None) -> str:
        lower = transcript.lower()
        if scenario and scenario in SCENARIO_ROUTES:
            _, state = SCENARIO_ROUTES[scenario]
            return state
        for keyword, state in KEYWORD_ROUTES.items():
            if keyword in lower:
                return state
        if detected_emotion == CustomerEmotion.ANGRY:
            return "EMPATHY"
        elif detected_emotion == CustomerEmotion.CONFUSED:
            return "QUESTION"
        elif detected_emotion == CustomerEmotion.BUSY:
            return "ACTION"
        elif detected_emotion == CustomerEmotion.POSITIVE:
            return "REASSURANCE"
        elif detected_emotion == CustomerEmotion.WRONG_NUMBER:
            return "QUESTION"
        elif detected_emotion == CustomerEmotion.EMOTIONAL:
            return "EMPATHY"
        return "QUESTION"

    def process_input(self, transcript: str, detected_emotion: CustomerEmotion | None = None, scenario: str | None = None) -> dict[str, Any]:
        next_state = self.determine_next_state(transcript, detected_emotion, scenario)
        has_keyword = any(kw in transcript.lower() for kw in KEYWORD_ROUTES)
        trigger = "scenario" if scenario else "keyword" if has_keyword else "emotion_change"
        result = self.transition_to(next_state, trigger=trigger, metadata={"transcript_snippet": transcript[:100], "emotion": detected_emotion.value if detected_emotion else "unknown", "scenario": scenario})
        return {"next_state": result, "previous_state": self._previous_state, "emotion": detected_emotion.value if detected_emotion else "neutral", "transition_count": self.transition_count}

    def reset(self) -> None:
        self._current_state = "LISTENING"
        self._previous_state = None
        self._transitions.clear()
        self._state_entry_times = {"LISTENING": time.time()}

    def state_summary(self) -> str:
        return f"Current: {self._current_state}. Previous: {self._previous_state or 'N/A'}. Time: {self.time_in_current_state:.1f}s. Transitions: {self.transition_count}."

    def __repr__(self) -> str:
        return f"ConversationStateEngine(state={self._current_state}, transitions={self.transition_count})"


# ── Singleton ───────────────────────────────────────────────────────

_engine: ConversationStateEngine | None = None


def get_state_engine() -> ConversationStateEngine:
    global _engine
    if _engine is None:
        _engine = ConversationStateEngine()
    return _engine
