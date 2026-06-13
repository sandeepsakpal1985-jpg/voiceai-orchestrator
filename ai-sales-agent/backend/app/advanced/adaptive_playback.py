"""
Adaptive Playback Engine — Emotional pacing, conversation flow profiles, and audio playback orchestration.
"""

import logging
import random
from dataclasses import dataclass, field
from typing import Callable

from app.advanced.audio_registry import get_audio_registry
from app.services.adaptive_conversation import CustomerEmotion

logger = logging.getLogger("ai_sales_agent.advanced.adaptive_playback")


@dataclass
class ConversationProfile:
    pace_label: str
    pause_min: float
    pause_max: float
    sequence: list[str]


@dataclass
class PlaybackItem:
    clip_id: str
    clip_type: str
    text: str | None = None
    audio_file: str | None = None
    file_path: str | None = None
    pause_before: float = 0.15
    pause_after: float = 0.1
    priority: int = 5


EMOTION_PROFILES: dict[CustomerEmotion, ConversationProfile] = {
    CustomerEmotion.ANGRY: ConversationProfile("slow_soft", 0.18, 0.38, ["filler", "empathy", "empathy", "reassurance", "filler", "empathy", "reassurance", "action"]),
    CustomerEmotion.BUSY: ConversationProfile("fast_direct", 0.05, 0.18, ["filler", "reassurance", "action", "closing"]),
    CustomerEmotion.EMOTIONAL: ConversationProfile("very_soft", 0.22, 0.40, ["filler", "empathy", "empathy", "filler", "reassurance", "empathy", "validation", "empathy"]),
    CustomerEmotion.CONFUSED: ConversationProfile("guided", 0.10, 0.25, ["filler", "reassurance", "question", "filler", "reassurance"]),
    CustomerEmotion.POSITIVE: ConversationProfile("warm", 0.08, 0.20, ["reassurance", "question", "action", "closing"]),
    CustomerEmotion.WRONG_NUMBER: ConversationProfile("apologetic", 0.15, 0.30, ["apology", "reassurance", "closing"]),
    CustomerEmotion.NEUTRAL: ConversationProfile("standard", 0.10, 0.25, ["question", "action", "reassurance"]),
}

UNKNOWN_PROFILE = ConversationProfile("standard", 0.10, 0.25, ["question", "action", "reassurance"])
INTENT_LABELS: dict[str, str] = {"filler": "Filler", "empathy": "Empathy", "reassurance": "Reassurance", "action": "Action", "question": "Question", "apology": "Apology", "validation": "Validation", "closing": "Closing", "greeting": "Greeting"}


class AdaptivePlaybackEngine:
    """Orchestrates adaptive audio playback with emotional awareness."""

    def __init__(self):
        self._registry = get_audio_registry()
        self._callbacks: list[Callable] = []
        self._position: int = 0
        self._current_emotion: CustomerEmotion = CustomerEmotion.NEUTRAL

    def get_profile(self, emotion: CustomerEmotion) -> ConversationProfile:
        return EMOTION_PROFILES.get(emotion, UNKNOWN_PROFILE)

    def get_adaptive_pause(self, emotion: CustomerEmotion | None = None) -> float:
        profile = self.get_profile(emotion or self._current_emotion)
        return random.uniform(profile.pause_min, profile.pause_max)

    def get_next_intent(self, emotion: CustomerEmotion, talk_count: int) -> str:
        profile = self.get_profile(emotion)
        return profile.sequence[talk_count % len(profile.sequence)]

    def generate_flow(self, emotion: CustomerEmotion, turns: int = 6) -> list[PlaybackItem]:
        profile = self.get_profile(emotion)
        items, previous_type = [], None
        for i in range(turns):
            intent_type = profile.sequence[i % len(profile.sequence)]
            clip = self._registry.select_clip(clip_type=intent_type, context_emotion=emotion.value, previous_type=previous_type)
            if clip:
                items.append(PlaybackItem(clip_id=clip.id, clip_type=intent_type, text=clip.text, audio_file=clip.audio_file, file_path=clip.file_path, pause_before=random.uniform(profile.pause_min, profile.pause_max), pause_after=random.uniform(profile.pause_min * 0.5, profile.pause_max * 0.7), priority=clip.priority))
            else:
                items.append(PlaybackItem(clip_id=f"gen_{intent_type}_{i}", clip_type=intent_type, pause_before=random.uniform(profile.pause_min, profile.pause_max), pause_after=random.uniform(profile.pause_min * 0.5, profile.pause_max * 0.7)))
            previous_type = intent_type
        return items

    def get_prompt_context(self, emotion: CustomerEmotion) -> str:
        profile = self.get_profile(emotion)
        labels = [INTENT_LABELS.get(t, t) for t in profile.sequence]
        return f"Conversation pace: {profile.pace_label}. Natural pause range: {profile.pause_min:.2f}s-{profile.pause_max:.2f}s. Suggested flow: {', '.join(labels)}. Keep responses {'short and direct' if emotion == CustomerEmotion.BUSY else 'calm and empathetic' if emotion == CustomerEmotion.ANGRY else 'conversational'}."

    def build_queue(self, emotion: CustomerEmotion, override_sequence: list[str] | None = None) -> list[PlaybackItem]:
        """Build a playback queue for the given emotion with optional custom sequence."""
        profile = self.get_profile(emotion)
        items, previous_type = [], None
        sequence = override_sequence or profile.sequence
        for i, intent_type in enumerate(sequence):
            clip = self._registry.select_clip(clip_type=intent_type, context_emotion=emotion.value, previous_type=previous_type)
            if clip:
                items.append(PlaybackItem(clip_id=clip.id, clip_type=intent_type, text=clip.text, audio_file=clip.audio_file, file_path=clip.file_path, pause_before=random.uniform(profile.pause_min, profile.pause_max), pause_after=random.uniform(profile.pause_min * 0.5, profile.pause_max * 0.7), priority=clip.priority))
            else:
                items.append(PlaybackItem(clip_id=f"gen_{intent_type}_{i}", clip_type=intent_type, pause_before=random.uniform(profile.pause_min, profile.pause_max), pause_after=random.uniform(profile.pause_min * 0.5, profile.pause_max * 0.7)))
            previous_type = intent_type
        return items

    def reset_position(self) -> None:
        self._position = 0

    def fire_interrupt(self) -> None:
        for cb in self._callbacks:
            try:
                cb()
            except Exception as e:
                logger.warning("Interrupt callback error: %s", e)


_engine: AdaptivePlaybackEngine | None = None


def get_adaptive_playback_engine() -> AdaptivePlaybackEngine:
    global _engine
    if _engine is None:
        _engine = AdaptivePlaybackEngine()
    return _engine
