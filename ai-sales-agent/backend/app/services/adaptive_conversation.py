"""
Adaptive Conversation Service — Emotional state tracking, conversation profiles, and flow generation.

Provides the CustomerEmotion enum used by advanced modules (state engine, orchestrator, adaptive playback).
"""

import logging
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger("ai_sales_agent.adaptive_conversation")


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


# ── Conversation Profiles ───────────────────────────────────────────

CONVERSATION_PROFILES: dict[CustomerEmotion, ConversationProfile] = {
    CustomerEmotion.ANGRY: ConversationProfile(
        pace_label="slow_soft",
        pause_min=0.18,
        pause_max=0.38,
        sequence=["filler", "empathy", "empathy", "reassurance", "filler", "empathy", "reassurance", "action"],
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
        sequence=["filler", "empathy", "empathy", "filler", "reassurance", "empathy", "reassurance", "empathy"],
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

# ── Sentiment Patterns ──

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
    """Orchestrates adaptive conversation flow with emotional awareness."""

    def __init__(self):
        self._customer_state = CustomerState()
        self._conversation_state = ConversationState.INIT
        self._recently_played: list[str] = []
        self._max_recent_memory = 8
        self._interrupt_flag = False
        self._conversation_history: list[dict] = []

    # ── State Management ──────────────────────────────────────────

    def reset(self) -> None:
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
    def conversation_state(self, value):
        prev = self._conversation_state
        prev_name = prev.value if hasattr(prev, "value") else str(prev)
        new_name = value.value if hasattr(value, "value") else str(value)
        logger.debug("Conversation state: %s -> %s", prev_name, new_name)
        self._conversation_state = value

    # ── Emotion Detection ─────────────────────────────────────────

    def detect_emotion(self, text: str) -> CustomerEmotion:
        """Detect customer emotion from text input using multi-pattern matching."""
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
        return CustomerEmotion.NEUTRAL

    def _extract_topics(self, text: str) -> list[str]:
        """Extract key topics from text for tracking."""
        keywords = ["refund", "billing", "price", "support", "complaint", "order", "delivery",
                    "account", "password", "login", "subscription", "cancel", "upgrade",
                    "discount", "warranty", "return", "shipping", "quality", "service",
                    "appointment", "meeting", "schedule", "booking", "reservation"]
        lower = text.lower()
        found = [kw for kw in keywords if kw in lower]
        return found

    def update_customer_state(self, text: str) -> None:
        """Update the customer state based on new input text."""
        emotion = self.detect_emotion(text)
        self._customer_state.emotion = emotion
        self._customer_state.talk_count += 1
        # Extract topics
        topics = self._extract_topics(text)
        for t in topics:
            if t not in self._customer_state.topics:
                self._customer_state.topics.append(t)
        if emotion == CustomerEmotion.ANGRY:
            self._customer_state.patience = max(0, self._customer_state.patience - 1)
            self._customer_state.trust = max(0, self._customer_state.trust - 1)
        elif emotion == CustomerEmotion.POSITIVE:
            self._customer_state.trust = min(10, self._customer_state.trust + 1)
        elif emotion == CustomerEmotion.WRONG_NUMBER:
            self._customer_state.trust = max(0, self._customer_state.trust - 2)
        self._customer_state.patience = max(0, min(10, self._customer_state.patience))
        self._customer_state.trust = max(0, min(10, self._customer_state.trust))
        logger.debug("Customer state: emotion=%s, patience=%d, trust=%d", emotion.value, self._customer_state.patience, self._customer_state.trust)

    # ── Flow Generation ───────────────────────────────────────────

    def get_conversation_profile(self) -> ConversationProfile:
        return CONVERSATION_PROFILES.get(self._customer_state.emotion, CONVERSATION_PROFILES[CustomerEmotion.NEUTRAL])

    def get_adaptive_pause(self) -> float:
        profile = self.get_conversation_profile()
        return random.uniform(profile.pause_min, profile.pause_max)

    def get_next_speech_intent(self) -> str:
        profile = self.get_conversation_profile()
        position = self._customer_state.talk_count % len(profile.sequence)
        return profile.sequence[position]

    # ── Repetition Prevention ─────────────────────────────────────

    def should_play(self, content_id: str) -> bool:
        return content_id not in self._recently_played

    def mark_played(self, content_id: str) -> None:
        self._recently_played.append(content_id)
        if len(self._recently_played) > self._max_recent_memory:
            self._recently_played.pop(0)

    def get_preferred_content(self, candidates: list[tuple[str, str]]) -> str | None:
        available = [c for c in candidates if self.should_play(c[0])]
        if not available:
            available = candidates
        chosen = random.choice(available) if available else None
        if chosen:
            self.mark_played(chosen[0])
            return chosen[1]
        return None

    # ── Interruption Handling ─────────────────────────────────────

    def signal_interruption(self) -> None:
        self._interrupt_flag = True
        self._customer_state.interruption_count += 1
        logger.info("Customer interruption detected (count=%d)", self._customer_state.interruption_count)

    def clear_interruption(self) -> None:
        self._interrupt_flag = False

    @property
    def is_interrupted(self) -> bool:
        return self._interrupt_flag

    def get_recovery_flow(self) -> list[str]:
        self._interrupt_flag = False
        return ["empathy", "reassurance"]

    # ── Conversation Analysis ─────────────────────────────────────

    def analyze_sentiment_profile(self, text: str) -> dict[str, float]:
        lower = text.lower()
        dimensions = {
            "anger": ANGRY_PATTERNS,
            "confusion": CONFUSED_PATTERNS,
            "positive": POSITIVE_PATTERNS,
            "wrong_identity": WRONG_NUMBER_PATTERNS,
            "callback": BUSY_PATTERNS,
        }
        scores = {}
        for dim, patterns in dimensions.items():
            score = sum(1 for p in patterns if p in lower)
            scores[dim] = score / max(len(patterns), 1)
        return scores

    def add_to_history(self, role: str, content: str) -> None:
        self._conversation_history.append({"role": role, "content": content, "timestamp": time.time()})

    def get_context_summary(self) -> str:
        return (
            f"Customer emotion: {self._customer_state.emotion.value}. "
            f"Trust level: {self._customer_state.trust}/10. "
            f"Patience: {self._customer_state.patience}/10. "
            f"Topics: {', '.join(self._customer_state.topics[-3:]) or 'none yet'}. "
            f"Turns: {self._customer_state.talk_count}."
        )


# ── Singleton ───────────────────────────────────────────────────────

_adaptive_service: AdaptiveConversationService | None = None


def get_adaptive_conversation_service() -> AdaptiveConversationService:
    global _adaptive_service
    if _adaptive_service is None:
        _adaptive_service = AdaptiveConversationService()
    return _adaptive_service
