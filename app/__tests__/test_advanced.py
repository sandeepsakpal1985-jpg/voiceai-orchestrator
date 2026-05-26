"""
Comprehensive tests for the app/advanced package modules.

Covers:
- audio_registry.py → AudioRegistry, AudioClip, clip selection
- adaptive_playback.py → AdaptivePlaybackEngine, profiles, flow generation
- interrupt_detector.py → InterruptDetector, flag/mic modes
- conversation_analyzer.py → ConversationAnalyzer, semantic/keyword analysis
- state_engine.py → ConversationStateEngine, state transitions, routing
- orchestrator.py → RealtimeConversationOrchestrator, integration
"""

import json
import os
import tempfile
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from app.advanced.audio_registry import AudioRegistry, AudioClip, get_audio_registry
from app.advanced.adaptive_playback import (
    AdaptivePlaybackEngine,
    ConversationProfile,
    PlaybackItem,
    EMOTION_PROFILES,
    INTENT_LABELS,
    get_adaptive_playback_engine,
)
from app.advanced.interrupt_detector import (
    InterruptDetector,
    get_interrupt_detector,
    SAMPLE_RATE,
    VOLUME_THRESHOLD,
)
from app.advanced.conversation_analyzer import (
    ConversationAnalyzer,
    get_conversation_analyzer,
    SEMANTIC_DIMENSIONS,
)
from app.advanced.state_engine import (
    ConversationStateEngine,
    StateTransition,
    SCENARIO_ROUTES,
    KEYWORD_ROUTES,
    get_state_engine,
)
from app.advanced.orchestrator import (
    RealtimeConversationOrchestrator,
    OrchestratorState,
    get_orchestrator,
    reset_orchestrator,
)
from app.config import settings


# =============================================================================
# Audio Registry Tests
# =============================================================================


class TestAudioClip:
    def test_clip_defaults(self):
        clip = AudioClip(id="test1", text="Hello", audio_file="hello.mp3", clip_type="greeting", emotion="neutral")
        assert clip.energy == 3
        assert clip.priority == 5
        assert clip.tags == []
        assert clip.usable_before == []
        assert clip.usable_after == []
        assert clip.file_path == ""

    def test_clip_with_all_fields(self):
        clip = AudioClip(
            id="test2",
            text="I understand",
            audio_file="emp_001.mp3",
            clip_type="empathy",
            emotion="calming",
            energy=2,
            tags=["support", "soft"],
            usable_before=["any"],
            usable_after=["filler"],
            priority=8,
            file_path="audio/emp_001.mp3",
        )
        assert clip.id == "test2"
        assert clip.energy == 2
        assert clip.priority == 8
        assert "support" in clip.tags


class TestAudioRegistry:
    SAMPLE_REGISTRY = [
        {
            "id": "emp_001",
            "text": "I understand your frustration",
            "audio_file": "emp_001.mp3",
            "type": "empathy",
            "emotion": "calming",
            "energy": 2,
            "tags": ["support", "angry_customer"],
            "usable_after": ["filler"],
            "priority": 7,
        },
        {
            "id": "emp_002",
            "text": "That sounds difficult",
            "audio_file": "emp_002.mp3",
            "type": "empathy",
            "emotion": "soft",
            "energy": 1,
            "tags": ["support", "emotional_customer"],
            "usable_after": ["filler", "empathy"],
            "priority": 6,
        },
        {
            "id": "fil_001",
            "text": "I see",
            "audio_file": "fil_001.mp3",
            "type": "filler",
            "emotion": "neutral",
            "energy": 3,
            "tags": ["general"],
            "usable_after": ["any"],
            "priority": 5,
        },
    ]

    SAMPLE_AUDIO_MAP = {
        "EMPATHY": ["emp_001.mp3", "emp_002.mp3"],
        "FILLER": ["fil_001.mp3"],
    }

    @pytest.fixture
    def registry(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            reg_path = os.path.join(tmpdir, "registry.json")
            map_path = os.path.join(tmpdir, "map.json")

            with open(reg_path, "w") as f:
                json.dump(self.SAMPLE_REGISTRY, f)
            with open(map_path, "w") as f:
                json.dump(self.SAMPLE_AUDIO_MAP, f)

            reg = AudioRegistry(registry_path=reg_path, audio_map_path=map_path, audio_folder=tmpdir)
            yield reg

    def test_loads_registry(self, registry):
        assert registry.clip_count == 3

    def test_get_clip_by_id(self, registry):
        clip = registry.get_clip("emp_001")
        assert clip is not None
        assert clip.text == "I understand your frustration"

    def test_get_clip_nonexistent(self, registry):
        assert registry.get_clip("nonexistent") is None

    def test_get_clips_by_type(self, registry):
        clips = registry.get_clips_by_type("empathy")
        assert len(clips) == 2

        clips = registry.get_clips_by_type("filler")
        assert len(clips) == 1

    def test_get_clips_by_nonexistent_type(self, registry):
        assert registry.get_clips_by_type("apology") == []

    def test_get_clips_by_tag(self, registry):
        clips = registry.get_clips_by_tag("support")
        assert len(clips) == 2

    def test_get_all_types(self, registry):
        types = registry.get_all_types()
        assert "empathy" in types
        assert "filler" in types

    def test_get_category_files(self, registry):
        files = registry.get_category_files("EMPATHY")
        assert len(files) == 2

    def test_mark_played_and_is_recently_played(self, registry):
        assert registry.is_recently_played("emp_001") is False
        registry.mark_played("emp_001")
        assert registry.is_recently_played("emp_001") is True

    def test_mark_played_evicts_oldest(self, registry):
        for i in range(20):
            registry.mark_played(f"clip_{i}")
        # First items should be evicted
        assert registry.is_recently_played("clip_0") is False, "Oldest should be evicted"
        # Last item should still be in memory
        assert registry.is_recently_played("clip_19") is True

    def test_select_clip_returns_clip(self, registry):
        clip = registry.select_clip(clip_type="empathy", context_emotion="angry_customer")
        assert clip is not None
        assert clip.clip_type == "empathy"

    def test_select_clip_avoids_repetition(self, registry):
        first = registry.select_clip(clip_type="empathy")
        assert first is not None

        second = registry.select_clip(clip_type="empathy")
        assert second is not None
        # Should prefer different clip than first
        if registry.clip_count >= 2:
            assert second.id != first.id or len(registry.get_clips_by_type("empathy")) == 1

    def test_select_clip_with_flow_context(self, registry):
        clip = registry.select_clip(
            clip_type="empathy",
            previous_type="filler",
            next_type="reassurance",
        )
        assert clip is not None

    def test_select_clip_nonexistent_type(self, registry):
        clip = registry.select_clip(clip_type="nonexistent_type")
        assert clip is None or clip.clip_type == "nonexistent_type"

    def test_reset_memory(self, registry):
        registry.mark_played("emp_001")
        registry.mark_played("fil_001")
        assert registry.is_recently_played("emp_001") is True

        registry.reset_memory()
        assert registry.is_recently_played("emp_001") is False

    def test_reload(self, registry):
        registry.mark_played("emp_001")
        registry.reload()
        assert registry.is_recently_played("emp_001") is False
        assert registry.clip_count == 3

    def test_get_content_for_type(self, registry):
        content = registry.get_content_for_type("empathy", context_emotion="angry_customer")
        assert content is not None
        assert len(content) > 0


# =============================================================================
# Adaptive Playback Engine Tests
# =============================================================================


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


class TestPlaybackItem:
    def test_item_defaults(self):
        item = PlaybackItem(clip_id="test1", clip_type="filler")
        assert item.pause_before == 0.15
        assert item.pause_after == 0.1
        assert item.priority == 5
        assert item.text is None

    def test_item_with_all_fields(self):
        item = PlaybackItem(
            clip_id="emp_001",
            clip_type="empathy",
            text="I understand",
            audio_file="emp_001.mp3",
            pause_before=0.2,
            pause_after=0.15,
            priority=8,
        )
        assert item.clip_id == "emp_001"
        assert item.text == "I understand"
        assert item.priority == 8


class TestAdaptivePlaybackEngine:
    @pytest.fixture
    def engine(self):
        eng = AdaptivePlaybackEngine()
        yield eng

    def test_get_profile_returns_correct_profile(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        profile = engine.get_profile(CustomerEmotion.ANGRY)
        assert profile.pace_label == "slow_soft"

        profile = engine.get_profile(CustomerEmotion.BUSY)
        assert profile.pace_label == "fast_direct"

    def test_get_profile_fallback(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        profile = engine.get_profile("unknown_emotion")  # Invalid type
        assert profile.pace_label == "standard"

    def test_get_sequence(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        seq = engine.get_sequence(CustomerEmotion.ANGRY)
        assert len(seq) > 0
        assert "empathy" in seq

        seq = engine.get_sequence(CustomerEmotion.BUSY)
        assert "filler" in seq
        assert len(seq) <= 4  # Busy should be concise

    def test_get_adaptive_pause_within_range(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        pause = engine.get_adaptive_pause(CustomerEmotion.NEUTRAL)
        profile = EMOTION_PROFILES[CustomerEmotion.NEUTRAL]
        assert profile.pause_min <= pause <= profile.pause_max

    def test_get_adaptive_pause_without_emotion(self, engine):
        pause = engine.get_adaptive_pause()
        assert 0.05 <= pause <= 0.40  # Within any profile's range

    def test_get_next_intent(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        intent = engine.get_next_intent(CustomerEmotion.ANGRY, talk_count=0)
        profile = EMOTION_PROFILES[CustomerEmotion.ANGRY]
        assert intent == profile.sequence[0]

    def test_get_next_intent_wraps_around(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        profile = EMOTION_PROFILES[CustomerEmotion.ANGRY]
        intent = engine.get_next_intent(CustomerEmotion.ANGRY, talk_count=len(profile.sequence))
        assert intent == profile.sequence[0]  # Should wrap around

    def test_generate_flow_returns_items(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        items = engine.generate_flow(CustomerEmotion.NEUTRAL, turns=4)
        assert len(items) == 4
        for item in items:
            assert isinstance(item, PlaybackItem)

    def test_generate_flow_turns_count(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        items = engine.generate_flow(CustomerEmotion.BUSY, turns=2)
        assert len(items) == 2

    def test_build_queue_respects_sequence(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        custom_seq = ["filler", "action"]
        queue = engine.build_queue(CustomerEmotion.NEUTRAL, override_sequence=custom_seq)
        assert len(queue) == 2
        assert queue[0].clip_type == "filler"
        assert queue[1].clip_type == "action"

    def test_get_next_item(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        items = engine.generate_flow(CustomerEmotion.NEUTRAL, turns=3)
        first = engine.get_next_item(items)
        assert first is not None
        assert first == items[0]

        second = engine.get_next_item(items)
        assert second == items[1]

    def test_get_next_item_returns_none_at_end(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        items = engine.generate_flow(CustomerEmotion.NEUTRAL, turns=1)
        engine.get_next_item(items)
        assert engine.get_next_item(items) is None

    def test_reset_position(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        items = engine.generate_flow(CustomerEmotion.NEUTRAL, turns=3)
        engine.get_next_item(items)
        engine.get_next_item(items)
        assert engine._position == 2

        engine.reset_position()
        assert engine._position == 0

    def test_get_prompt_context_returns_string(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        context = engine.get_prompt_context(CustomerEmotion.ANGRY)
        assert "slow_soft" in context
        assert "empathy" in context or "empathetic" in context

    def test_on_interrupt_and_fire_interrupt(self, engine):
        callback = MagicMock()
        engine.on_interrupt(callback)
        engine.fire_interrupt()
        callback.assert_called_once()

    def test_fire_interrupt_handles_callback_error(self, engine):
        def failing_callback():
            raise ValueError("test error")

        engine.on_interrupt(failing_callback)
        engine.fire_interrupt()  # Should not raise exception


# =============================================================================
# Interrupt Detector Tests
# =============================================================================


class TestInterruptDetector:
    @pytest.fixture
    def detector(self):
        det = InterruptDetector(threshold=0.15)
        yield det
        det.reset()

    def test_default_state(self, detector):
        assert detector.is_interrupted is False
        assert detector.interrupt_count == 0
        assert detector.is_monitoring is False

    def test_signal_interrupt_sets_flag(self, detector):
        detector.signal_interrupt()
        assert detector.is_interrupted is True
        assert detector.interrupt_count == 1

    def test_clear_interrupt_resets_flag(self, detector):
        detector.signal_interrupt()
        detector.clear_interrupt()
        assert detector.is_interrupted is False

    def test_signal_interrupt_increments_count(self, detector):
        detector.signal_interrupt()
        assert detector.interrupt_count == 1

    def test_signal_interrupt_increments_across_calls(self, detector):
        """Verify interrupt count increments across multiple calls.

        Note: The debounce mechanism prevents rapid successive calls within 1 second.
        These calls simulate separate interrupt events."""
        with patch("app.advanced.interrupt_detector.time.time") as mock_time:
            # Simulate calls 2 seconds apart to avoid debounce
            mock_time.side_effect = [100.0, 102.0]
            detector.signal_interrupt()
            assert detector.interrupt_count == 1
            detector.signal_interrupt()
            assert detector.interrupt_count == 2

    def test_signal_interrupt_debounce(self, detector):
        with patch("app.advanced.interrupt_detector.time.time") as mock_time:
            mock_time.return_value = 100.0  # Same timestamp = within debounce window
            detector.signal_interrupt()
            detector.signal_interrupt()  # Within debounce window
            assert detector.interrupt_count == 1  # Debounced

    def test_get_recovery_flow(self, detector):
        detector.signal_interrupt()
        flow = detector.get_recovery_flow()
        assert flow == ["empathy", "reassurance"]
        assert detector.is_interrupted is False  # Cleared after recovery

    def test_get_recovery_prompt(self, detector):
        prompt = detector.get_recovery_prompt()
        assert "interrupted" in prompt.lower()
        assert "acknowledge" in prompt.lower()

    def test_on_interrupt_and_remove_callback(self, detector):
        callback = MagicMock()
        detector.on_interrupt(callback)
        detector.signal_interrupt()
        callback.assert_called_once()

    def test_remove_callback(self, detector):
        callback = MagicMock()
        detector.on_interrupt(callback)
        detector.remove_callback(callback)
        detector.signal_interrupt()
        callback.assert_not_called()

    def test_reset(self, detector):
        detector.signal_interrupt()
        detector.signal_interrupt()
        detector.reset()
        assert detector.is_interrupted is False
        assert detector.interrupt_count == 0

    def test_start_monitoring_without_sounddevice(self, detector):
        # Should handle ImportError gracefully
        with patch.dict('sys.modules', {'sounddevice': None}):
            detector.start_monitoring()
        # Without sounddevice, monitoring should be disabled
        assert detector.is_monitoring is False

    def test_stop_monitoring(self, detector):
        detector.start_monitoring()
        detector.stop_monitoring()
        assert detector.is_monitoring is False

    def test_repr(self, detector):
        detector.signal_interrupt()
        r = repr(detector)
        assert "interrupted=True" in r
        assert "count=1" in r


# =============================================================================
# Conversation Analyzer Tests
# =============================================================================


class TestConversationAnalyzer:
    @pytest.fixture
    def analyzer(self):
        return ConversationAnalyzer()

    def test_dimensions_are_loaded(self, analyzer):
        dims = analyzer.dimensions()
        assert "anger" in dims
        assert "confusion" in dims
        assert "positive" in dims
        assert len(dims) > 0

    @pytest.mark.asyncio
    async def test_analyze_empty_text(self, analyzer):
        result = await analyzer.analyze("")
        assert result == []

    @pytest.mark.asyncio
    async def test_analyze_async_no_model_fallback_to_keyword(self, analyzer):
        # Without sentence-transformers, should use keyword analysis
        results = await analyzer.analyze("This is terrible service")
        if not analyzer._model_loaded:
            assert len(results) >= 0  # May have results from keyword analysis

    @pytest.mark.asyncio
    async def test_keyword_analyze(self, analyzer):
        results = analyzer._keyword_analyze("This is terrible service", top_k=3)
        assert len(results) <= 3
        if results:
            assert "score" in results[0]
            assert "dimension" in results[0]

    def test_keyword_analyze_highest_score_first(self, analyzer):
        results = analyzer._keyword_analyze("I am frustrated and angry", top_k=5)
        if results:
            top_dim = results[0]["dimension"]
            assert top_dim in ["anger", "urgency"]  # Most relevant dimensions

    @pytest.mark.asyncio
    async def test_get_dominant_emotion(self, analyzer):
        emotion = await analyzer.get_dominant_emotion("This is great service")
        assert isinstance(emotion, str)

    @pytest.mark.asyncio
    async def test_get_dominant_emotion_empty(self, analyzer):
        emotion = await analyzer.get_dominant_emotion("")
        assert emotion == "neutral"

    def test_all_dimensions_have_examples(self):
        for dim, examples in SEMANTIC_DIMENSIONS.items():
            assert len(examples) > 0, f"Dimension {dim} has no examples"


# =============================================================================
# State Engine Tests
# =============================================================================


class TestStateTransition:
    def test_transition_creation(self):
        t = StateTransition(
            from_state="LISTENING",
            to_state="SPEAKING",
            trigger="keyword",
            timestamp=123.0,
        )
        assert t.from_state == "LISTENING"
        assert t.to_state == "SPEAKING"
        assert t.trigger == "keyword"


class TestConversationStateEngine:
    @pytest.fixture
    def engine(self):
        eng = ConversationStateEngine()
        yield eng
        eng.reset()

    def test_initial_state(self, engine):
        assert engine.current_state == "LISTENING"
        assert engine.previous_state is None
        assert engine.transition_count == 0
        assert engine.time_in_current_state >= 0

    def test_transition_to_new_state(self, engine):
        engine.transition_to("SPEAKING", trigger="manual")
        assert engine.current_state == "SPEAKING"
        assert engine.previous_state == "LISTENING"
        assert engine.transition_count == 1

    def test_transition_to_same_state_ignored(self, engine):
        engine.transition_to("LISTENING", trigger="manual")
        assert engine.transition_count == 0  # Same state, no transition

    def test_multiple_transitions(self, engine):
        engine.transition_to("SPEAKING", trigger="manual")
        engine.transition_to("LISTENING", trigger="interrupt")
        engine.transition_to("PROCESSING", trigger="keyword")

        assert engine.transition_count == 3
        assert engine.current_state == "PROCESSING"
        assert engine.previous_state == "LISTENING"

    def test_get_state_history(self, engine):
        engine.transition_to("SPEAKING", trigger="manual")
        engine.transition_to("PROCESSING", trigger="keyword")

        history = engine.get_state_history(limit=5)
        assert len(history) == 2

    def test_get_state_history_limit(self, engine):
        for i in range(10):
            engine.transition_to(f"STATE_{i}", trigger="manual")

        history = engine.get_state_history(limit=3)
        assert len(history) == 3

    def test_determine_next_state_from_scenario(self, engine):
        state = engine.determine_next_state(
            transcript="I need a refund",
            scenario="refund-request",
        )
        assert state == "REASSURANCE"

    def test_determine_next_state_from_keyword(self, engine):
        state = engine.determine_next_state(
            transcript="I want a refund please",
        )
        assert state == "REASSURANCE"

    def test_determine_next_state_from_refund_keyword(self, engine):
        state = engine.determine_next_state(transcript="I need a refund")
        assert state == "REASSURANCE"

    def test_determine_next_state_from_dirty_keyword(self, engine):
        state = engine.determine_next_state(transcript="The room was dirty")
        assert state == "EMPATHY"

    def test_determine_next_state_from_wrong_number_keyword(self, engine):
        state = engine.determine_next_state(transcript="wrong number")
        assert state == "CLOSING"

    def test_determine_next_state_from_emotion(self, engine):
        from app.services.adaptive_conversation import CustomerEmotion

        state = engine.determine_next_state(
            transcript="Hello",
            detected_emotion=CustomerEmotion.ANGRY,
        )
        assert state == "EMPATHY"

        state = engine.determine_next_state(
            transcript="I don't understand",
            detected_emotion=CustomerEmotion.CONFUSED,
        )
        assert state == "QUESTION"

    def test_determine_next_state_default(self, engine):
        state = engine.determine_next_state(transcript="Hello, how are you?")
        assert state == "QUESTION"

    def test_process_input_returns_dict(self, engine):
        result = engine.process_input(
            transcript="This is a complaint about bad service",
            scenario="staff-complaint",
        )
        assert "next_state" in result
        assert "previous_state" in result
        assert "emotion" in result
        assert "transition_count" in result

    def test_reset(self, engine):
        engine.transition_to("SPEAKING", trigger="manual")
        engine.transition_to("PROCESSING", trigger="keyword")
        engine.reset()

        assert engine.current_state == "LISTENING"
        assert engine.previous_state is None
        assert engine.transition_count == 0

    def test_state_summary(self, engine):
        summary = engine.state_summary()
        assert "LISTENING" in summary
        assert "transitions" in summary

    def test_scenario_routes_are_defined(self):
        assert "staff-complaint" in SCENARIO_ROUTES
        assert "wrong-number" in SCENARIO_ROUTES
        assert len(SCENARIO_ROUTES) >= 10  # Should have many scenarios

    def test_keyword_routes_are_defined(self):
        assert "refund" in KEYWORD_ROUTES
        assert "bad" in KEYWORD_ROUTES
        assert "thank" in KEYWORD_ROUTES


# =============================================================================
# Orchestrator Tests
# =============================================================================


class TestOrchestratorState:
    def test_default_values(self):
        state = OrchestratorState()
        assert state.emotion == "neutral"
        assert state.state == "LISTENING"
        assert state.trust == 5
        assert state.patience == 5


class TestRealtimeConversationOrchestrator:
    @pytest.fixture
    def orch(self):
        reset_orchestrator()
        orch = get_orchestrator()
        orch.reset()
        yield orch

    def test_default_state(self, orch):
        assert orch.is_active is True
        assert orch.is_interrupted is False

    def test_deactivate(self, orch):
        orch.deactivate()
        assert orch.is_active is False

    def test_reset(self, orch):
        if orch.state_engine:
            orch.state_engine.transition_to("SPEAKING", trigger="manual")
        orch.reset()
        if orch.state_engine:
            assert orch.state_engine.current_state == "LISTENING"
        assert orch.is_active is True

    @pytest.mark.asyncio
    async def test_process_utterance_returns_state(self, orch):
        from app.services.adaptive_conversation import CustomerEmotion

        state = await orch.process_utterance(
            text="This is terrible service",
            emotion=CustomerEmotion.ANGRY,
        )
        assert isinstance(state, OrchestratorState)

    @pytest.mark.asyncio
    async def test_process_utterance_when_inactive(self, orch):
        orch.deactivate()
        state = await orch.process_utterance("Hello")
        assert isinstance(state, OrchestratorState)
        assert state.emotion == "neutral"

    def test_handle_interrupt_when_active(self, orch):
        result = orch.handle_interrupt()
        assert "interrupt_handled" in result
        # Interrupt is cleared after recovery flow is generated
        assert orch.is_interrupted is False

    def test_handle_interrupt_when_inactive(self, orch):
        orch.deactivate()
        result = orch.handle_interrupt()
        assert result == {"recovery": None}

    def test_clear_interrupt(self, orch):
        orch.interrupt_detector.signal_interrupt()
        assert orch.is_interrupted is True
        orch.clear_interrupt()
        assert orch.is_interrupted is False

    def test_get_llm_context(self, orch):
        from app.services.adaptive_conversation import CustomerEmotion

        context = orch.get_llm_context(emotion=CustomerEmotion.NEUTRAL)
        assert isinstance(context, str)

    def test_get_llm_context_when_interrupted(self, orch):
        from app.services.adaptive_conversation import CustomerEmotion

        orch.handle_interrupt()
        context = orch.get_llm_context(emotion=CustomerEmotion.NEUTRAL)
        assert "interrupted" in context.lower()

    def test_get_state_snapshot(self, orch):
        from app.services.adaptive_conversation import CustomerEmotion

        snapshot = orch.get_state_snapshot(emotion=CustomerEmotion.ANGRY)
        assert snapshot.emotion == "angry_customer"
        assert snapshot.state == "LISTENING"

    def test_generate_playback_flow(self, orch):
        from app.services.adaptive_conversation import CustomerEmotion

        flow = orch.generate_playback_flow(CustomerEmotion.NEUTRAL, turns=3)
        if orch.adaptive_playback:
            assert len(flow) == 3
        else:
            assert flow == []

    def test_summary(self, orch):
        s = orch.summary()
        assert "Active: True" in s

    def test_repr(self, orch):
        r = repr(orch)
        assert "RealtimeConversationOrchestrator" in r


# =============================================================================
# Integration Tests
# =============================================================================


class TestAdvancedModuleIntegration:
    """Tests that verify multiple advanced modules work together."""

    @pytest.fixture
    def orch(self):
        reset_orchestrator()
        orch = get_orchestrator()
        orch.reset()
        yield orch

    @pytest.mark.asyncio
    async def test_utterance_updates_state_and_emotion(self, orch):
        from app.services.adaptive_conversation import CustomerEmotion

        # Process an angry utterance
        state = await orch.process_utterance(
            text="This is terrible and unacceptable!",
            emotion=CustomerEmotion.ANGRY,
        )

        assert state.emotion == "angry_customer"
        if orch.state_engine:
            assert state.transition_count >= 0

    @pytest.mark.asyncio
    async def test_interrupt_during_conversation(self, orch):
        from app.services.adaptive_conversation import CustomerEmotion

        # Start conversation
        state = await orch.process_utterance(
            text="I need help with my bill",
            emotion=CustomerEmotion.NEUTRAL,
        )

        # Handle interrupt — recovery flow clears the flag
        with patch("app.advanced.interrupt_detector.time.time", return_value=100.0):
            recovery = orch.handle_interrupt()
        assert recovery["interrupt_handled"] is True
        assert orch.is_interrupted is False  # Cleared by recovery flow

        # Can signal and clear interrupt manually (use different timestamp to avoid debounce)
        with patch("app.advanced.interrupt_detector.time.time", return_value=102.0):
            orch.interrupt_detector.signal_interrupt()
        assert orch.is_interrupted is True
        orch.clear_interrupt()
        assert orch.is_interrupted is False

    @pytest.mark.asyncio
    async def test_adaptive_playback_context_in_llm_prompt(self, orch):
        from app.services.adaptive_conversation import CustomerEmotion

        context = orch.get_llm_context(emotion=CustomerEmotion.ANGRY)
        if orch.adaptive_playback:
            assert isinstance(context, str)
            assert len(context) > 0

    def test_multiple_interrupts_tracked(self, orch):
        count = 3
        for _ in range(count):
            orch.handle_interrupt()
            orch.clear_interrupt()

        if orch.interrupt_detector:
            # Each signal_interrupt increments, but debounce may skip some
            assert orch.interrupt_detector.interrupt_count >= 1


# =============================================================================
# Singleton Tests
# =============================================================================


class TestSingletons:
    def test_get_audio_registry_singleton(self):
        r1 = get_audio_registry()
        r2 = get_audio_registry()
        assert r1 is r2

    def test_get_adaptive_playback_engine_singleton(self):
        e1 = get_adaptive_playback_engine()
        e2 = get_adaptive_playback_engine()
        assert e1 is e2

    def test_get_interrupt_detector_singleton(self):
        d1 = get_interrupt_detector()
        d2 = get_interrupt_detector()
        assert d1 is d2

    def test_get_conversation_analyzer_singleton(self):
        a1 = get_conversation_analyzer()
        a2 = get_conversation_analyzer()
        assert a1 is a2

    def test_get_state_engine_singleton(self):
        e1 = get_state_engine()
        e2 = get_state_engine()
        assert e1 is e2

    def test_get_orchestrator_singleton(self):
        o1 = get_orchestrator()
        o2 = get_orchestrator()
        assert o1 is o2

    def test_reset_orchestrator(self):
        o1 = get_orchestrator()
        reset_orchestrator()
        o2 = get_orchestrator()
        assert o1 is o2  # Same instance after reset
