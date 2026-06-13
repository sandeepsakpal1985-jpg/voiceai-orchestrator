"""Tests for backend/app/services/recording.py — RecordingService."""

import os
import tempfile
import time

import pytest

from app.services.recording import (
    RecordingEntry,
    RecordingService,
    get_recording_service,
    reset_recording_service,
)


@pytest.fixture
def temp_dir():
    """Create a temporary directory for recording storage."""
    with tempfile.TemporaryDirectory() as tmpdir:
        old_val = os.environ.get("RECORDINGS_DIR")
        os.environ["RECORDINGS_DIR"] = tmpdir
        reset_recording_service()
        yield tmpdir
        reset_recording_service()
        if old_val:
            os.environ["RECORDINGS_DIR"] = old_val
        else:
            del os.environ["RECORDINGS_DIR"]


@pytest.fixture
async def service(temp_dir):
    reset_recording_service()
    svc = get_recording_service()
    # Override to use temp directory for test isolation
    # (RECORDINGS_DIR is evaluated at import time, env var override is too late)
    svc._recordings_dir = temp_dir
    await svc.initialize()
    return svc


@pytest.mark.asyncio
class TestRecordingService:
    async def test_initial_state(self, service):
        """Service should start with empty entries and initialized dir."""
        entries = await service.list_recordings()
        assert entries == []
        assert os.path.exists(service._recordings_dir)

    async def test_save_recording(self, service):
        """save_recording should persist audio and return entry with metadata."""
        audio = b"\x00\x01\x02\x03" * 1000  # ~4KB test audio
        entry = await service.save_recording(
            conversation_id="conv-123",
            audio_bytes=audio,
            call_id="call-uuid-1",
            turn_number=1,
            direction="inbound",
        )
        assert entry is not None
        assert entry.conversation_id == "conv-123"
        assert entry.call_id == "call-uuid-1"
        assert entry.turn_number == 1
        assert entry.direction == "inbound"
        assert entry.file_size_bytes == len(audio)
        assert entry.duration_seconds == pytest.approx(len(audio) / 32000, rel=0.1)
        assert os.path.exists(entry.file_path)

    async def test_save_recording_too_small(self, service):
        """Recording under 100 bytes should be rejected."""
        tiny_audio = b"\x00" * 50
        entry = await service.save_recording(
            conversation_id="conv-123",
            audio_bytes=tiny_audio,
        )
        assert entry is None

    async def test_save_recording_empty(self, service):
        """Empty byte string should be rejected."""
        entry = await service.save_recording(
            conversation_id="conv-123",
            audio_bytes=b"",
        )
        assert entry is None

    async def test_get_recording_by_turn(self, service):
        """get_recording should find a specific turn."""
        await service.save_recording(
            conversation_id="conv-456",
            audio_bytes=b"\x00" * 500,
            turn_number=1,
        )
        await service.save_recording(
            conversation_id="conv-456",
            audio_bytes=b"\x01" * 500,
            turn_number=2,
        )
        entry = await service.get_recording("conv-456", turn_number=2)
        assert entry is not None
        assert entry.turn_number == 2

    async def test_get_recording_latest(self, service):
        """get_recording with turn_number=0 should return the latest."""
        await service.save_recording(
            conversation_id="conv-789",
            audio_bytes=b"\x00" * 500,
            turn_number=1,
        )
        await service.save_recording(
            conversation_id="conv-789",
            audio_bytes=b"\x01" * 500,
            turn_number=2,
        )
        entry = await service.get_recording("conv-789")  # turn_number defaults to 0
        assert entry is not None
        assert entry.turn_number == 2  # Latest

    async def test_get_recording_nonexistent(self, service):
        """get_recording should return None for missing conversation."""
        entry = await service.get_recording("nonexistent-conv")
        assert entry is None

    async def test_get_recording_file(self, service):
        """get_recording_file should read actual file bytes."""
        audio = b"\xAA\xBB\xCC" * 300
        entry = await service.save_recording(
            conversation_id="conv-file",
            audio_bytes=audio,
        )
        retrieved = await service.get_recording_file(entry.file_path)
        assert retrieved == audio

    async def test_get_recording_file_missing(self, service):
        """get_recording_file should return None for missing file."""
        result = await service.get_recording_file("/nonexistent/path.wav")
        assert result is None

    async def test_list_recordings(self, service):
        """list_recordings should return all recordings."""
        for i in range(3):
            await service.save_recording(
                conversation_id=f"conv-{i}",
                audio_bytes=b"\x00" * 500,
                turn_number=1,
            )
        all_entries = await service.list_recordings()
        assert len(all_entries) >= 3

    async def test_list_recordings_filtered(self, service):
        """list_recordings should filter by conversation_id."""
        await service.save_recording(
            conversation_id="conv-filter",
            audio_bytes=b"\x00" * 500,
            turn_number=1,
        )
        await service.save_recording(
            conversation_id="conv-other",
            audio_bytes=b"\x00" * 500,
            turn_number=1,
        )
        filtered = await service.list_recordings(conversation_id="conv-filter")
        assert len(filtered) >= 1
        for e in filtered:
            assert e["conversation_id"] == "conv-filter"

    async def test_list_recordings_respects_limit(self, service):
        """list_recordings should respect the limit parameter."""
        for i in range(5):
            await service.save_recording(
                conversation_id="conv-limit",
                audio_bytes=b"\x00" * 500,
                turn_number=i + 1,
            )
        limited = await service.list_recordings(limit=2)
        assert len(limited) <= 2

    async def test_delete_recording(self, service):
        """delete_recording should remove the file and entry."""
        audio = b"\xDD" * 500
        entry = await service.save_recording(
            conversation_id="conv-del",
            audio_bytes=audio,
            turn_number=1,
        )
        assert os.path.exists(entry.file_path)

        deleted = await service.delete_recording("conv-del", turn_number=1)
        assert deleted is True
        assert not os.path.exists(entry.file_path)

        # Should no longer be in list
        entries = await service.list_recordings(conversation_id="conv-del")
        assert len(entries) == 0

    async def test_delete_nonexistent(self, service):
        """delete_recording should return False for missing recording."""
        deleted = await service.delete_recording("nonexistent")
        assert deleted is False

    async def test_cleanup_old_recordings(self, service):
        """cleanup_old_recordings should remove old entries."""
        # Save a recording
        await service.save_recording(
            conversation_id="conv-old",
            audio_bytes=b"\x00" * 500,
        )
        # Set its created_at to the past (manipulate internal list)
        if service._entries:
            service._entries[-1].created_at = time.time() - 999999  # Very old

        removed = await service.cleanup_old_recordings(max_age_hours=1)
        assert removed >= 1

        entries = await service.list_recordings()
        old_entries = [e for e in entries if e["conversation_id"] == "conv-old"]
        assert len(old_entries) == 0

    async def test_max_entries_enforced(self, service):
        """Service should limit total entries to _max_entries."""
        service._max_entries = 5
        for i in range(10):
            await service.save_recording(
                conversation_id=f"conv-{i}",
                audio_bytes=b"\x00" * 500,
            )
        assert len(service._entries) <= 5

    async def test_direction_tracking(self, service):
        """Recording direction should be tracked correctly."""
        inbound = await service.save_recording(
            conversation_id="conv-dir",
            audio_bytes=b"\x00" * 500,
            direction="inbound",
            turn_number=1,
        )
        outbound = await service.save_recording(
            conversation_id="conv-dir",
            audio_bytes=b"\x01" * 500,
            direction="outbound",
            turn_number=1,
        )
        assert inbound.direction == "inbound"
        assert outbound.direction == "outbound"

    async def test_initialize_creates_dir(self, temp_dir):
        """initialize() should ensure the recordings directory exists."""
        new_dir = os.path.join(temp_dir, "nested", "recordings")
        svc = RecordingService(recordings_dir=new_dir)
        assert not os.path.exists(new_dir)
        await svc.initialize()
        assert os.path.exists(new_dir)

    async def test_save_without_initialize_works(self, temp_dir):
        """Save should work even without explicit initialize (mkdir via open)."""
        new_dir = os.path.join(temp_dir, "auto_create")
        svc = RecordingService(recordings_dir=new_dir)
        entry = await svc.save_recording(
            conversation_id="conv-auto",
            audio_bytes=b"\x00" * 500,
        )
        assert entry is not None
        assert os.path.exists(entry.file_path)


@pytest.mark.asyncio
class TestRecordingEntry:
    async def test_entry_defaults(self):
        """RecordingEntry should have sensible defaults."""
        entry = RecordingEntry(conversation_id="test")
        assert entry.conversation_id == "test"
        assert entry.call_id == ""
        assert entry.turn_number == 0
        assert entry.file_path == ""
        assert entry.duration_seconds == 0.0
        assert entry.direction == "inbound"
        assert entry.created_at > 0

    async def test_entry_metadata(self):
        """RecordingEntry should store all metadata fields."""
        entry = RecordingEntry(
            conversation_id="conv-meta",
            call_id="call-uuid",
            turn_number=3,
            file_path="/tmp/test.wav",
            duration_seconds=5.5,
            file_size_bytes=176000,
            created_at=1234567890.0,
            direction="outbound",
        )
        assert entry.turn_number == 3
        assert entry.duration_seconds == 5.5
        assert entry.file_size_bytes == 176000


class TestSingleton:
    def test_get_recording_service(self):
        """get_recording_service should return a singleton."""
        reset_recording_service()
        s1 = get_recording_service()
        s2 = get_recording_service()
        assert s1 is s2

    def test_reset_recording_service(self):
        """reset_recording_service should clear the singleton."""
        reset_recording_service()
        s1 = get_recording_service()
        reset_recording_service()
        s2 = get_recording_service()
        assert s1 is not s2
