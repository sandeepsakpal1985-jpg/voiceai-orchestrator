"""
Adaptive Playback Engine — Emotional pacing, conversation flow profiles, and audio playback orchestration.

Integrates concepts from:
- adaptive_playback.py: Emotional pacing profiles with natural pause timing
- intelligent_orchestrator.py: Smart audio selection with repetition prevention
- dynamic_flow.py: Dynamic conversation flow generation
- playback_engine.py: Playback queue management
- semantic_player.py: Context-aware playback decisions
"""

import asyncio
import logging
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable

from app.advanced.audio_registry import get_audio_registry, AudioClip
from app.services.adaptive_conversation import CustomerEmotion

logger = logging.getLogger("voiceai.advanced.adaptive_playback")


# ── Data Classes ────────────────────────────────────────────────────


@dataclass
class ConversationProfile:
    """Pacing and sequence profile for different customer emotions."""
    pace_label: str
    pause_min: float
    pause_max: float
    sequence: list[str]  # Ordered list of intent types


@dataclass
class PlaybackItem:
    """A single item in the playback queue."""
    clip_id: str
    clip_type: str
    text: str | None = None
    audio_file: str | None = None
    file_path: str | None = None
    pause_before: float = 0.15
    pause_after: float = 0.1
    priority: int = 5


# ── Pacing Profiles (from adaptive_playback.py) ─────────────────────

# Maps from CustomerEmotion -> ConversationProfile
# These are the same profiles from adaptive_playback.py
# but enhanced with additional types from audio_registry.json

EMOTION_PROFILES: dict[CustomerEmotion, ConversationProfile] = {
    CustomerEmotion.ANGRY: ConversationProfile(
        pace_label="slow_soft",
        pause_min=0.18,
        pause_max=0.38,
        sequence=["filler", "empathy", "empathy", "reassurance",
                   "filler", "empathy", "reassurance", "action"],
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
        sequence=["filler", "empathy", "empathy", "filler",
                   "reassurance", "empathy", "validation", "empathy"],
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


# Error intent type for unknown emotions
UNKNOWN_PROFILE = ConversationProfile(
    pace_label="standard",
    pause_min=0.10,
    pause_max=0.25,
    sequence=["question", "action", "reassurance"],
)

# ── Intent Type Labels (for display purposes) ───────────────────────

INTENT_LABELS: dict[str, str] = {
    "filler": "Filler",
    "empathy": "Empathy",
    "reassurance": "Reassurance",
    "action": "Action",
    "question": "Question",
    "apology": "Apology",
    "validation": "Validation",
    "closing": "Closing",
    "greeting": "Greeting",
}


class AdaptivePlaybackEngine:
    """Orchestrates adaptive audio playback with emotional awareness.

    Features:
    - Emotional pacing profiles with natural pause timing
    - Conversation flow sequence generation
    - Smart audio clip selection with repetition prevention
    - Playback queue management
    - Barge-in / interruption awareness
    """

    def __init__(self):
        self._registry = get_audio_registry()
        self._callbacks: list[Callable] = []
        self._position: int = 0
        self._current_emotion: CustomerEmotion = CustomerEmotion.NEUTRAL

    # ── Profile Management ─────────────────────────────────────────

    def get_profile(self, emotion: CustomerEmotion) -> ConversationProfile:
        """Get the appropriate pacing profile for the given emotion."""
        return EMOTION_PROFILES.get(emotion, UNKNOWN_PROFILE)

    def get_sequence(self, emotion: CustomerEmotion) -> list[str]:
        """Get the conversation flow sequence for the given emotion."""
        profile = self.get_profile(emotion)
        return profile.sequence

    def get_adaptive_pause(self, emotion: CustomerEmotion | None = None) -> float:
        """Generate a natural pause duration for the current or specified emotion."""
        profile = self.get_profile(emotion or self._current_emotion)
        return random.uniform(profile.pause_min, profile.pause_max)

    # ── Flow Generation ────────────────────────────────────────────

    def get_next_intent(
        self, emotion: CustomerEmotion, talk_count: int
    ) -> str:
        """Determine the next speech intent based on conversation flow and position.

        Args:
            emotion: The current customer emotion
            talk_count: The number of conversation turns so far

        Returns:
            The next intent type string (e.g., 'empathy', 'reassurance')
        """
        profile = self.get_profile(emotion)
        position = talk_count % len(profile.sequence)
        return profile.sequence[position]

    def generate_flow(
        self, emotion: CustomerEmotion, turns: int = 6
    ) -> list[PlaybackItem]:
        """Generate a full conversation flow for the given emotion.

        Args:
            emotion: The customer emotion to generate flow for
            turns: Number of turns to generate

        Returns:
            List of PlaybackItems with selected audio clips and pauses
        """
        profile = self.get_profile(emotion)
        items: list[PlaybackItem] = []
        previous_type: str | None = None

        for i in range(turns):
            intent_type = profile.sequence[i % len(profile.sequence)]

            # Select the best audio clip for this intent
            clip = self._registry.select_clip(
                clip_type=intent_type,
                context_emotion=emotion.value,
                previous_type=previous_type,
            )

            if clip:
                item = PlaybackItem(
                    clip_id=clip.id,
                    clip_type=intent_type,
                    text=clip.text,
                    audio_file=clip.audio_file,
                    file_path=clip.file_path,
                    pause_before=random.uniform(profile.pause_min, profile.pause_max),
                    pause_after=random.uniform(
                        profile.pause_min * 0.5, profile.pause_max * 0.7
                    ),
                    priority=clip.priority,
                )
            else:
                # Fallback: create a text-only item
                item = PlaybackItem(
                    clip_id=f"gen_{intent_type}_{i}",
                    clip_type=intent_type,
                    pause_before=random.uniform(profile.pause_min, profile.pause_max),
                    pause_after=random.uniform(
                        profile.pause_min * 0.5, profile.pause_max * 0.7
                    ),
                )

            items.append(item)
            previous_type = intent_type

        return items

    # ── Playback Queue Management (from playback_engine.py) ────────

    def build_queue(
        self,
        emotion: CustomerEmotion,
        override_sequence: list[str] | None = None,
    ) -> list[PlaybackItem]:
        """Build a playback queue for the given emotion.

        Args:
            emotion: Current customer emotion
            override_sequence: Optional custom sequence override

        Returns:
            Ordered list of PlaybackItems
        """
        sequence = override_sequence or self.get_sequence(emotion)
        self._current_emotion = emotion
        self._position = 0

        queue: list[PlaybackItem] = []
        previous_type: str | None = None

        for intent_type in sequence:
            clip = self._registry.select_clip(
                clip_type=intent_type,
                context_emotion=emotion.value,
                previous_type=previous_type,
            )
            profile = self.get_profile(emotion)

            if clip:
                queue.append(PlaybackItem(
                    clip_id=clip.id,
                    clip_type=intent_type,
                    text=clip.text,
                    audio_file=clip.audio_file,
                    file_path=clip.file_path,
                    pause_before=random.uniform(profile.pause_min, profile.pause_max),
                    pause_after=random.uniform(profile.pause_min * 0.5, profile.pause_max * 0.7),
                    priority=clip.priority,
                ))
            previous_type = intent_type

        return queue

    def get_next_item(self, queue: list[PlaybackItem]) -> PlaybackItem | None:
        """Get the next item from the playback queue and advance position."""
        if self._position >= len(queue):
            return None
        item = queue[self._position]
        self._position += 1
        return item

    def reset_position(self) -> None:
        """Reset the playback queue position."""
        self._position = 0

    # ── Content Injection for LLM Pipeline ─────────────────────────

    def get_prompt_context(self, emotion: CustomerEmotion) -> str:
        """Generate a prompt context string for LLM injection.

        Tells the LLM what kind of pacing and tone to use based on emotion.
        """
        profile = self.get_profile(emotion)
        labels = [INTENT_LABELS.get(t, t) for t in profile.sequence]

        return (
            f"Conversation pace: {profile.pace_label}. "
            f"Natural pause range: {profile.pause_min:.2f}s-{profile.pause_max:.2f}s. "
            f"Suggested conversation flow: {', '.join(labels)}. "
            f"Keep responses {'short and direct' if emotion == CustomerEmotion.BUSY else 'calm and empathetic' if emotion == CustomerEmotion.ANGRY else 'conversational'}."
        )

    # ── Event Callbacks ────────────────────────────────────────────

    def on_interrupt(self, callback: Callable) -> None:
        """Register an interrupt callback."""
        self._callbacks.append(callback)

    def fire_interrupt(self) -> None:
        """Fire all registered interrupt callbacks."""
        for cb in self._callbacks:
            try:
                cb()
            except Exception as e:
                logger.warning(f"Interrupt callback error: {e}")


# ── Singleton ───────────────────────────────────────────────────────

_engine: AdaptivePlaybackEngine | None = None


def get_adaptive_playback_engine() -> AdaptivePlaybackEngine:
    global _engine
    if _engine is None:
        _engine = AdaptivePlaybackEngine()
    return _engine
