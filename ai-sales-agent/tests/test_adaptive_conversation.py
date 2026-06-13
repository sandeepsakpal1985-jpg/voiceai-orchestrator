"""Tests for the Adaptive Conversation Service."""

import pytest
from app.services.adaptive_conversation import (
    AdaptiveConversationService,
    CustomerEmotion,
    ConversationState,
    SpeechIntent,
    ConversationProfile,
)


@pytest.fixture
def service():
    s = AdaptiveConversationService()
    s.reset()
    return s


class TestCustomerEmotion:
    def test_emotion_values(self):
        assert CustomerEmotion.NEUTRAL.value == "neutral"
        assert CustomerEmotion.ANGRY.value == "angry_customer"
        assert CustomerEmotion.BUSY.value == "busy_customer"
        assert CustomerEmotion.WRONG_NUMBER.value == "wrong_number"


class TestConversationState:
    def test_state_values(self):
        assert ConversationState.INIT.value == "initializing"
        assert ConversationState.LISTENING.value == "listening"


class TestEmotionDetection:
    def test_detect_neutral(self, service):
        assert service.detect_emotion("Hello, how are you?") == CustomerEmotion.NEUTRAL

    def test_detect_angry(self, service):
        assert service.detect_emotion("This is terrible service!") == CustomerEmotion.ANGRY

    def test_detect_wrong_number(self, service):
        assert service.detect_emotion("Wrong number, I never visited.") == CustomerEmotion.WRONG_NUMBER

    def test_detect_positive(self, service):
        assert service.detect_emotion("Great service, thank you!") == CustomerEmotion.POSITIVE

    def test_detect_confused(self, service):
        assert service.detect_emotion("I don't understand what you mean") == CustomerEmotion.CONFUSED

    def test_detect_busy(self, service):
        assert service.detect_emotion("I'm busy right now, call later") == CustomerEmotion.BUSY

    def test_detect_emotional(self, service):
        assert service.detect_emotion("I'm feeling so sad and lonely") == CustomerEmotion.EMOTIONAL

    def test_empty_text_returns_neutral(self, service):
        assert service.detect_emotion("") == CustomerEmotion.NEUTRAL


class TestStateManagement:
    def test_initial_state(self, service):
        assert service.conversation_state == ConversationState.INIT
        assert service.customer_state.emotion == CustomerEmotion.NEUTRAL
        assert service.customer_state.patience == 5
        assert service.customer_state.trust == 5

    def test_set_conversation_state(self, service):
        service.conversation_state = ConversationState.LISTENING
        assert service.conversation_state == ConversationState.LISTENING

    def test_reset(self, service):
        service.conversation_state = ConversationState.SPEAKING
        service.update_customer_state("terrible service")
        service.reset()
        assert service.conversation_state == ConversationState.INIT
        assert service.customer_state.emotion == CustomerEmotion.NEUTRAL
        assert service.customer_state.talk_count == 0

    def test_update_customer_state_increments_talk_count(self, service):
        service.update_customer_state("hello")
        assert service.customer_state.talk_count == 1
        service.update_customer_state("how are you")
        assert service.customer_state.talk_count == 2

    def test_angry_reduces_patience_and_trust(self, service):
        service.update_customer_state("This is terrible and frustrating!")
        assert service.customer_state.patience == 4
        assert service.customer_state.trust == 4

    def test_positive_increases_trust(self, service):
        service.update_customer_state("Great service, thank you!")
        assert service.customer_state.trust == 6

    def test_wrong_number_reduces_trust(self, service):
        service.update_customer_state("Wrong number, who are you?")
        assert service.customer_state.trust == 3

    def test_patience_and_trust_clamped(self, service):
        for _ in range(20):
            service.update_customer_state("This is so terrible and frustrating!")
        assert service.customer_state.patience >= 0
        assert service.customer_state.trust >= 0


class TestConversationProfiles:
    def test_get_profile_returns_proper_profile(self, service):
        service.update_customer_state("great, thank you!")
        profile = service.get_conversation_profile()
        assert isinstance(profile, ConversationProfile)
        assert profile.pace_label == "warm"

    def test_get_profile_for_angry(self, service):
        service.update_customer_state("terrible service!")
        profile = service.get_conversation_profile()
        assert profile.pace_label == "slow_soft"

    def test_get_adaptive_pause_returns_float(self, service):
        pause = service.get_adaptive_pause()
        assert isinstance(pause, float)
        assert 0.05 <= pause <= 0.40

    def test_get_next_speech_intent_returns_string(self, service):
        intent = service.get_next_speech_intent()
        assert isinstance(intent, str)
        assert intent in ["question", "action", "reassurance", "filler", "empathy", "apology", "validation", "closing"]


class TestRepetitionPrevention:
    def test_should_play_returns_true_for_new(self, service):
        assert service.should_play("clip_1") is True

    def test_should_play_returns_false_for_played(self, service):
        service.mark_played("clip_1")
        assert service.should_play("clip_1") is False

    def test_should_play_returns_true_after_rotation(self, service):
        for i in range(12):
            service.mark_played(f"clip_{i}")
        # After 8+ marks, clip_0 should have rotated out
        assert service.should_play("clip_0") is True

    def test_get_preferred_content_skips_played(self, service):
        service.mark_played("a")
        result = service.get_preferred_content([("a", "text_a"), ("b", "text_b")])
        assert result == "text_b"

    def test_get_preferred_content_fallback_when_all_played(self, service):
        service.mark_played("a")
        service.mark_played("b")
        result = service.get_preferred_content([("a", "text_a")])
        assert result == "text_a"


class TestInterruptionHandling:
    def test_signal_interruption_sets_flag(self, service):
        service.signal_interruption()
        assert service.is_interrupted is True

    def test_clear_interruption_clears_flag(self, service):
        service.signal_interruption()
        service.clear_interruption()
        assert service.is_interrupted is False

    def test_signal_interruption_increments_count(self, service):
        service.signal_interruption()
        assert service.customer_state.interruption_count == 1
        service.signal_interruption()
        assert service.customer_state.interruption_count == 2

    def test_get_recovery_flow_clears_interrupt(self, service):
        service.signal_interruption()
        flow = service.get_recovery_flow()
        assert flow == ["empathy", "reassurance"]
        assert service.is_interrupted is False


class TestSentimentAnalysis:
    def test_analyze_sentiment_profile(self, service):
        scores = service.analyze_sentiment_profile("This is terrible and I am very angry")
        assert "anger" in scores
        assert scores["anger"] > 0

    def test_analyze_sentiment_positive(self, service):
        scores = service.analyze_sentiment_profile("Great! Thank you for the excellent support")
        assert "positive" in scores
        assert scores["positive"] > 0

    def test_analyze_empty_text(self, service):
        scores = service.analyze_sentiment_profile("")
        assert all(v == 0 for v in scores.values())


class TestContextSummary:
    def test_get_context_summary_contains_emotion(self, service):
        summary = service.get_context_summary()
        assert "neutral" in summary
        assert "Turns: 0" in summary

    def test_get_context_summary_after_update(self, service):
        service.update_customer_state("terrible service")
        summary = service.get_context_summary()
        assert "angry_customer" in summary
        assert "Turns: 1" in summary

    def test_get_context_summary_with_topics(self, service):
        service.update_customer_state("I need help with my refund and billing")
        summary = service.get_context_summary()
        assert "refund" in summary or "billing" in summary or "Topics:" in summary


class TestConversationHistory:
    def test_add_to_history(self, service):
        service.add_to_history("user", "hello")
        service.add_to_history("agent", "hi there")
        assert hasattr(service, "_conversation_history")

    def test_reset_clears_history(self, service):
        service.add_to_history("user", "hello")
        service.reset()
        # Should not error, history cleared
        summary = service.get_context_summary()
        assert "Turns: 0" in summary


class TestTopicExtraction:
    def test_extract_topics_finds_keywords(self, service):
        result = service._extract_topics("I want a refund for my order")
        assert "refund" in result
        assert "order" in result

    def test_extract_topics_empty(self, service):
        result = service._extract_topics("hello world")
        assert result == []

    def test_update_preserves_unique_topics(self, service):
        service.update_customer_state("I need a refund for order")
        assert "refund" in service.customer_state.topics
        assert "order" in service.customer_state.topics
        # Adding same topic again should not duplicate
        service.update_customer_state("refund please")
        assert service.customer_state.topics.count("refund") == 1


class TestSingleton:
    def test_get_adaptive_conversation_service(self):
        from app.services.adaptive_conversation import get_adaptive_conversation_service
        s1 = get_adaptive_conversation_service()
        s2 = get_adaptive_conversation_service()
        assert s1 is s2
