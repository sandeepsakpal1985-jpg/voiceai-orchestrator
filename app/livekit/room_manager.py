"""
LiveKit Room Manager — Room/session lifecycle management.

Handles creating, managing, and tearing down LiveKit rooms
for voice agent sessions.
"""

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.config import settings

logger = logging.getLogger("voiceai.livekit.room_manager")


@dataclass
class RoomSession:
    """Tracks a LiveKit room session."""
    room_name: str
    session_id: str
    participant_identity: str
    created_at: float
    status: str = "active"  # active, processing, ended
    metadata: dict = field(default_factory=dict)


class LiveKitRoomManager:
    """Manages LiveKit room lifecycle for voice agent sessions.

    Each voice call creates a LiveKit room. Rooms are cleaned up
    automatically when calls end.

    Usage:
        manager = LiveKitRoomManager()
        session = await manager.create_room("user-123")
        # ... agent processes audio ...
        await manager.end_session(session.session_id)
    """

    def __init__(self):
        self._sessions: dict[str, RoomSession] = {}
        self._livekit_host: str | None = None

    async def initialize(self) -> None:
        """Initialize the LiveKit server connection."""
        try:
            import livekit.api as lkapi

            self._livekit_host = settings.LIVEKIT_URL
            logger.info(
                "LiveKit room manager initialized (host: %s)",
                self._livekit_host,
            )
        except ImportError:
            logger.warning(
                "livekit-api package not installed. "
                "Install with: pip install livekit-api"
            )

    async def create_room(
        self,
        participant_identity: str,
        room_name: str | None = None,
        metadata: dict | None = None,
    ) -> RoomSession:
        """Create a new LiveKit room for a voice session.

        Args:
            participant_identity: Unique identifier for the participant
            room_name: Optional custom room name (auto-generated if not provided)
            metadata: Optional room metadata

        Returns:
            RoomSession with room details
        """
        session_id = str(uuid.uuid4())
        room = room_name or f"{settings.LIVEKIT_ROOM_PREFIX}{session_id[:8]}"

        session = RoomSession(
            room_name=room,
            session_id=session_id,
            participant_identity=participant_identity,
            created_at=time.time(),
            metadata=metadata or {},
        )

        self._sessions[session_id] = session
        logger.info(
            "Created LiveKit room '%s' for participant '%s' (session: %s)",
            room,
            participant_identity,
            session_id,
        )
        return session

    async def end_session(self, session_id: str) -> None:
        """End a voice session and clean up the room.

        Args:
            session_id: Session identifier to end
        """
        session = self._sessions.get(session_id)
        if not session:
            logger.warning("Session not found: %s", session_id)
            return

        session.status = "ended"
        logger.info(
            "Ended LiveKit session '%s' (room: %s, duration: %.1fs)",
            session_id,
            session.room_name,
            time.time() - session.created_at,
        )

    def get_session(self, session_id: str) -> RoomSession | None:
        """Get a room session by ID."""
        return self._sessions.get(session_id)

    def get_session_by_room(self, room_name: str) -> RoomSession | None:
        """Find a session by room name."""
        for session in self._sessions.values():
            if session.room_name == room_name:
                return session
        return None

    def get_active_sessions(self) -> list[RoomSession]:
        """Get all active (non-ended) sessions."""
        return [
            s for s in self._sessions.values()
            if s.status != "ended"
        ]

    def get_active_count(self) -> int:
        """Get the number of active sessions."""
        return len(self.get_active_sessions())

    async def cleanup_stale_sessions(self, max_age: float = 3600) -> int:
        """Clean up sessions older than max_age seconds.

        Args:
            max_age: Maximum session age in seconds (default: 1 hour)

        Returns:
            Number of stale sessions cleaned up
        """
        now = time.time()
        stale = [
            sid for sid, s in self._sessions.items()
            if s.status == "ended" and (now - s.created_at) > max_age
        ]
        for sid in stale:
            del self._sessions[sid]
        if stale:
            logger.info("Cleaned up %d stale sessions", len(stale))
        return len(stale)


# Singleton
_room_manager: LiveKitRoomManager | None = None


def get_room_manager() -> LiveKitRoomManager:
    global _room_manager
    if _room_manager is None:
        _room_manager = LiveKitRoomManager()
    return _room_manager
