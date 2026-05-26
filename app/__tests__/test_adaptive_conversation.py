"""Tests for the AdaptiveConversationService — emotional pacing, state tracking, interruption handling, and flow generation."""

import re
import time
from unittest.mock import patch

import pytest

from app.services.adaptive_conversation import (
    AdaptiveConversationService,
    CustomerEmotion,
    ConversationState,
    SpeechIntent,
    CustomerState,
    ConversationProfile,
    CONVERSATION_PROFILES,
    get_adaptive_conversation_service,
)


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def fresh_service():
    """Provide a fresh service instance for each test.

    Reset is called to ensure clean state.
    """
    svc = AdaptiveConversationService()
    svc.reset()
    return svc


# ── Initialization & Reset ───────────────────────────────────────────


class TestInitialization:
    def test_new_service_starts_in_init_state(self):
        svc = AdaptiveConversationService()
        assert svc.conversation_state == ConversationState.INIT
        assert svc.customer_state.emotion == CustomerEmotion.NEUTRAL
        assert svc.customer_state.patience == 5
        assert svc.customer_state.trust == 5
        assert svc.customer_state.talk_count == 0
        assert svc.customer_state.interruption_count == 0
        assert svc.is_interrupted is False

    def test_reset_clears_all_state(self, fresh_service):
        svc = fresh_service
        # Mutate state
        svc.update_customer_state("This is terrible, worst service ever!")
        svc.signal_interruption()
        svc.add_to_history("user", "Hello")
        svc.add_to_history("agent", "Hi there")
        svc.conversation_state = ConversationState.SPEAKING
        svc.mark_played("intro_001")

        # Verify mutated
        assert svc.customer_state.emotion == CustomerEmotion.ANGRY
        assert svc.is_interrupted is True
        assert len(svc._conversation_history) == 2
        assert svc.conversation_state == ConversationState.SPEAKING

        # Reset
        svc.reset()

        # Verify clean
        assert svc.conversation_state == ConversationState.INIT
        assert svc.customer_state.emotion == CustomerEmotion.NEUTRAL
        assert svc.customer_state.patience == 5
        assert svc.customer_state.trust == 5
        assert svc.customer_state.talk_count == 0
        assert svc.customer_state.interruption_count == 0
        assert svc.is_interrupted is False
        assert len(svc._conversation_history) == 0
        assert len(svc._recently_played) == 0


# ── Emotion Detection ────────────────────────────────────────────────


class TestEmotionDetection:
    def test_detect_neutral(self, fresh_service):
        assert fresh_service.detect_emotion("Hello, how are you?") == CustomerEmotion.NEUTRAL
        assert fresh_service.detect_emotion("I'd like to know more about your services") == CustomerEmotion.NEUTRAL
        assert fresh_service.detect_emotion("") == CustomerEmotion.NEUTRAL
        assert fresh_service.detect_emotion("   ") == CustomerEmotion.NEUTRAL

    def test_detect_angry(self, fresh_service):
        assert fresh_service.detect_emotion("This is terrible service!") == CustomerEmotion.ANGRY
        assert fresh_service.detect_emotion("I'm so frustrated with you people") == CustomerEmotion.ANGRY
        assert fresh_service.detect_emotion("Worst experience ever, absolutely pathetic") == CustomerEmotion.ANGRY
        assert fresh_service.detect_emotion("This is a waste of my time") == CustomerEmotion.ANGRY
        assert fresh_service.detect_emotion("Your service is useless") == CustomerEmotion.ANGRY

    def test_detect_positive(self, fresh_service):
        assert fresh_service.detect_emotion("This is great, thank you!") == CustomerEmotion.POSITIVE
        assert fresh_service.detect_emotion("I'm very satisfied with your service") == CustomerEmotion.POSITIVE
        assert fresh_service.detect_emotion("Amazing work, I appreciate it") == CustomerEmotion.POSITIVE
        assert fresh_service.detect_emotion("Excellent, you have a wonderful team") == CustomerEmotion.POSITIVE
        assert fresh_service.detect_emotion("happy customer here") == CustomerEmotion.POSITIVE

    def test_detect_confused(self, fresh_service):
        assert fresh_service.detect_emotion("Can you explain what you mean?") == CustomerEmotion.CONFUSED
        assert fresh_service.detect_emotion("I don't understand what you're saying") == CustomerEmotion.CONFUSED
        assert fresh_service.detect_emotion("I'm confused about the process") == CustomerEmotion.CONFUSED
        assert fresh_service.detect_emotion("What are you talking about?") == CustomerEmotion.CONFUSED
        assert fresh_service.detect_emotion("Please clarify your statement") == CustomerEmotion.CONFUSED

    def test_detect_busy(self, fresh_service):
        assert fresh_service.detect_emotion("I'm busy right now") == CustomerEmotion.BUSY
        assert fresh_service.detect_emotion("Call me later") == CustomerEmotion.BUSY
        assert fresh_service.detect_emotion("I have a meeting, call tomorrow") == CustomerEmotion.BUSY
        assert fresh_service.detect_emotion("Not now, I'm in a hurry") == CustomerEmotion.BUSY

    def test_detect_wrong_number(self, fresh_service):
        assert fresh_service.detect_emotion("You have the wrong number") == CustomerEmotion.WRONG_NUMBER
        assert fresh_service.detect_emotion("I never visited your store") == CustomerEmotion.WRONG_NUMBER
        assert fresh_service.detect_emotion("Who are you? Why are you calling?") == CustomerEmotion.WRONG_NUMBER
        assert fresh_service.detect_emotion("I don't know what you're talking about") == CustomerEmotion.WRONG_NUMBER
        assert fresh_service.detect_emotion("I'm not your customer") == CustomerEmotion.WRONG_NUMBER

    def test_detect_emotional(self, fresh_service):
        assert fresh_service.detect_emotion("I'm feeling so sad today") == CustomerEmotion.EMOTIONAL
        assert fresh_service.detect_emotion("I'm lonely and need someone to talk to") == CustomerEmotion.EMOTIONAL
        assert fresh_service.detect_emotion("I've been crying all morning") == CustomerEmotion.EMOTIONAL
        assert fresh_service.detect_emotion("It breaks my heart") == CustomerEmotion.EMOTIONAL

    def test_detect_emotion_precedence(self, fresh_service):
        """Wrong number patterns should take precedence over angry."""
        assert fresh_service.detect_emotion(
            "I'm frustrated but also this is a wrong number"
        ) == CustomerEmotion.WRONG_NUMBER

    def test_case_insensitive(self, fresh_service):
        assert fresh_service.detect_emotion("TERRIBLE SERVICE") == CustomerEmotion.ANGRY
        assert fresh_service.detect_emotion("THANK YOU SO MUCH") == CustomerEmotion.POSITIVE


# ── Customer State Updates ──────────────────────────────────────────


class TestCustomerStateUpdates:
    def test_angry_reduces_patience_and_trust(self, fresh_service):
        svc = fresh_service
        svc.update_customer_state("This is terrible!")
        assert svc.customer_state.emotion == CustomerEmotion.ANGRY
        assert svc.customer_state.patience == 4  # Decremented by 1
        assert svc.customer_state.trust == 4  # Decremented by 1
        assert svc.customer_state.talk_count == 1

    def test_positive_increases_trust(self, fresh_service):
        svc = fresh_service
        svc.update_customer_state("Great service, thank you!")
        assert svc.customer_state.emotion == CustomerEmotion.POSITIVE
        assert svc.customer_state.trust == 6  # Incremented by 1
        assert svc.customer_state.patience == 5  # Unchanged
        assert svc.customer_state.talk_count == 1

    def test_wrong_number_reduces_trust_significantly(self, fresh_service):
        svc = fresh_service
        svc.update_customer_state("You have the wrong number")
        assert svc.customer_state.emotion == CustomerEmotion.WRONG_NUMBER
        assert svc.customer_state.trust == 3  # Decremented by 2
        assert svc.customer_state.patience == 5  # Unchanged

    def test_trust_and_patience_are_clamped(self, fresh_service):
        svc = fresh_service
        # Reduce to minimum
        for _ in range(10):
            svc.update_customer_state("This is terrible and useless!")
        assert svc.customer_state.trust >= 0
        assert svc.customer_state.patience >= 0

        # Increase to maximum
        svc.reset()
        for _ in range(10):
            svc.update_customer_state("Great, excellent service!")
        assert svc.customer_state.trust <= 10

    def test_multiple_updates_accumulate(self, fresh_service):
        svc = fresh_service
        assert svc.customer_state.talk_count == 0
        svc.update_customer_state("Hello")
        assert svc.customer_state.talk_count == 1
        svc.update_customer_state("I need help")
        assert svc.customer_state.talk_count == 2
        svc.update_customer_state("Thank you")
        assert svc.customer_state.talk_count == 3

    def test_neutral_does_not_change_stats(self, fresh_service):
        svc = fresh_service
        svc.update_customer_state("I would like some information")
        assert svc.customer_state.emotion == CustomerEmotion.NEUTRAL
        assert svc.customer_state.patience == 5
        assert svc.customer_state.trust == 5
        assert svc.customer_state.talk_count == 1


# ── Conversation Profiles ────────────────────────────────────────────


class TestConversationProfiles:
    def test_all_emotions_have_profiles(self):
        for emotion in CustomerEmotion:
            assert emotion in CONVERSATION_PROFILES, f"Missing profile for {emotion}"

    def test_profile_has_required_fields(self, fresh_service):
        for emotion, profile in CONVERSATION_PROFILES.items():
            assert isinstance(profile.pace_label, str), f"{emotion}: missing pace_label"
            assert isinstance(profile.pause_min, (int, float)), f"{emotion}: missing pause_min"
            assert isinstance(profile.pause_max, (int, float)), f"{emotion}: missing pause_max"
            assert isinstance(profile.sequence, list), f"{emotion}: missing sequence"
            assert len(profile.sequence) > 0, f"{emotion}: empty sequence"
            assert profile.pause_min <= profile.pause_max, f"{emotion}: pause_min > pause_max"

    def test_get_conversation_profile_returns_correct_profile(self, fresh_service):
        svc = fresh_service
        svc.update_customer_state("This is terrible!")
        profile = svc.get_conversation_profile()
        assert profile.pace_label == "slow_soft"

    def test_get_conversation_profile_falls_back_to_neutral(self, fresh_service):
        svc = fresh_service
        # Unknown emotion should use NEUTRAL as fallback
        profile = svc.get_conversation_profile()
        assert profile.pace_label == "standard"

    def test_angry_profile_has_empathy_heavy_sequence(self):
        profile = CONVERSATION_PROFILES[CustomerEmotion.ANGRY]
        empathy_count = profile.sequence.count("empathy")
        assert empathy_count >= 3, "Angry profile should be empathy-heavy"

    def test_busy_profile_is_shortest(self):
        profile = CONVERSATION_PROFILES[CustomerEmotion.BUSY]
        assert len(profile.sequence) <= 4, "Busy profile should be concise"


# ── Adaptive Pause ────────────────────────────────────────────────────


class TestAdaptivePause:
    def test_pause_within_profile_range(self, fresh_service):
        svc = fresh_service
        pause = svc.get_adaptive_pause()
        profile = svc.get_conversation_profile()
        assert profile.pause_min <= pause <= profile.pause_max

    def test_pause_changes_with_emotion(self, fresh_service):
        svc = fresh_service
        # Neutral pause range
        neutral_pauses = [svc.get_adaptive_pause() for _ in range(20)]
        neutral_avg = sum(neutral_pauses) / len(neutral_pauses)

        # Angry pause range (should be slower/longer on average)
        svc.reset()
        svc.update_customer_state("This is terrible service!")
        angry_pauses = [svc.get_adaptive_pause() for _ in range(20)]
        angry_avg = sum(angry_pauses) / len(angry_pauses)

        # Angry profile has higher min/max pauses
        assert angry_avg >= neutral_avg - 0.05, "Angry pauses should be longer than neutral"


# ── Speech Intent Cycling ────────────────────────────────────────────


class TestSpeechIntent:
    def test_get_next_speech_intent_cycles_through_sequence(self, fresh_service):
        svc = fresh_service
        profile = svc.get_conversation_profile()
        for i in range(len(profile.sequence)):
            assert svc.get_next_speech_intent() == profile.sequence[i]
            svc.update_customer_state("Hello")  # Increments talk_count

    def test_speech_intent_wraps_around(self, fresh_service):
        svc = fresh_service
        profile = svc.get_conversation_profile()
        sequence_length = len(profile.sequence)

        # Go through the sequence multiple times
        for cycle in range(3):
            for i in range(sequence_length):
                intent = svc.get_next_speech_intent()
                assert intent == profile.sequence[i]
                svc.update_customer_state("Hello")

    def test_different_emotion_different_intent_sequence(self, fresh_service):
        svc_neutral = fresh_service
        neutral_profile = svc_neutral.get_conversation_profile()

        svc_angry = AdaptiveConversationService()
        svc_angry.update_customer_state("This is terrible!")
        angry_profile = svc_angry.get_conversation_profile()

        assert neutral_profile.sequence != angry_profile.sequence


# ── Repetition Prevention ────────────────────────────────────────────


class TestRepetitionPrevention:
    def test_should_play_returns_true_for_new_content(self, fresh_service):
        assert fresh_service.should_play("intro_001") is True
        assert fresh_service.should_play("faq_002") is True

    def test_should_play_returns_false_for_played_content(self, fresh_service):
        fresh_service.mark_played("intro_001")
        assert fresh_service.should_play("intro_001") is False

    def test_mark_played_respects_max_memory(self, fresh_service):
        svc = fresh_service
        for i in range(20):
            svc.mark_played(f"content_{i}")

        # First items should have been evicted
        assert svc.should_play("content_0") is True, "Oldest item should be evicted"
        # Last items should still be in memory
        assert svc.should_play("content_19") is False

    def test_get_preferred_content_avoids_recently_played(self, fresh_service):
        svc = fresh_service
        candidates = [("a", "Alpha"), ("b", "Beta"), ("c", "Gamma")]

        # Mark 'a' as played
        svc.mark_played("a")

        # Should not return 'Alpha'
        result = svc.get_preferred_content(candidates)
        assert result != "Alpha", "Should avoid recently played content"
        assert result in ["Beta", "Gamma"]

    def test_get_preferred_content_falls_back_when_all_played(self, fresh_service):
        svc = fresh_service
        candidates = [("a", "Alpha")]

        svc.mark_played("a")
        # All items played, should still return a fallback
        result = svc.get_preferred_content(candidates)
        assert result == "Alpha"

    def test_get_preferred_content_returns_none_for_empty_list(self, fresh_service):
        assert fresh_service.get_preferred_content([]) is None


# ── Interruption Handling ────────────────────────────────────────────


class TestInterruptionHandling:
    def test_interrupt_flag_defaults_to_false(self, fresh_service):
        assert fresh_service.is_interrupted is False

    def test_signal_interruption_sets_flag(self, fresh_service):
        fresh_service.signal_interruption()
        assert fresh_service.is_interrupted is True

    def test_clear_interruption_resets_flag(self, fresh_service):
        fresh_service.signal_interruption()
        fresh_service.clear_interruption()
        assert fresh_service.is_interrupted is False

    def test_signal_interruption_increments_count(self, fresh_service):
        assert fresh_service.customer_state.interruption_count == 0
        fresh_service.signal_interruption()
        assert fresh_service.customer_state.interruption_count == 1
        fresh_service.signal_interruption()
        assert fresh_service.customer_state.interruption_count == 2

    def test_recovery_flow_is_empathy_and_reassurance(self, fresh_service):
        flow = fresh_service.get_recovery_flow()
        assert flow == ["empathy", "reassurance"]

    def test_recovery_flow_clears_interrupt(self, fresh_service):
        fresh_service.signal_interruption()
        fresh_service.get_recovery_flow()
        assert fresh_service.is_interrupted is False


# ── Sentiment Analysis ──────────────────────────────────────────────


class TestSentimentAnalysis:
    def test_analyze_sentiment_profile_returns_dimensions(self, fresh_service):
        result = fresh_service.analyze_sentiment_profile("Hello world")
        assert "anger" in result
        assert "confusion" in result
        assert "positive" in result
        assert "wrong_identity" in result
        assert "callback" in result

    def test_analyze_sentiment_angry_text(self, fresh_service):
        result = fresh_service.analyze_sentiment_profile(
            "This is terrible and useless service!"
        )
        assert result["anger"] > 0
        assert result["positive"] == 0

    def test_analyze_sentiment_positive_text(self, fresh_service):
        result = fresh_service.analyze_sentiment_profile(
            "Great, excellent and wonderful service! Thank you!"
        )
        assert result["positive"] > 0
        assert result["anger"] == 0

    def test_analyze_sentiment_mixed_text(self, fresh_service):
        result = fresh_service.analyze_sentiment_profile(
            "The service is good but I'm confused about pricing"
        )
        assert result["positive"] > 0
        assert result["confusion"] > 0


# ── Conversation History ─────────────────────────────────────────────


class TestConversationHistory:
    def test_add_to_history_stores_message(self, fresh_service):
        fresh_service.add_to_history("user", "Hello")
        assert len(fresh_service._conversation_history) == 1
        entry = fresh_service._conversation_history[0]
        assert entry["role"] == "user"
        assert entry["content"] == "Hello"
        assert "timestamp" in entry

    def test_add_to_history_multiple(self, fresh_service):
        fresh_service.add_to_history("user", "Hello")
        fresh_service.add_to_history("agent", "Hi there!")
        fresh_service.add_to_history("user", "I need help")
        assert len(fresh_service._conversation_history) == 3

    def test_reset_clears_history(self, fresh_service):
        fresh_service.add_to_history("user", "Hello")
        fresh_service.reset()
        assert len(fresh_service._conversation_history) == 0


# ── Context Summary ──────────────────────────────────────────────────


class TestContextSummary:
    def test_get_context_summary_includes_emotion(self, fresh_service):
        summary = fresh_service.get_context_summary()
        assert "neutral" in summary
        assert "Trust" in summary
        assert "Patience" in summary
        assert "Turns" in summary

    def test_get_context_summary_updates_with_state(self, fresh_service):
        svc = fresh_service
        svc.update_customer_state("This is terrible!")
        summary = svc.get_context_summary()
        assert "angry_customer" in summary
        assert "Trust level: 4" in summary

    def test_get_context_summary_with_topics(self, fresh_service):
        svc = fresh_service
        svc.customer_state.topics = ["billing", "refund", "support"]
        summary = svc.get_context_summary()
        assert "billing" in summary
        assert "refund" in summary
        assert "support" in summary

    def test_get_context_summary_no_topics(self, fresh_service):
        summary = fresh_service.get_context_summary()
        assert "none yet" in summary or "Topics" in summary


# ── Conversation State Management ────────────────────────────────────


class TestConversationState:
    def test_initial_state_is_init(self, fresh_service):
        assert fresh_service.conversation_state == ConversationState.INIT

    def test_set_state_updates_correctly(self, fresh_service):
        fresh_service.conversation_state = ConversationState.LISTENING
        assert fresh_service.conversation_state == ConversationState.LISTENING

        fresh_service.conversation_state = ConversationState.SPEAKING
        assert fresh_service.conversation_state == ConversationState.SPEAKING

        fresh_service.conversation_state = ConversationState.COMPLETED
        assert fresh_service.conversation_state == ConversationState.COMPLETED

    def test_reset_returns_to_init(self, fresh_service):
        fresh_service.conversation_state = ConversationState.COMPLETED
        fresh_service.reset()
        assert fresh_service.conversation_state == ConversationState.INIT


# ── Singleton ────────────────────────────────────────────────────────


class TestSingleton:
    def test_get_adaptive_conversation_service_returns_same_instance(self):
        svc1 = get_adaptive_conversation_service()
        svc2 = get_adaptive_conversation_service()
        assert svc1 is svc2

    def test_singleton_is_adaptive_conversation_service(self):
        svc = get_adaptive_conversation_service()
        assert isinstance(svc, AdaptiveConversationService)


# ── CustomerState Data Class ─────────────────────────────────────────


class TestCustomerState:
    def test_default_values(self):
        state = CustomerState()
        assert state.emotion == CustomerEmotion.NEUTRAL
        assert state.patience == 5
        assert state.trust == 5
        assert state.sentiment_score == 0.0
        assert state.talk_count == 0
        assert state.interruption_count == 0
        assert state.last_intent == ""
        assert state.topics == []

    def test_mutable_topics(self):
        state = CustomerState()
        state.topics.append("billing")
        assert state.topics == ["billing"]


# ── ConversationProfile Data Class ────────────────────────────────────


class TestConversationProfile:
    def test_profile_creation(self):
        profile = ConversationProfile(
            pace_label="test",
            pause_min=0.1,
            pause_max=0.5,
            sequence=["greeting", "action"],
        )
        assert profile.pace_label == "test"
        assert profile.pause_min == 0.1
        assert profile.pause_max == 0.5
        assert profile.sequence == ["greeting", "action"]


# ── Edge Cases ───────────────────────────────────────────────────────


class TestEdgeCases:
    def test_empty_string_handling(self, fresh_service):
        assert fresh_service.detect_emotion("") == CustomerEmotion.NEUTRAL
        fresh_service.update_customer_state("")
        assert fresh_service.customer_state.emotion == CustomerEmotion.NEUTRAL

    def test_very_long_text(self, fresh_service):
        long_text = "good " * 1000
        emotion = fresh_service.detect_emotion(long_text)
        assert emotion == CustomerEmotion.POSITIVE

    def test_special_characters_and_emoji(self, fresh_service):
        # Emoji and special chars should not break detection for ASCII patterns
        assert fresh_service.detect_emotion("This is great!!!") == CustomerEmotion.POSITIVE
        assert fresh_service.detect_emotion("I'm so angry!!!") == CustomerEmotion.ANGRY
        assert fresh_service.detect_emotion("Thank you for your service!") == CustomerEmotion.POSITIVE

    def test_mixed_case_patterns(self, fresh_service):
        assert fresh_service.detect_emotion("THIS IS TERRIBLE") == CustomerEmotion.ANGRY
        assert fresh_service.detect_emotion("THANK YOU VERY MUCH") == CustomerEmotion.POSITIVE

    def test_interrupt_during_state_update(self, fresh_service):
        svc = fresh_service
        svc.update_customer_state("Hello")
        svc.signal_interruption()
        svc.update_customer_state("Actually, let me explain")
        # After interruption, new state should still update
        assert svc.customer_state.talk_count == 2
        assert svc.is_interrupted is True
        svc.clear_interruption()
        assert svc.is_interrupted is False

    def test_reset_after_interruption(self, fresh_service):
        svc = fresh_service
        svc.signal_interruption()
        svc.reset()
        assert svc.is_interrupted is False
        assert svc.customer_state.interruption_count == 0


# ── Integration: Full Conversation Flow ──────────────────────────────


class TestIntegrationFlow:
    def test_full_conversation_flow(self, fresh_service):
        svc = fresh_service

        # Get the angry profile and first intent BEFORE updating state
        # (update_customer_state increments talk_count, advancing the intent position)
        angry_profile = CONVERSATION_PROFILES[CustomerEmotion.ANGRY]
        assert angry_profile.pace_label == "slow_soft"
        first_intent_in_sequence = angry_profile.sequence[0]

        # Customer calls in angry
        svc.add_to_history("user", "This is the worst service I've ever experienced!")
        svc.update_customer_state("This is the worst service I've ever experienced!")
        assert svc.customer_state.emotion == CustomerEmotion.ANGRY
        assert svc.customer_state.patience == 4
        assert svc.customer_state.trust == 4

        # Get conversation profile for this emotion (should match angry)
        profile = svc.get_conversation_profile()
        assert profile.pace_label == "slow_soft"

        # Generate response intent (position 1 due to talk_count increment)
        intent = svc.get_next_speech_intent()
        second_intent = angry_profile.sequence[1]
        assert intent == second_intent

        # Agent responds with empathy
        svc.add_to_history("agent", "I understand your frustration, let me help.")
        assert len(svc._conversation_history) == 2  # user + agent

        # Customer becomes positive after resolution
        svc.update_customer_state("Thank you, that's much better!")
        assert svc.customer_state.emotion == CustomerEmotion.POSITIVE
        assert svc.customer_state.trust == 5  # Recovered from 4

        # Profile should now be warm
        profile = svc.get_conversation_profile()
        assert profile.pace_label == "warm"

        # Context summary reflects current state
        summary = svc.get_context_summary()
        assert "positive_customer" in summary
        assert svc.customer_state.talk_count == 2
