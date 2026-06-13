"""
Call Recording Service — Persists call recordings with metadata and provides retrieval.

Stores recordings organized by conversation_id with metadata including
timestamps, durations, and file paths.
"""

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("ai_sales_agent.recording")

RECORDINGS_DIR = os.getenv("RECORDINGS_DIR", "data/recordings")
MAX_RECORDINGS_PER_CONVERSATION = 50


@dataclass
class RecordingEntry:
    """Metadata for a single call recording."""

    conversation_id: str
    call_id: str = ""
    turn_number: int = 0
    file_path: str = ""
    duration_seconds: float = 0.0
    file_size_bytes: int = 0
    created_at: float = field(default_factory=time.time)
    direction: str = "inbound"  # inbound or outbound


class RecordingService:
    """Manages call recording storage and retrieval."""

    def __init__(self, recordings_dir: str = RECORDINGS_DIR):
        self._recordings_dir = recordings_dir
        self._entries: list[RecordingEntry] = []
        self._max_entries = 1000

    async def initialize(self) -> None:
        """Ensure the recordings directory exists."""
        os.makedirs(self._recordings_dir, exist_ok=True)
        logger.info("Recording service initialized (dir=%s)", self._recordings_dir)

    async def save_recording(
        self,
        conversation_id: str,
        audio_bytes: bytes,
        call_id: str = "",
        turn_number: int = 0,
        direction: str = "inbound",
    ) -> RecordingEntry | None:
        """Save a recording to disk and index it.

        Args:
            conversation_id: Conversation identifier.
            audio_bytes: Raw audio data to save.
            call_id: FreeSWITCH call UUID.
            turn_number: Turn number in the conversation.
            direction: 'inbound' or 'outbound'.

        Returns:
            RecordingEntry with metadata, or None if save failed.
        """
        if not audio_bytes or len(audio_bytes) < 100:
            logger.warning("Recording too small to save for conv=%s", conversation_id)
            return None

        timestamp = int(time.time())
        filename = f"rec_{conversation_id[:8]}_{turn_number}_{timestamp}.wav"
        file_path = os.path.join(self._recordings_dir, filename)

        try:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(audio_bytes)
        except Exception as e:
            logger.error("Failed to save recording %s: %s", file_path, e)
            return None

        entry = RecordingEntry(
            conversation_id=conversation_id,
            call_id=call_id,
            turn_number=turn_number,
            file_path=file_path,
            duration_seconds=len(audio_bytes) / 32000,  # Approx: 16-bit mono 16kHz
            file_size_bytes=len(audio_bytes),
            created_at=time.time(),
            direction=direction,
        )

        self._entries.append(entry)
        if len(self._entries) > self._max_entries:
            self._entries = self._entries[-self._max_entries:]

        logger.info(
            "Recording saved: conv=%s turn=%d (%d bytes, %.1fs)",
            conversation_id, turn_number, len(audio_bytes), entry.duration_seconds,
        )
        return entry

    async def get_recording(self, conversation_id: str, turn_number: int = 0) -> RecordingEntry | None:
        """Get a specific recording by conversation and optional turn number."""
        for entry in reversed(self._entries):
            if entry.conversation_id == conversation_id:
                if turn_number == 0 or entry.turn_number == turn_number:
                    return entry
        return None

    async def get_recording_file(self, file_path: str) -> bytes | None:
        """Read recording file bytes from disk."""
        try:
            if os.path.exists(file_path):
                with open(file_path, "rb") as f:
                    return f.read()
        except Exception as e:
            logger.warning("Failed to read recording %s: %s", file_path, e)
        return None

    async def list_recordings(
        self, conversation_id: str | None = None, limit: int = 20,
    ) -> list[dict[str, Any]]:
        """List recordings, optionally filtered by conversation."""
        entries = self._entries
        if conversation_id:
            entries = [e for e in entries if e.conversation_id == conversation_id]

        return [
            {
                "conversation_id": e.conversation_id,
                "call_id": e.call_id,
                "turn_number": e.turn_number,
                "file_path": e.file_path,
                "file_name": os.path.basename(e.file_path),
                "duration_seconds": round(e.duration_seconds, 1),
                "file_size_bytes": e.file_size_bytes,
                "created_at": e.created_at,
                "direction": e.direction,
            }
            for e in entries[-limit:]
        ]

    async def delete_recording(self, conversation_id: str, turn_number: int = 0) -> bool:
        """Delete a recording by conversation and optional turn number."""
        entry = await self.get_recording(conversation_id, turn_number)
        if not entry:
            return False
        try:
            if os.path.exists(entry.file_path):
                os.remove(entry.file_path)
            self._entries = [e for e in self._entries if e is not entry]
            return True
        except Exception as e:
            logger.warning("Failed to delete recording: %s", e)
            return False

    async def cleanup_old_recordings(self, max_age_hours: int = 72) -> int:
        """Remove recordings older than max_age_hours."""
        cutoff = time.time() - (max_age_hours * 3600)
        before = len(self._entries)
        self._entries = [e for e in self._entries if e.created_at > cutoff]
        removed = before - len(self._entries)
        if removed:
            logger.info("Cleaned up %d old recordings", removed)
        return removed


# ── Singleton ──

_recording_service: RecordingService | None = None


def get_recording_service() -> RecordingService:
    global _recording_service
    if _recording_service is None:
        _recording_service = RecordingService()
    return _recording_service


def reset_recording_service() -> None:
    global _recording_service
    _recording_service = None
