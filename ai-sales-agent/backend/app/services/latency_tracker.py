"""
Latency Tracker — End-to-end latency instrumentation for the voice pipeline.

Measures and stores per-stage latencies:
  Call Received → STT Start → STT Complete → LLM Start → LLM Complete → TTS Start → TTS Complete → Audio Playback Start

Stored per conversation_id and call_id with timestamps and durations.
Exposes aggregated metrics via /metrics/latency.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("ai_sales_agent.latency_tracker")


@dataclass
class LatencyRecord:
    """A single turn's latency record through the voice pipeline."""

    conversation_id: str
    call_id: str = ""
    turn_number: int = 0

    # Timestamps (monotonic seconds)
    call_received: float = 0.0
    stt_start: float = 0.0
    stt_complete: float = 0.0
    llm_start: float = 0.0
    llm_first_token: float = 0.0
    llm_complete: float = 0.0
    tts_start: float = 0.0
    tts_complete: float = 0.0
    audio_playback_start: float = 0.0

    # Input/output sizes for context
    audio_bytes: int = 0
    transcription_length: int = 0
    llm_response_length: int = 0
    tts_audio_bytes: int = 0

    # Metadata
    provider_stt: str = ""
    provider_llm: str = ""
    provider_tts: str = ""
    created_at: float = field(default_factory=time.time)

    @property
    def stt_ms(self) -> float:
        if self.stt_start > 0 and self.stt_complete > 0:
            return (self.stt_complete - self.stt_start) * 1000
        return 0.0

    @property
    def llm_ms(self) -> float:
        if self.llm_start > 0 and self.llm_complete > 0:
            return (self.llm_complete - self.llm_start) * 1000
        return 0.0

    @property
    def llm_first_token_ms(self) -> float:
        if self.llm_start > 0 and self.llm_first_token > 0:
            return (self.llm_first_token - self.llm_start) * 1000
        return 0.0

    @property
    def tts_ms(self) -> float:
        if self.tts_start > 0 and self.tts_complete > 0:
            return (self.tts_complete - self.tts_start) * 1000
        return 0.0

    @property
    def total_ms(self) -> float:
        """Total processing time from call_received or stt_start through tts_complete."""
        start = self.stt_start if self.stt_start > 0 else self.call_received
        end = self.tts_complete if self.tts_complete > 0 else self.llm_complete
        if start > 0 and end > 0:
            return (end - start) * 1000
        return 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "conversation_id": self.conversation_id,
            "call_id": self.call_id,
            "turn_number": self.turn_number,
            "stt_ms": round(self.stt_ms, 1),
            "llm_ms": round(self.llm_ms, 1),
            "llm_first_token_ms": round(self.llm_first_token_ms, 1),
            "tts_ms": round(self.tts_ms, 1),
            "total_ms": round(self.total_ms, 1),
            "audio_bytes": self.audio_bytes,
            "transcription_length": self.transcription_length,
            "llm_response_length": self.llm_response_length,
            "tts_audio_bytes": self.tts_audio_bytes,
            "provider_stt": self.provider_stt,
            "provider_llm": self.provider_llm,
            "provider_tts": self.provider_tts,
            "created_at": self.created_at,
        }


class LatencyTracker:
    """Tracks and stores per-call latency records.

    In-memory storage with optional export.
    Thread-safe for async access patterns.
    """

    def __init__(self, max_records: int = 1000):
        self._records: list[LatencyRecord] = []
        self._current: dict[str, LatencyRecord] = {}  # conversation_id -> active record
        self._max_records = max_records
        self._turn_counters: dict[str, int] = {}

    # ── Stage Tracking ───────────────────────────────────────────────

    def begin_call(self, conversation_id: str, call_id: str = "") -> None:
        """Record that a call has been received."""
        self._turn_counters[conversation_id] = 0
        record = self._get_or_create(conversation_id, call_id)
        record.call_received = time.monotonic()
        logger.debug("LATENCY[call_received] conv=%s call=%s", conversation_id, call_id)

    def mark_stt_start(self, conversation_id: str, call_id: str = "", audio_bytes: int = 0) -> None:
        record = self._get_or_create(conversation_id, call_id)
        record.stt_start = time.monotonic()
        record.audio_bytes = audio_bytes

    def mark_stt_complete(self, conversation_id: str, call_id: str = "", transcription: str = "") -> None:
        record = self._get_or_create(conversation_id, call_id)
        record.stt_complete = time.monotonic()
        record.transcription_length = len(transcription)

    def mark_llm_start(self, conversation_id: str, call_id: str = "") -> None:
        record = self._get_or_create(conversation_id, call_id)
        record.llm_start = time.monotonic()

    def mark_llm_first_token(self, conversation_id: str, call_id: str = "") -> None:
        record = self._get_or_create(conversation_id, call_id)
        if record.llm_first_token == 0:
            record.llm_first_token = time.monotonic()

    def mark_llm_complete(self, conversation_id: str, call_id: str = "", response: str = "") -> None:
        record = self._get_or_create(conversation_id, call_id)
        record.llm_complete = time.monotonic()
        record.llm_response_length = len(response)

    def mark_tts_start(self, conversation_id: str, call_id: str = "") -> None:
        record = self._get_or_create(conversation_id, call_id)
        record.tts_start = time.monotonic()

    def mark_tts_complete(self, conversation_id: str, call_id: str = "", audio_bytes: int = 0) -> None:
        record = self._get_or_create(conversation_id, call_id)
        record.tts_complete = time.monotonic()
        record.tts_audio_bytes = audio_bytes

    def mark_audio_playback_start(self, conversation_id: str, call_id: str = "") -> None:
        record = self._get_or_create(conversation_id, call_id)
        record.audio_playback_start = time.monotonic()

    def finalize_record(self, conversation_id: str) -> None:
        """Store the current record and clean up per-conversation state."""
        record = self._current.pop(conversation_id, None)
        if record is None:
            return

        # Set provider info
        try:
            from app.config import settings
            record.provider_stt = settings.STT_PROVIDER
            record.provider_llm = settings.LLM_PROVIDER
            record.provider_tts = settings.TTS_PROVIDER
        except Exception:
            pass

        # Trim old records
        self._records.append(record)
        if len(self._records) > self._max_records:
            self._records = self._records[-self._max_records:]

        logger.info(
            "LATENCY[turn=%d] conv=%s | STT=%.0fms | LLM=%.0fms | TTS=%.0fms | total=%.0fms",
            record.turn_number, conversation_id,
            record.stt_ms, record.llm_ms, record.tts_ms, record.total_ms,
        )

    # ── Aggregation ─────────────────────────────────────────────────

    def get_aggregate_stats(self, window_minutes: int = 10) -> dict[str, Any]:
        """Compute aggregate latency stats over recent records."""
        cutoff = time.time() - (window_minutes * 60)
        recent = [r for r in self._records if r.created_at >= cutoff]

        if not recent:
            return {
                "avg_stt_ms": 0.0,
                "avg_llm_ms": 0.0,
                "avg_tts_ms": 0.0,
                "avg_total_ms": 0.0,
                "p95_stt_ms": 0.0,
                "p95_llm_ms": 0.0,
                "p95_tts_ms": 0.0,
                "p95_total_ms": 0.0,
                "total_records": 0,
                "window_minutes": window_minutes,
                "active_providers": {"stt": "", "llm": "", "tts": ""},
            }

        stt_ms = [r.stt_ms for r in recent]
        llm_ms = [r.llm_ms for r in recent]
        tts_ms = [r.tts_ms for r in recent]
        total_ms = [r.total_ms for r in recent]

        def avg(vals):
            return round(sum(vals) / len(vals), 1) if vals else 0.0

        def p95(vals):
            if not vals:
                return 0.0
            sorted_vals = sorted(vals)
            idx = int(len(sorted_vals) * 0.95)
            return round(sorted_vals[min(idx, len(sorted_vals) - 1)], 1)

        latest = recent[-1]

        return {
            "avg_stt_ms": avg(stt_ms),
            "avg_llm_ms": avg(llm_ms),
            "avg_tts_ms": avg(tts_ms),
            "avg_total_ms": avg(total_ms),
            "p95_stt_ms": p95(stt_ms),
            "p95_llm_ms": p95(llm_ms),
            "p95_tts_ms": p95(tts_ms),
            "p95_total_ms": p95(total_ms),
            "total_records": len(recent),
            "window_minutes": window_minutes,
            "active_providers": {
                "stt": latest.provider_stt,
                "llm": latest.provider_llm,
                "tts": latest.provider_tts,
            },
        }

    def get_recent_records(self, limit: int = 20) -> list[dict[str, Any]]:
        """Return the most recent latency records."""
        return [r.to_dict() for r in self._records[-limit:]]

    def get_record(self, conversation_id: str) -> dict[str, Any] | None:
        """Get a specific record by conversation_id."""
        for r in reversed(self._records):
            if r.conversation_id == conversation_id:
                return r.to_dict()
        return None

    def clear(self) -> None:
        """Clear all records."""
        self._records.clear()
        self._current.clear()
        self._turn_counters.clear()

    # ── Internal ─────────────────────────────────────────────────────

    def _get_or_create(self, conversation_id: str, call_id: str = "") -> LatencyRecord:
        if conversation_id not in self._current:
            turn = self._turn_counters.get(conversation_id, 0)
            if turn == 0:
                self._turn_counters[conversation_id] = 1
            record = LatencyRecord(
                conversation_id=conversation_id,
                call_id=call_id,
                turn_number=self._turn_counters.get(conversation_id, 1),
            )
            self._current[conversation_id] = record
        return self._current[conversation_id]

    def new_turn(self, conversation_id: str) -> None:
        """Start tracking a new turn for this conversation.

        Saves the current turn's record and creates a fresh record for the next turn.
        Equivalent to calling finalize_record() followed by creating a new record.
        """
        old = self._current.pop(conversation_id, None)
        if old:
            # Set provider info before saving
            try:
                from app.config import settings
                old.provider_stt = settings.STT_PROVIDER
                old.provider_llm = settings.LLM_PROVIDER
                old.provider_tts = settings.TTS_PROVIDER
            except Exception:
                pass
            self._records.append(old)
            if len(self._records) > self._max_records:
                self._records = self._records[-self._max_records:]

        # Create new record for next turn
        turn = self._turn_counters.get(conversation_id, 0) + 1
        self._turn_counters[conversation_id] = turn
        call_id = old.call_id if old else ""
        new_record = LatencyRecord(
            conversation_id=conversation_id,
            call_id=call_id,
            turn_number=turn,
        )
        self._current[conversation_id] = new_record


# ── Singleton ───────────────────────────────────────────────────────

_tracker: LatencyTracker | None = None


def get_latency_tracker() -> LatencyTracker:
    global _tracker
    if _tracker is None:
        _tracker = LatencyTracker()
    return _tracker


def reset_latency_tracker() -> None:
    global _tracker
    _tracker = None
