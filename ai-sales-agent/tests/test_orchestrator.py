"""Tests for the Realtime Conversation Orchestrator."""

import pytest
from app.advanced.orchestrator import (
    RealtimeConversationOrchestrator,
    get_orchestrator,
    reset_orchestrator,
    OrchestratorState,
)
from app.services.adaptive_conversation import CustomerEmotion


@pytest.fixture
def orchestrator():
    o = get_orchestrator()
    o.reset()
    return o


class TestInitialState:
    def test_is_active_initially(self, orchestrator):
        assert orchestrator.is_active is True

    def test_modules_lazy_loaded(self, orchestrator):
        # For a fresh orchestrator before any property access
        fresh = RealtimeConversationOrchestrator()
        assert fresh._state_engine is None
        assert fresh._interrupt_detector is None
        assert fresh._adaptive_playback is None
        assert fresh._conversation_analyzer is None


class TestDeactivate:
    def test_deactivate_sets_active_false(self, orchestrator):
        orchestrator.deactivate()
        assert orchestrator.is_active is False

    def test_deactivated_orchestrator_returns_snapshot(self, orchestrator):
        orchestrator.deactivate()
        import asyncio
        result = asyncio.run(orchestrator.process_utterance("hello", CustomerEmotion.NEUTRAL))
        assert isinstance(result, OrchestratorState)

    def test_reset_reactivates(self, orchestrator):
        orchestrator.deactivate()
        orchestrator.reset()
        assert orchestrator.is_active is True


class TestStateSnapshot:
    def test_get_state_snapshot_returns_defaults(self, orchestrator):
        state = orchestrator.get_state_snapshot()
        assert state.emotion == "neutral"
        assert state.state == "LISTENING"
        assert state.trust == 5
        assert state.patience == 5

    def test_get_state_snapshot_with_emotion(self, orchestrator):
        state = orchestrator.get_state_snapshot(CustomerEmotion.ANGRY)
        assert state.emotion == "angry_customer"


class TestLLMContext:
    def test_get_llm_context_returns_string(self, orchestrator):
        context = orchestrator.get_llm_context()
        assert isinstance(context, str)

    def test_get_llm_context_with_emotion(self, orchestrator):
        context = orchestrator.get_llm_context(CustomerEmotion.NEUTRAL)
        assert isinstance(context, str)

    def test_get_llm_context_empty_when_no_modules_active(self, orchestrator):
        orchestrator.deactivate()
        context = orchestrator.get_llm_context()
        # With no state engine or playback, should be empty or minimal
        assert isinstance(context, str)


class TestInterruptFlow:
    def test_handle_interrupt_returns_dict(self, orchestrator):
        result = orchestrator.handle_interrupt()
        assert isinstance(result, dict)
        assert "interrupt_handled" in result

    def test_clear_interrupt_does_not_raise(self, orchestrator):
        orchestrator.handle_interrupt()
        orchestrator.clear_interrupt()  # Should not raise

    def test_is_interrupted_returns_bool(self, orchestrator):
        assert isinstance(orchestrator.is_interrupted, bool)

    def test_handle_interrupt_when_deactivated(self, orchestrator):
        orchestrator.deactivate()
        result = orchestrator.handle_interrupt()
        assert result["recovery"] is None


class TestPlaybackFlow:
    def test_generate_playback_flow_returns_list(self, orchestrator):
        flow = orchestrator.generate_playback_flow(CustomerEmotion.NEUTRAL, turns=3)
        assert isinstance(flow, list)
        if flow:
            from app.advanced.adaptive_playback import PlaybackItem
            assert isinstance(flow[0], PlaybackItem)

    def test_build_playback_queue_returns_list(self, orchestrator):
        queue = orchestrator.build_playback_queue(CustomerEmotion.NEUTRAL)
        assert isinstance(queue, list)
        if queue:
            from app.advanced.adaptive_playback import PlaybackItem
            assert isinstance(queue[0], PlaybackItem)


class TestSummary:
    def test_summary_returns_string(self, orchestrator):
        summary = orchestrator.summary()
        assert isinstance(summary, str)
        assert "Active: True" in summary

    def test_summary_after_deactivate(self, orchestrator):
        orchestrator.deactivate()
        summary = orchestrator.summary()
        assert "Active: False" in summary

    def test_repr(self, orchestrator):
        rep = repr(orchestrator)
        assert "RealtimeConversationOrchestrator" in rep
        # Modules may be loaded (settings enabled) or lazy
        assert "yes" in rep or "lazy" in rep


class TestOrchestratorState:
    def test_default_values(self):
        state = OrchestratorState()
        assert state.emotion == "neutral"
        assert state.state == "LISTENING"
        assert state.trust == 5
        assert state.patience == 5
        assert state.transition_count == 0
        assert state.interrupt_count == 0
        assert state.talk_count == 0
        assert state.last_intent_type is None
        assert state.next_intent_type is None

    def test_custom_values(self):
        state = OrchestratorState(
            emotion="angry",
            state="EMPATHY",
            trust=3,
            patience=2,
            transition_count=5,
            talk_count=8,
            next_intent_type="reassurance",
        )
        assert state.emotion == "angry"
        assert state.trust == 3
        assert state.next_intent_type == "reassurance"


class TestSingleton:
    def test_get_orchestrator(self):
        o1 = get_orchestrator()
        o2 = get_orchestrator()
        assert o1 is o2

    def test_reset_orchestrator(self):
        get_orchestrator().deactivate()
        reset_orchestrator()
        assert get_orchestrator().is_active is True
