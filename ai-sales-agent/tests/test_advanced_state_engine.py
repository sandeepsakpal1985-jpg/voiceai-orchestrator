"""Tests for the advanced Conversation State Engine."""

import pytest
from app.advanced.state_engine import ConversationStateEngine, get_state_engine, StateTransition
from app.services.adaptive_conversation import CustomerEmotion


@pytest.fixture
def engine():
    e = ConversationStateEngine()
    e.reset()
    return e


class TestInitialState:
    def test_initial_state_is_listening(self, engine):
        assert engine.current_state == "LISTENING"

    def test_initial_transition_count_zero(self, engine):
        assert engine.transition_count == 0

    def test_initial_previous_state_none(self, engine):
        assert engine.previous_state is None

    def test_time_in_current_state_is_positive(self, engine):
        assert engine.time_in_current_state >= 0


class TestStateTransitions:
    def test_transition_to_new_state(self, engine):
        engine.transition_to("QUESTION", trigger="test")
        assert engine.current_state == "QUESTION"
        assert engine.previous_state == "LISTENING"
        assert engine.transition_count == 1

    def test_transition_to_same_state_does_nothing(self, engine):
        result = engine.transition_to("LISTENING", trigger="test")
        assert result == "LISTENING"
        assert engine.transition_count == 0

    def test_multiple_transitions(self, engine):
        engine.transition_to("QUESTION")
        assert engine.current_state == "QUESTION"
        engine.transition_to("EMPATHY")
        assert engine.current_state == "EMPATHY"
        assert engine.previous_state == "QUESTION"
        assert engine.transition_count == 2

    def test_transition_with_metadata(self, engine):
        engine.transition_to("EMPATHY", trigger="keyword", metadata={"word": "bad"})
        t = engine.get_state_history(1)[0]
        assert t.trigger == "keyword"
        assert t.metadata["word"] == "bad"

    def test_transition_records_timestamp(self, engine):
        import time
        before = time.time()
        engine.transition_to("ACTION")
        after = time.time()
        t = engine.transitions[-1]
        assert before <= t.timestamp <= after


class TestKeywordRouting:
    def test_refund_routes_to_reassurance(self, engine):
        result = engine.determine_next_state("I need a refund")
        assert result == "REASSURANCE"

    def test_bad_routes_to_empathy(self, engine):
        result = engine.determine_next_state("This is bad")
        assert result == "EMPATHY"

    def test_dirty_routes_to_empathy(self, engine):
        result = engine.determine_next_state("The room is dirty")
        assert result == "EMPATHY"

    def test_wrong_number_routes_to_closing(self, engine):
        result = engine.determine_next_state("wrong number")
        assert result == "CLOSING"

    def test_busy_routes_to_closing(self, engine):
        result = engine.determine_next_state("I'm busy right now")
        assert result == "CLOSING"

    def test_help_routes_to_action(self, engine):
        result = engine.determine_next_state("Can you help me?")
        assert result == "ACTION"

    def test_explain_routes_to_question(self, engine):
        result = engine.determine_next_state("Please explain this")
        assert result == "QUESTION"

    def test_sorry_routes_to_apology(self, engine):
        result = engine.determine_next_state("I'm so sorry")
        assert result == "APOLOGY"


class TestScenarioRouting:
    def test_scenario_has_priority_over_keywords(self, engine):
        result = engine.determine_next_state("bad", scenario="general-inquiry")
        assert result == "QUESTION"

    def test_staff_complaint_scenario(self, engine):
        result = engine.determine_next_state("", scenario="staff-complaint")
        assert result == "EMPATHY"

    def test_wrong_number_scenario(self, engine):
        result = engine.determine_next_state("", scenario="wrong-number")
        assert result == "CLOSING"


class TestEmotionBasedRouting:
    def test_angry_emotion_routes_to_empathy(self, engine):
        result = engine.determine_next_state("hello", detected_emotion=CustomerEmotion.ANGRY)
        assert result == "EMPATHY"

    def test_confused_emotion_routes_to_question(self, engine):
        result = engine.determine_next_state("hello", detected_emotion=CustomerEmotion.CONFUSED)
        assert result == "QUESTION"

    def test_busy_emotion_routes_to_action(self, engine):
        result = engine.determine_next_state("hello", detected_emotion=CustomerEmotion.BUSY)
        assert result == "ACTION"

    def test_positive_emotion_routes_to_reassurance(self, engine):
        result = engine.determine_next_state("hello", detected_emotion=CustomerEmotion.POSITIVE)
        assert result == "REASSURANCE"

    def test_neutral_defaults_to_question(self, engine):
        result = engine.determine_next_state("hello", detected_emotion=CustomerEmotion.NEUTRAL)
        assert result == "QUESTION"


class TestProcessInput:
    def test_process_input_returns_full_result(self, engine):
        result = engine.process_input("I need help")
        assert "next_state" in result
        assert "previous_state" in result
        assert "emotion" in result
        assert "transition_count" in result
        assert result["next_state"] == "ACTION"

    def test_process_input_with_emotion(self, engine):
        result = engine.process_input("hello", detected_emotion=CustomerEmotion.ANGRY)
        assert result["emotion"] == "angry_customer"
        assert result["next_state"] == "EMPATHY"

    def test_process_input_with_scenario(self, engine):
        result = engine.process_input("hello", scenario="wrong-number")
        assert result["next_state"] == "CLOSING"


class TestStateHistory:
    def test_get_state_history_returns_recent(self, engine):
        engine.transition_to("QUESTION")
        engine.transition_to("EMPATHY")
        history = engine.get_state_history(1)
        assert len(history) == 1
        assert history[0].to_state == "EMPATHY"

    def test_get_state_history_returns_all_when_under_limit(self, engine):
        engine.transition_to("QUESTION")
        engine.transition_to("ACTION")
        history = engine.get_state_history(5)
        assert len(history) == 2

    def test_transition_is_state_transition_instance(self, engine):
        engine.transition_to("QUESTION")
        t = engine.transitions[0]
        assert isinstance(t, StateTransition)
        assert t.from_state == "LISTENING"
        assert t.to_state == "QUESTION"


class TestReset:
    def test_reset_clears_state(self, engine):
        engine.transition_to("QUESTION")
        engine.reset()
        assert engine.current_state == "LISTENING"
        assert engine.previous_state is None
        assert engine.transition_count == 0

    def test_reset_clears_entry_times(self, engine):
        engine.transition_to("EMPATHY")
        engine.reset()
        assert engine.time_in_current_state >= 0


class TestStateSummary:
    def test_state_summary_includes_current_state(self, engine):
        summary = engine.state_summary()
        assert "LISTENING" in summary

    def test_state_summary_after_transition(self, engine):
        engine.transition_to("EMPATHY", trigger="keyword")
        summary = engine.state_summary()
        assert "EMPATHY" in summary
        assert "Transitions: 1" in summary


class TestSingleton:
    def test_get_state_engine(self):
        s1 = get_state_engine()
        s2 = get_state_engine()
        assert s1 is s2
