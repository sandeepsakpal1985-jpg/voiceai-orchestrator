"""
LiveKit Room Manager — Room/session lifecycle management for voice agent sessions.
"""

import logging
import time
import uuid
from dataclasses import dataclass, field

from app.config import settings

logger = logging.getLogger("ai_sales_agent.livekit.room_manager")


@dataclass
class RoomSession:
    room_name: str
    session_id: str
    participant_identity: str
    created_at: float
    status: str = "active"
    metadata: dict = field(default_factory=dict)


class LiveKitRoomManager:
    """Manages LiveKit room lifecycle for voice agent sessions."""

    def __init__(self):
        self._sessions: dict[str, RoomSession] = {}

    async def initialize(self) -> None:
        try:
            import livekit.api as lkapi
            logger.info("LiveKit room manager initialized (host: %s)", settings.LIVEKIT_URL)
        except ImportError:
            logger.warning("livekit-api not installed. Install with: pip install livekit-api")

    async def create_room(self, participant_identity: str, room_name: str | None = None, metadata: dict | None = None) -> RoomSession:
        session_id = str(uuid.uuid4())
        room = room_name or f"{settings.LIVEKIT_ROOM_PREFIX}{session_id[:8]}"
        session = RoomSession(room_name=room, session_id=session_id, participant_identity=participant_identity, created_at=time.time(), metadata=metadata or {})
        self._sessions[session_id] = session
        logger.info("Created LiveKit room '%s' for '%s'", room, participant_identity)
        return session

    async def end_session(self, session_id: str) -> None:
        session = self._sessions.get(session_id)
        if session:
            session.status = "ended"
            logger.info("Ended session '%s'", session_id)

    def get_session(self, session_id: str) -> RoomSession | None:
        return self._sessions.get(session_id)

    def get_session_by_room(self, room_name: str) -> RoomSession | None:
        for s in self._sessions.values():
            if s.room_name == room_name:
                return s
        return None

    def get_active_sessions(self) -> list[RoomSession]:
        return [s for s in self._sessions.values() if s.status != "ended"]

    def get_active_count(self) -> int:
        return len(self.get_active_sessions())

    async def cleanup_stale_sessions(self, max_age: float = 3600) -> int:
        now = time.time()
        stale = [sid for sid, s in self._sessions.items() if s.status == "ended" and (now - s.created_at) > max_age]
        for sid in stale:
            del self._sessions[sid]
        if stale:
            logger.info("Cleaned up %d stale sessions", len(stale))
        return len(stale)


_room_manager: LiveKitRoomManager | None = None


def get_room_manager() -> LiveKitRoomManager:
    global _room_manager
    if _room_manager is None:
        _room_manager = LiveKitRoomManager()
    return _room_manager
