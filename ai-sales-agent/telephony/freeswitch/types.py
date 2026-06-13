"""
FreeSWITCH Types — Data classes and type aliases for call state tracking.
"""

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class CallState(str, Enum):
    """States of a FreeSWITCH call lifecycle."""

    RINGING = "ringing"
    ANSWERED = "answered"
    RECORDING = "recording"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"


class CallDirection(str, Enum):
    """Whether the call is inbound or outbound."""

    INBOUND = "inbound"
    OUTBOUND = "outbound"


@dataclass
class FreeswitchCall:
    """Represents a single FreeSWITCH call tracked by the bridge service."""

    call_uuid: str
    caller_number: str
    called_number: str
    direction: CallDirection = CallDirection.INBOUND
    state: CallState = CallState.RINGING
    conversation_id: str = ""
    started_at: float = 0.0
    answered_at: float = 0.0
    ended_at: float | None = None
    turn_count: int = 0
    recording_file: str = ""
    last_audio_file: str = ""
    sip_call_id: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    error: str | None = None

    def mark_answered(self) -> None:
        self.state = CallState.ANSWERED
        if not self.answered_at:
            self.answered_at = time.time()

    def mark_recording(self, file_path: str) -> None:
        self.state = CallState.RECORDING
        self.recording_file = file_path

    def mark_processing(self) -> None:
        self.state = CallState.PROCESSING

    def mark_speaking(self) -> None:
        self.state = CallState.SPEAKING

    def mark_waiting(self) -> None:
        self.state = CallState.WAITING

    def mark_completed(self) -> None:
        self.state = CallState.COMPLETED
        self.ended_at = time.time()

    def mark_failed(self, reason: str) -> None:
        self.state = CallState.FAILED
        self.error = reason
        self.ended_at = time.time()

    def increment_turn(self) -> int:
        self.turn_count += 1
        return self.turn_count

    @property
    def duration(self) -> float:
        """Call duration in seconds (live or completed)."""
        start = self.answered_at or self.started_at
        end = self.ended_at or time.time()
        return end - start

    @property
    def is_active(self) -> bool:
        return self.state not in (CallState.COMPLETED, CallState.FAILED)

    @property
    def summary(self) -> dict[str, Any]:
        return {
            "call_uuid": self.call_uuid,
            "caller_number": self.caller_number,
            "called_number": self.called_number,
            "direction": self.direction.value,
            "state": self.state.value,
            "conversation_id": self.conversation_id,
            "duration_seconds": round(self.duration, 1),
            "turn_count": self.turn_count,
            "error": self.error,
        }


@dataclass
class ESLCommand:
    """A command or API call to send to FreeSWITCH via ESL."""

    command: str
    args: str = ""
    bgapi: bool = False

    def encode(self) -> bytes:
        """Encode as ESL command bytes."""
        if self.bgapi:
            return f"bgapi {self.command} {self.args}\n\n".encode()
        return f"api {self.command} {self.args}\n\n".encode()


@dataclass
class ESLResponse:
    """Response received from FreeSWITCH ESL."""

    success: bool
    body: str
    headers: dict[str, str] = field(default_factory=dict)
    content_type: str = "text/plain"
    job_uuid: str = ""
