"""
Interrupt Detector — Real-time barge-in detection during TTS playback.

Integrates concepts from:
- live_interrupt_detector.py: Real-time mic monitoring with volume threshold
- interruptible_runtime.py: Interruption handling and recovery flow
- realtime_conversation.py: Audio callback interruption detection

This module provides both:
1. A software-level interrupt flag (for integration testing)
2. A real-time microphone monitoring system (when hardware is available)
"""

import asyncio
import logging
import threading
import time
from typing import Callable

logger = logging.getLogger("voiceai.advanced.interrupt_detector")

# Default audio parameters (from live_interrupt_detector.py)
SAMPLE_RATE = 16000
VOLUME_THRESHOLD = 0.15


class InterruptDetector:
    """Detects human speech interruptions during AI playback.

    Supports two modes:
    1. Software mode: interrupt flag is set programmatically (for testing/pipeline)
    2. Hardware mode: real-time microphone monitoring (when sounddevice available)

    Integrates the concepts from live_interrupt_detector.py and interruptible_runtime.py.
    """

    def __init__(self, threshold: float = VOLUME_THRESHOLD):
        self._threshold = threshold
        self._interrupt_flag = False
        self._interrupt_count = 0
        self._monitoring = False
        self._monitor_thread: threading.Thread | None = None
        self._callbacks: list[Callable] = []
        self._last_interrupt_time: float = 0.0
        self._min_interrupt_interval: float = 1.0  # seconds between interrupts

    # ── Flag-based Interruption (Software Mode) ────────────────────

    @property
    def is_interrupted(self) -> bool:
        """Check if an interruption has been detected."""
        return self._interrupt_flag

    def signal_interrupt(self) -> None:
        """Programmatically signal an interruption (for testing/pipeline use)."""
        now = time.time()
        if now - self._last_interrupt_time < self._min_interrupt_interval:
            return  # Debounce

        self._interrupt_flag = True
        self._interrupt_count += 1
        self._last_interrupt_time = now
        logger.info(f"⚠ Interruption signaled (total: {self._interrupt_count})")

        # Fire callbacks
        for cb in self._callbacks:
            try:
                cb()
            except Exception as e:
                logger.warning(f"Interrupt callback error: {e}")

    def clear_interrupt(self) -> None:
        """Clear the interruption flag after handling it."""
        self._interrupt_flag = False

    @property
    def interrupt_count(self) -> int:
        return self._interrupt_count

    # ── Microphone Monitoring (Hardware Mode) ──────────────────────

    def start_monitoring(self) -> None:
        """Start the background microphone monitoring thread.

        This uses sounddevice to listen for human speech and
        automatically sets the interrupt flag when volume exceeds threshold.
        """
        if self._monitoring:
            return

        try:
            import sounddevice as sd
            import numpy as np

            self._monitoring = True

            def callback(indata, frames, time_info, status):
                """Sounddevice callback — runs in audio thread."""
                if self._interrupt_flag:
                    return
                volume_norm = float(np.linalg.norm(indata))
                if volume_norm > self._threshold:
                    self.signal_interrupt()
                    logger.debug(f"🎤 Mic detected speech (vol: {volume_norm:.4f})")

            def monitor_loop():
                """Run the microphone input stream."""
                logger.info("🎤 Starting microphone monitoring...")
                try:
                    with sd.InputStream(
                        samplerate=SAMPLE_RATE,
                        channels=1,
                        callback=callback,
                    ):
                        while self._monitoring:
                            time.sleep(0.1)
                except Exception as e:
                    logger.warning(f"Microphone monitoring error: {e}")
                finally:
                    logger.info("Mic monitoring stopped")

            self._monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
            self._monitor_thread.start()
            logger.info("Microphone monitoring started (thread-based)")

        except ImportError:
            logger.warning(
                "sounddevice not available — microphone monitoring disabled. "
                "Install with: pip install sounddevice numpy"
            )
            self._monitoring = False
        except Exception as e:
            logger.warning(f"Failed to start microphone monitoring: {e}")
            self._monitoring = False

    def stop_monitoring(self) -> None:
        """Stop the microphone monitoring thread."""
        self._monitoring = False
        if self._monitor_thread and self._monitor_thread.is_alive():
            self._monitor_thread.join(timeout=2.0)
            self._monitor_thread = None
        logger.info("Microphone monitoring stopped")

    @property
    def is_monitoring(self) -> bool:
        return self._monitoring

    # ── Interruption Recovery (from interruptible_runtime.py) ──────

    def get_recovery_flow(self) -> list[str]:
        """Get the recovery conversation flow after an interruption.

        Returns intent types for the recovery sequence.
        """
        self.clear_interrupt()
        return ["empathy", "reassurance"]

    def get_recovery_prompt(self) -> str:
        """Get an LLM prompt instructing how to handle the interruption."""
        self.clear_interrupt()
        return (
            "The customer has interrupted your speech. "
            "Acknowledge their interruption politely and ask how you can help. "
            "Keep your response brief and redirect to their needs."
        )

    # ── Event Callbacks ────────────────────────────────────────────

    def on_interrupt(self, callback: Callable) -> None:
        """Register a callback to fire on interrupt detection."""
        self._callbacks.append(callback)

    def remove_callback(self, callback: Callable) -> None:
        """Remove a registered interrupt callback."""
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    # ── State Management ───────────────────────────────────────────

    def reset(self) -> None:
        """Reset all interrupt state including debounce timer."""
        self._interrupt_flag = False
        self._interrupt_count = 0
        self._last_interrupt_time = 0.0
        self.clear_interrupt()

    def __repr__(self) -> str:
        return (
            f"InterruptDetector(interrupted={self._interrupt_flag}, "
            f"count={self._interrupt_count}, "
            f"monitoring={self._monitoring})"
        )


# ── Singleton ───────────────────────────────────────────────────────

_detector: InterruptDetector | None = None


def get_interrupt_detector() -> InterruptDetector:
    global _detector
    if _detector is None:
        _detector = InterruptDetector()
    return _detector
