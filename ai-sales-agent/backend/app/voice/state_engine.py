"""
Conversation State Engine — Safe version for voice calls.
Prevents automatic transition to CLOSING on startup, silence, or empty transcripts.
"""

import time
import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("ai_sales_agent.state_engine")


@dataclass
class StateTransition:
    from_state: str
    to_state: str
    trigger: str
    timestamp: float
    metadata: dict[str, Any] = field(default_factory=dict)


class ConversationStateEngine:
    """Manages conversation state transitions with safe defaults."""

    def __init__(self):
        self._current_state = "LISTENING"
        self._previous_state: str | None = None
        self._transitions: list[StateTransition] = []
        self._started = False

    @property
    def current_state(self) -> str:
        return self._current_state

    @property
    def previous_state(self) -> str | None:
        return self._previous_state

    @property
    def transition_count(self) -> int:
        return len(self._transitions)

    def reset(self) -> None:
        self._current_state = "LISTENING"
        self._previous_state = None
        self._transitions = []
        self._started = False

    def transition_to(self, new_state: str, trigger: str = "manual", metadata: dict | None = None) -> str:
        if new_state == self._current_state:
            return self._current_state
        self._transitions.append(StateTransition(from_state=self._current_state, to_state=new_state, trigger=trigger, timestamp=time.time(), metadata=metadata or {}))
        self._previous_state = self._current_state
        self._current_state = new_state
        logger.info("STATE: %s -> %s", self._previous_state, self._current_state)
        return self._current_state

    def determine_next_state(self, transcript: str, detected_emotion=None, scenario=None) -> str:
        text = (transcript or "").strip().lower()
        if not text:
            return self._current_state

        if not self._started:
            self._started = True
            return "QUESTION"

        closing_keywords = ["thank you", "thanks", "bye", "goodbye", "see you", "call later"]
        if any(word in text for word in closing_keywords):
            return "CLOSING"

        empathy_keywords = ["angry", "upset", "frustrated", "bad", "complaint", "issue", "problem"]
        if any(word in text for word in empathy_keywords):
            return "EMPATHY"

        action_keywords = ["book", "reserve", "schedule", "appointment", "help", "support"]
        if any(word in text for word in action_keywords):
            return "ACTION"

        return "QUESTION"

    def process_input(self, transcript: str, detected_emotion=None, scenario=None) -> dict[str, Any]:
        next_state = self.determine_next_state(transcript=transcript, detected_emotion=detected_emotion, scenario=scenario)
        self.transition_to(next_state, trigger="input", metadata={"transcript": transcript})
        return {"next_state": self._current_state, "previous_state": self._previous_state, "emotion": str(detected_emotion) if detected_emotion else "neutral", "transition_count": self.transition_count}

    def state_summary(self) -> str:
        return f"Current state={self._current_state}, Transitions={self.transition_count}"


_engine: ConversationStateEngine | None = None


def get_state_engine() -> ConversationStateEngine:
    global _engine
    if _engine is None:
        _engine = ConversationStateEngine()
    return _engine
