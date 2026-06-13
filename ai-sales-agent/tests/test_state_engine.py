"""Tests for the conversation state engine."""

import pytest
from app.voice.state_engine import ConversationStateEngine


@pytest.fixture
def engine():
    eng = ConversationStateEngine()
    eng.reset()
    return eng


def test_initial_state(engine):
    assert engine.current_state == "LISTENING"
    assert engine.previous_state is None
    assert engine.transition_count == 0


def test_empty_input_does_not_change_state(engine):
    result = engine.process_input(transcript="")
    assert result["next_state"] == "LISTENING"


def test_first_message_transitions_to_question(engine):
    result = engine.process_input(transcript="Hello, I need help")
    assert result["next_state"] == "QUESTION"


def test_closing_keywords(engine):
    engine.process_input(transcript="Hello")
    result = engine.process_input(transcript="Thank you, goodbye")
    assert result["next_state"] == "CLOSING"


def test_empathy_keywords(engine):
    engine.process_input(transcript="Hello")
    result = engine.process_input(transcript="I'm very frustrated with this")
    assert result["next_state"] == "EMPATHY"


def test_action_keywords(engine):
    engine.process_input(transcript="Hello")
    result = engine.process_input(transcript="I need to book an appointment")
    assert result["next_state"] == "ACTION"


def test_reset(engine):
    engine.process_input(transcript="Hello")
    assert engine.transition_count > 0
    engine.reset()
    assert engine.current_state == "LISTENING"
    assert engine.transition_count == 0


def test_state_summary(engine):
    summary = engine.state_summary()
    assert "LISTENING" in summary
