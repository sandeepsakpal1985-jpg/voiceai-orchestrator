"""
Adaptive Conversation Service — Integrates root-level advanced modules into the voice pipeline.

This service brings together the concepts from the following root-level modules:
- adaptive_playback.py / dynamic_flow.py → Emotional pacing and conversational flow profiles
- live_interrupt_detector.py → Real-time barge-in detection during TTS playback
- state_engine.py / live_state_engine.py → Conversation state machine with emotion tracking
- intelligent_orchestrator.py → Smart orchestration with repetition prevention
- playback_engine.py → Playback queue management
- conversation_analyzer.py / semantic_intent_engine.py → Semantic analysis
- interruptible_runtime.py → Interruption handling and recovery

These were originally standalone scripts. This module integrates their logic
into the production voice pipeline as a configurable service.
"""

import asyncio
import logging
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger("voiceai.adaptive_conversation")


# ── Enums ───────────────────────────────────────────────────────────


class CustomerEmotion(str, Enum):
    NEUTRAL = "neutral"
    ANGRY = "angry_customer"
    BUSY = "busy_customer"
    EMOTIONAL = "emotional_customer"
    CONFUSED = "confused_customer"
    POSITIVE = "positive_customer"
    WRONG_NUMBER = "wrong_number"


class ConversationState(str, Enum):
    INIT = "initializing"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    PAUSED = "paused"
    COMPLETED = "completed"
    INTERRUPTED = "interrupted"


class SpeechIntent(str, Enum):
    GREETING = "greeting"
    FILLER = "filler"
    EMPATHY = "empathy"
    REASSURANCE = "reassurance"
    ACTION = "action"
    QUESTION = "question"
    APOLOGY = "apology"
    VALIDATION = "validation"
    CLOSING = "closing"


# ── Data Classes ────────────────────────────────────────────────────


@dataclass
class CustomerState:
    """Tracks the emotional and conversational state of the customer."""
    emotion: CustomerEmotion = CustomerEmotion.NEUTRAL
    patience: int = 5
    trust: int = 5
    sentiment_score: float = 0.0
    talk_count: int = 0
    interruption_count: int = 0
    last_intent: str = ""
    topics: list[str] = field(default_factory=list)


@dataclass
class ConversationProfile:
    """Pacing and sequence profile for different customer emotions."""
    pace_label: str
    pause_min: float
    pause_max: float
    sequence: list[str]


@dataclass
class AIResponse:
    """A structured AI response with intent and scheduling info."""
    text: str
    intent: str
    priority: int = 5
    pause_before: float | None = None
    pause_after: float | None = None


# ── Conversation Profiles (from adaptive_playback.py / dynamic_flow.py) ──

CONVERSATION_PROFILES: dict[CustomerEmotion, ConversationProfile] = {
    CustomerEmotion.ANGRY: ConversationProfile(
        pace_label="slow_soft",
        pause_min=0.18,
        pause_max=0.38,
        sequence=[
            "filler", "empathy", "empathy", "reassurance",
            "filler", "empathy", "reassurance", "action",
        ],
    ),
    CustomerEmotion.BUSY: ConversationProfile(
        pace_label="fast_direct",
        pause_min=0.05,
        pause_max=0.18,
        sequence=["filler", "reassurance", "action", "closing"],
    ),
    CustomerEmotion.EMOTIONAL: ConversationProfile(
        pace_label="very_soft",
        pause_min=0.22,
        pause_max=0.40,
        sequence=[
            "filler", "empathy", "empathy", "filler",
            "reassurance", "empathy", "reassurance", "empathy",
        ],
    ),
    CustomerEmotion.CONFUSED: ConversationProfile(
        pace_label="guided",
        pause_min=0.10,
        pause_max=0.25,
        sequence=["filler", "reassurance", "question", "filler", "reassurance"],
    ),
    CustomerEmotion.POSITIVE: ConversationProfile(
        pace_label="warm",
        pause_min=0.08,
        pause_max=0.20,
        sequence=["reassurance", "question", "action", "closing"],
    ),
    CustomerEmotion.WRONG_NUMBER: ConversationProfile(
        pace_label="apologetic",
        pause_min=0.15,
        pause_max=0.30,
        sequence=["apology", "reassurance", "closing"],
    ),
    CustomerEmotion.NEUTRAL: ConversationProfile(
        pace_label="standard",
        pause_min=0.10,
        pause_max=0.25,
        sequence=["question", "action", "reassurance"],
    ),
}

# ── Sentiment patterns (from live_state_engine.py) ──

WRONG_NUMBER_PATTERNS = [
    "wrong number", "never visited", "never came", "not visited",
    "who are you", "why are you calling", "i don't know",
    "never used", "not your customer", "wrong person",
]

ANGRY_PATTERNS = [
    "terrible", "worst", "frustrated", "angry", "upset",
    "bad service", "waste", "hate", "not done", "unacceptable",
    "pathetic", "useless",
]

POSITIVE_PATTERNS = [
    "good", "great", "thanks", "thank you", "satisfied",
    "happy", "excellent", "amazing", "wonderful", "appreciate",
]

CONFUSED_PATTERNS = [
    "explain", "what do you mean", "don't understand", "confused",
    "what are you talking", "clarify",
]

BUSY_PATTERNS = [
    "busy", "call later", "later", "tomorrow", "meeting",
    "not now", "in a hurry",
]


# ── Adaptive Conversation Service ───────────────────────────────────


class AdaptiveConversationService:
    """Orchestrates adaptive conversation flow with emotional awareness.

    Integrates concepts from:
    - adaptive_playback.py: emotional pacing profiles
    - dynamic_flow.py: conversation flow generation
    - live_state_engine.py: emotion/state tracking
    - intelligent_orchestrator.py: repetition prevention
    - interruptible_runtime.py: interruption & recovery
    - playback_engine.py: playback queue management
    """

    def __init__(self):
        self._customer_state = CustomerState()
        self._conversation_state = ConversationState.INIT
        self._recently_played: list[str] = []
        self._max_recent_memory = 8
        self._interrupt_flag = False
        self._conversation_history: list[dict] = []

    # ── State Management ──────────────────────────────────────────

    def reset(self) -> None:
        """Reset the service state for a new conversation."""
        self._customer_state = CustomerState()
        self._conversation_state = ConversationState.INIT
        self._recently_played.clear()
        self._interrupt_flag = False
        self._conversation_history.clear()

    @property
    def customer_state(self) -> CustomerState:
        return self._customer_state

    @property
    def conversation_state(self) -> ConversationState:
        return self._conversation_state

    @conversation_state.setter
    def conversation_state(self, value: ConversationState) -> None:
        prev = self._conversation_state
        self._conversation_state = value
        logger.debug("Conversation state: %s → %s", prev.value, value.value)

    # ── Emotion Detection ─────────────────────────────────────────

    def detect_emotion(self, text: str) -> CustomerEmotion:
        """Detect customer emotion from text input.

        Uses a multi-pattern matching approach (from live_state_engine.py
        and intent_router.py).
        """
        lower = text.lower().strip()

        if any(p in lower for p in WRONG_NUMBER_PATTERNS):
            return CustomerEmotion.WRONG_NUMBER
        elif any(p in lower for p in ANGRY_PATTERNS):
            return CustomerEmotion.ANGRY
        elif any(p in lower for p in POSITIVE_PATTERNS):
            return CustomerEmotion.POSITIVE
        elif any(p in lower for p in CONFUSED_PATTERNS):
            return CustomerEmotion.CONFUSED
        elif any(p in lower for p in BUSY_PATTERNS):
            return CustomerEmotion.BUSY
        elif any(word in lower for word in ["sad", "lonely", "crying", "heart"]):
            return CustomerEmotion.EMOTIONAL
        else:
            return CustomerEmotion.NEUTRAL

    def update_customer_state(self, text: str) -> None:
        """Update the customer state based on new input text."""
        emotion = self.detect_emotion(text)
        self._customer_state.emotion = emotion
        self._customer_state.talk_count += 1

        # Update patience and trust based on emotion
        if emotion == CustomerEmotion.ANGRY:
            self._customer_state.patience -= 1
            self._customer_state.trust -= 1
        elif emotion == CustomerEmotion.POSITIVE:
            self._customer_state.trust += 1
        elif emotion == CustomerEmotion.WRONG_NUMBER:
            self._customer_state.trust -= 2

        # Clamp values
        self._customer_state.patience = max(0, min(10, self._customer_state.patience))
        self._customer_state.trust = max(0, min(10, self._customer_state.trust))

        logger.debug(
            "Customer state updated: emotion=%s, patience=%d, trust=%d",
            emotion.value,
            self._customer_state.patience,
            self._customer_state.trust,
        )

    # ── Flow Generation ───────────────────────────────────────────

    def get_conversation_profile(self) -> ConversationProfile:
        """Get the appropriate conversation profile for the current emotion."""
        return CONVERSATION_PROFILES.get(
            self._customer_state.emotion,
            CONVERSATION_PROFILES[CustomerEmotion.NEUTRAL],
        )

    def get_adaptive_pause(self) -> float:
        """Get a natural pause duration based on the customer's emotional profile."""
        profile = self.get_conversation_profile()
        return random.uniform(profile.pause_min, profile.pause_max)

    def get_next_speech_intent(self) -> str:
        """Determine the next speech intent based on the conversation flow profile.

        Cycles through the profile's sequence and returns the next intent.
        This mimics the flow logic from adaptive_playback.py and dynamic_flow.py.
        """
        profile = self.get_conversation_profile()
        position = self._customer_state.talk_count % len(profile.sequence)
        return profile.sequence[position]

    # ── Repetition Prevention (from intelligent_orchestrator.py) ──

    def should_play(self, content_id: str) -> bool:
        """Check if a content item should be played (avoiding repetition)."""
        if content_id in self._recently_played:
            return False
        return True

    def mark_played(self, content_id: str) -> None:
        """Mark a content item as recently played."""
        self._recently_played.append(content_id)
        if len(self._recently_played) > self._max_recent_memory:
            self._recently_played.pop(0)

    def get_preferred_content(self, candidates: list[tuple[str, str]]) -> str | None:
        """Select from candidates, avoiding recently played items.

        Args:
            candidates: List of (content_id, content_text) tuples

        Returns:
            Selected content_text, or best fallback from candidates
        """
        available = [c for c in candidates if self.should_play(c[0])]
        if not available:
            available = candidates  # Reset: all have been played

        chosen = random.choice(available) if available else None
        if chosen:
            self.mark_played(chosen[0])
            return chosen[1]
        return None

    # ── Interruption Handling (from interruptible_runtime.py) ─────

    def signal_interruption(self) -> None:
        """Signal that the customer interrupted the AI's speech."""
        self._interrupt_flag = True
        self._customer_state.interruption_count += 1
        logger.info("⚠ Customer interruption detected (count=%d)", self._customer_state.interruption_count)

    def clear_interruption(self) -> None:
        """Clear the interruption flag after handling it."""
        self._interrupt_flag = False

    @property
    def is_interrupted(self) -> bool:
        return self._interrupt_flag

    def get_recovery_flow(self) -> list[str]:
        """Generate a recovery conversation flow after interruption.

        This mimics the recovery logic from interruptible_runtime.py.
        """
        self._interrupt_flag = False
        return ["empathy", "reassurance"]

    # ── Conversation Analysis ─────────────────────────────────────

    def analyze_sentiment_profile(self, text: str) -> dict[str, float]:
        """Multi-dimension sentiment analysis (from conversation_analyzer.py).

        Returns scores for each emotion dimension.
        """
        lower = text.lower()
        scores = {}

        # Count pattern matches for each dimension
        dimensions = {
            "anger": ANGRY_PATTERNS,
            "confusion": CONFUSED_PATTERNS,
            "positive": POSITIVE_PATTERNS,
            "wrong_identity": WRONG_NUMBER_PATTERNS,
            "callback": BUSY_PATTERNS,
        }

        for dim, patterns in dimensions.items():
            score = sum(1 for p in patterns if p in lower)
            scores[dim] = score / max(len(patterns), 1)

        return scores

    def add_to_history(self, role: str, content: str) -> None:
        """Add a message to the conversation history."""
        self._conversation_history.append({
            "role": role,
            "content": content,
            "timestamp": time.time(),
        })

    def get_context_summary(self) -> str:
        """Generate a brief context summary for LLM injection."""
        return (
            f"Customer emotion: {self._customer_state.emotion.value}. "
            f"Trust level: {self._customer_state.trust}/10. "
            f"Patience: {self._customer_state.patience}/10. "
            f"Topics discussed: {', '.join(self._customer_state.topics[-3:]) or 'none yet'}. "
            f"Turns: {self._customer_state.talk_count}."
        )


# ── Singleton ───────────────────────────────────────────────────────

_adaptive_service: AdaptiveConversationService | None = None


def get_adaptive_conversation_service() -> AdaptiveConversationService:
    global _adaptive_service
    if _adaptive_service is None:
        _adaptive_service = AdaptiveConversationService()
    return _adaptive_service
