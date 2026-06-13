"""Tests for the Adaptive Playback Engine."""

import pytest
from app.advanced.adaptive_playback import (
    AdaptivePlaybackEngine,
    get_adaptive_playback_engine,
    ConversationProfile,
    PlaybackItem,
    EMOTION_PROFILES,
    INTENT_LABELS,
)
from app.services.adaptive_conversation import CustomerEmotion


@pytest.fixture
def engine():
    e = get_adaptive_playback_engine()
    return e


class TestConversationProfile:
    def test_default_profile_values(self):
        profile = ConversationProfile("test", 0.1, 0.3, ["question", "action"])
        assert profile.pace_label == "test"
        assert profile.pause_min == 0.1
        assert profile.pause_max == 0.3
        assert profile.sequence == ["question", "action"]

    def test_invalid_pause_range(self):
        profile = ConversationProfile("a", 0.3, 0.1, ["x"])
        assert profile.pause_min > profile.pause_max


class TestPlaybackItem:
    def test_default_values(self):
        item = PlaybackItem(clip_id="test", clip_type="filler")
        assert item.pause_before == 0.15
        assert item.pause_after == 0.1
        assert item.priority == 5
        assert item.text is None

    def test_with_all_fields(self):
        item = PlaybackItem(
            clip_id="test_1", clip_type="empathy", text="I understand",
            audio_file="clip.wav", file_path="/audio/clip.wav",
            pause_before=0.2, pause_after=0.3, priority=10,
        )
        assert item.text == "I understand"
        assert item.priority == 10


class TestEmotionProfiles:
    def test_all_emotions_have_profiles(self):
        for emotion in CustomerEmotion:
            assert emotion in EMOTION_PROFILES, f"{emotion} missing from profiles"

    def test_angry_profile_pace(self):
        profile = EMOTION_PROFILES[CustomerEmotion.ANGRY]
        assert profile.pace_label == "slow_soft"
        assert "empathy" in profile.sequence

    def test_busy_profile_pace(self):
        profile = EMOTION_PROFILES[CustomerEmotion.BUSY]
        assert profile.pace_label == "fast_direct"
        assert len(profile.sequence) == 4  # Short sequence for busy customers

    def test_neutral_profile_pace(self):
        profile = EMOTION_PROFILES[CustomerEmotion.NEUTRAL]
        assert profile.pace_label == "standard"

    def test_intent_labels_defined(self):
        expected = {"filler", "empathy", "reassurance", "action", "question", "apology", "validation", "closing", "greeting"}
        assert set(INTENT_LABELS.keys()) == expected


class TestGetProfile:
    def test_get_profile_returns_correct(self, engine):
        profile = engine.get_profile(CustomerEmotion.ANGRY)
        assert profile.pace_label == "slow_soft"

    def test_get_profile_unknown_emotion(self, engine):
        profile = engine.get_profile(CustomerEmotion.NEUTRAL)
        assert profile.pace_label == "standard"


class TestAdaptivePause:
    def test_get_adaptive_pause_returns_float(self, engine):
        pause = engine.get_adaptive_pause(CustomerEmotion.NEUTRAL)
        assert isinstance(pause, float)
        assert 0.0 < pause < 1.0

    def test_get_adaptive_pause_within_profile_range(self, engine):
        pause_busy = engine.get_adaptive_pause(CustomerEmotion.BUSY)
        profile = engine.get_profile(CustomerEmotion.BUSY)
        assert profile.pause_min <= pause_busy <= profile.pause_max

    def test_busy_pause_is_shorter_than_angry(self, engine):
        pause_busy = engine.get_adaptive_pause(CustomerEmotion.BUSY)
        pause_angry = engine.get_adaptive_pause(CustomerEmotion.ANGRY)
        # Busy should generally be faster
        assert pause_busy <= pause_angry + 0.1  # Allow slight overlap


class TestNextIntent:
    def test_get_next_intent_returns_string(self, engine):
        intent = engine.get_next_intent(CustomerEmotion.NEUTRAL, talk_count=0)
        assert isinstance(intent, str)

    def test_get_next_intent_cycles_through_sequence(self, engine):
        profile = engine.get_profile(CustomerEmotion.NEUTRAL)
        first = engine.get_next_intent(CustomerEmotion.NEUTRAL, talk_count=0)
        assert first == profile.sequence[0]
        mid = engine.get_next_intent(CustomerEmotion.NEUTRAL, talk_count=2)
        assert mid == profile.sequence[2 % len(profile.sequence)]

    def test_get_next_intent_wraps_around(self, engine):
        profile = engine.get_profile(CustomerEmotion.BUSY)
        wrapped = engine.get_next_intent(CustomerEmotion.BUSY, talk_count=len(profile.sequence))
        assert wrapped == profile.sequence[0]


class TestGenerateFlow:
    def test_generate_flow_returns_list(self, engine):
        flow = engine.generate_flow(CustomerEmotion.NEUTRAL, turns=3)
        assert isinstance(flow, list)
        assert len(flow) == 3

    def test_generate_flow_items_are_playback_items(self, engine):
        flow = engine.generate_flow(CustomerEmotion.BUSY, turns=2)
        for item in flow:
            assert isinstance(item, PlaybackItem)

    def test_generate_flow_default_turns(self, engine):
        flow = engine.generate_flow(CustomerEmotion.NEUTRAL)
        assert len(flow) == 6

    def test_generate_flow_items_have_types(self, engine):
        flow = engine.generate_flow(CustomerEmotion.NEUTRAL, turns=4)
        types = [item.clip_type for item in flow]
        assert len(types) == 4


class TestBuildQueue:
    def test_build_queue_returns_list(self, engine):
        queue = engine.build_queue(CustomerEmotion.NEUTRAL)
        assert isinstance(queue, list)

    def test_build_queue_with_override_sequence(self, engine):
        queue = engine.build_queue(CustomerEmotion.NEUTRAL, override_sequence=["empathy", "action"])
        assert len(queue) == 2
        assert queue[0].clip_type == "empathy"
        assert queue[1].clip_type == "action"

    def test_build_queue_default_uses_profile_sequence(self, engine):
        profile = engine.get_profile(CustomerEmotion.BUSY)
        queue = engine.build_queue(CustomerEmotion.BUSY)
        assert len(queue) == len(profile.sequence)
        assert queue[0].clip_type == profile.sequence[0]


class TestPromptContext:
    def test_get_prompt_context_returns_string(self, engine):
        context = engine.get_prompt_context(CustomerEmotion.NEUTRAL)
        assert isinstance(context, str)
        assert "Conversation pace:" in context

    def test_get_prompt_context_contains_pace(self, engine):
        context = engine.get_prompt_context(CustomerEmotion.ANGRY)
        assert "slow_soft" in context

    def test_get_prompt_context_contains_labels(self, engine):
        context = engine.get_prompt_context(CustomerEmotion.BUSY)
        assert "Filler" in context or "Reassurance" in context or "Action" in context or "Closing" in context


class TestInterrupt:
    def test_fire_interrupt_does_not_raise(self, engine):
        engine.fire_interrupt()  # No callbacks registered, should not raise

    def test_reset_position_sets_to_zero(self, engine):
        engine._position = 5
        engine.reset_position()
        assert engine._position == 0


class TestSingleton:
    def test_get_adaptive_playback_engine(self):
        e1 = get_adaptive_playback_engine()
        e2 = get_adaptive_playback_engine()
        assert e1 is e2
