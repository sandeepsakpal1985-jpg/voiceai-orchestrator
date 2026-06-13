"""Tests for the Interrupt Detector."""

import time
import pytest
from app.advanced.interrupt_detector import InterruptDetector, get_interrupt_detector


@pytest.fixture
def detector():
    d = InterruptDetector()
    d.reset()
    return d


class TestInitialState:
    def test_not_interrupted_initially(self, detector):
        assert detector.is_interrupted is False

    def test_interrupt_count_zero(self, detector):
        assert detector.interrupt_count == 0

    def test_not_monitoring_initially(self, detector):
        assert detector.is_monitoring is False


class TestSoftwareInterrupt:
    def test_signal_interrupt_sets_flag(self, detector):
        detector.signal_interrupt()
        assert detector.is_interrupted is True

    def test_signal_interrupt_increments_count(self, detector):
        detector.signal_interrupt()
        assert detector.interrupt_count == 1

    def test_clear_interrupt_clears_flag(self, detector):
        detector.signal_interrupt()
        detector.clear_interrupt()
        assert detector.is_interrupted is False

    def test_clear_interrupt_does_not_reset_count(self, detector):
        detector.signal_interrupt()
        detector.clear_interrupt()
        assert detector.interrupt_count == 1

    def test_multiple_signals_increment_count(self, detector):
        detector.signal_interrupt()
        detector.clear_interrupt()
        # Bypass debounce to test rapid signals
        detector._last_interrupt_time = 0
        detector.signal_interrupt()
        detector.clear_interrupt()
        detector._last_interrupt_time = 0
        detector.signal_interrupt()
        assert detector.interrupt_count == 3

    def test_debounce_prevents_rapid_signals(self, detector):
        detector.signal_interrupt()
        detector.signal_interrupt()  # Within debounce window (1s)
        assert detector.interrupt_count == 1

    def test_debounce_allows_after_interval(self, detector):
        detector.signal_interrupt()
        detector._last_interrupt_time = 0  # Bypass debounce
        detector.signal_interrupt()
        assert detector.interrupt_count == 2


class TestCallbacks:
    def test_on_interrupt_fires_callback(self, detector):
        callback_called = []
        def my_callback():
            callback_called.append(True)
        detector.on_interrupt(my_callback)
        detector.signal_interrupt()
        assert len(callback_called) == 1

    def test_remove_callback(self, detector):
        callback_called = []
        def my_callback():
            callback_called.append(True)
        detector.on_interrupt(my_callback)
        detector.remove_callback(my_callback)
        detector.signal_interrupt()
        assert len(callback_called) == 0

    def test_multiple_callbacks(self, detector):
        calls = []
        def cb1(): calls.append(1)
        def cb2(): calls.append(2)
        detector.on_interrupt(cb1)
        detector.on_interrupt(cb2)
        detector.signal_interrupt()
        assert 1 in calls
        assert 2 in calls

    def test_callback_error_does_not_raise(self, detector):
        def bad_callback():
            raise ValueError("boom")
        detector.on_interrupt(bad_callback)
        # Should not raise
        detector.signal_interrupt()
        assert detector.is_interrupted is True


class TestRecovery:
    def test_get_recovery_flow_returns_expected(self, detector):
        flow = detector.get_recovery_flow()
        assert flow == ["empathy", "reassurance"]

    def test_get_recovery_flow_clears_interrupt(self, detector):
        detector.signal_interrupt()
        detector.get_recovery_flow()
        assert detector.is_interrupted is False

    def test_get_recovery_prompt_returns_string(self, detector):
        prompt = detector.get_recovery_prompt()
        assert isinstance(prompt, str)
        assert len(prompt) > 50

    def test_get_recovery_prompt_clears_interrupt(self, detector):
        detector.signal_interrupt()
        detector.get_recovery_prompt()
        assert detector.is_interrupted is False


class TestHardwareMonitoring:
    def test_start_monitoring_no_sounddevice(self, detector):
        # Should not raise even without sounddevice
        detector.start_monitoring()
        # If sounddevice not available, monitoring=False; if available, monitoring=True
        # Either way, no exception should be raised
        assert isinstance(detector.is_monitoring, bool)

    def test_stop_monitoring_when_not_started(self, detector):
        # Should not raise
        detector.stop_monitoring()
        assert detector.is_monitoring is False

    def test_start_monitoring_twice(self, detector):
        detector.start_monitoring()
        # Second start should be a no-op (no crash)
        detector.start_monitoring()
        # Should not raise any exception
        assert isinstance(detector.is_monitoring, bool)


class TestReset:
    def test_reset_clears_all(self, detector):
        detector.signal_interrupt()
        detector.reset()
        assert detector.is_interrupted is False
        assert detector.interrupt_count == 0

    def test_reset_clears_debounce(self, detector):
        detector.signal_interrupt()
        detector.reset()
        detector.signal_interrupt()
        assert detector.interrupt_count == 1

    def test_repr(self, detector):
        rep = repr(detector)
        assert "InterruptDetector" in rep


class TestSingleton:
    def test_get_interrupt_detector(self):
        d1 = get_interrupt_detector()
        d2 = get_interrupt_detector()
        assert d1 is d2
