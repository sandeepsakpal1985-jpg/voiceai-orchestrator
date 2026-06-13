"""
Conversation State Engine
Safe version for voice calls.

Prevents automatic transition to CLOSING on startup,
silence, empty transcripts, or uncertain emotion detection.
"""

import time
import logging
from dataclasses import dataclass, field
from typing import Any

from app.services.adaptive_conversation import CustomerEmotion

logger = logging.getLogger("voiceai.advanced.state_engine")

@dataclass
class StateTransition:
from_state: str
to_state: str
trigger: str
timestamp: float
metadata: dict[str, Any] = field(default_factory=dict)

class ConversationStateEngine:
def **init**(self):
self._current_state = "LISTENING"
self._previous_state = None
self._transitions = []
self._started = False

```
@property
def current_state(self):
    return self._current_state

@property
def previous_state(self):
    return self._previous_state

@property
def transitions(self):
    return self._transitions

@property
def transition_count(self):
    return len(self._transitions)

def reset(self):
    self._current_state = "LISTENING"
    self._previous_state = None
    self._transitions = []
    self._started = False

def transition_to(
    self,
    new_state: str,
    trigger: str = "manual",
    metadata: dict | None = None,
):
    if new_state == self._current_state:
        return self._current_state

    self._transitions.append(
        StateTransition(
            from_state=self._current_state,
            to_state=new_state,
            trigger=trigger,
            timestamp=time.time(),
            metadata=metadata or {},
        )
    )

    self._previous_state = self._current_state
    self._current_state = new_state

    logger.info(
        f"STATE: {self._previous_state} -> {self._current_state}"
    )

    return self._current_state

def determine_next_state(
    self,
    transcript: str,
    detected_emotion=None,
    scenario=None,
):
    text = (transcript or "").strip().lower()

    # --------------------------------------------------
    # NEVER CHANGE STATE FOR EMPTY INPUT
    # --------------------------------------------------

    if not text:
        return self._current_state

    # --------------------------------------------------
    # FIRST REAL MESSAGE
    # --------------------------------------------------

    if not self._started:
        self._started = True
        return "QUESTION"

    # --------------------------------------------------
    # CLOSING CONDITIONS
    # --------------------------------------------------

    closing_keywords = [
        "thank you",
        "thanks",
        "bye",
        "goodbye",
        "see you",
        "call later",
    ]

    if any(word in text for word in closing_keywords):
        return "CLOSING"

    # --------------------------------------------------
    # EMPATHY
    # --------------------------------------------------

    empathy_keywords = [
        "angry",
        "upset",
        "frustrated",
        "bad",
        "complaint",
        "issue",
        "problem",
    ]

    if any(word in text for word in empathy_keywords):
        return "EMPATHY"

    # --------------------------------------------------
    # ACTION
    # --------------------------------------------------

    action_keywords = [
        "book",
        "reserve",
        "schedule",
        "appointment",
        "help",
        "support",
    ]

    if any(word in text for word in action_keywords):
        return "ACTION"

    # --------------------------------------------------
    # QUESTION
    # --------------------------------------------------

    return "QUESTION"

def process_input(
    self,
    transcript: str,
    detected_emotion=None,
    scenario=None,
):
    next_state = self.determine_next_state(
        transcript=transcript,
        detected_emotion=detected_emotion,
        scenario=scenario,
    )

    self.transition_to(
        next_state,
        trigger="input",
        metadata={
            "transcript": transcript,
        },
    )

    return {
        "next_state": self._current_state,
        "previous_state": self._previous_state,
        "emotion": (
            str(detected_emotion)
            if detected_emotion
            else "neutral"
        ),
        "transition_count": self.transition_count,
    }

def state_summary(self):
    return (
        f"Current state={self._current_state}, "
        f"Transitions={self.transition_count}"
    )
```

_engine = None

def get_state_engine():
global _engine

```
if _engine is None:
    _engine = ConversationStateEngine()

return _engine
```
