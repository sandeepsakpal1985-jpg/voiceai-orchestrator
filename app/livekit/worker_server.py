"""
LiveKit Agent Worker Server — Standalone entry point for LiveKit workers.

This module provides a FastAPI app that runs alongside the main orchestrator
to handle LiveKit agent worker functionality using the production VoiceAgent.

The LiveKit worker (running via `cli.run_app()`) automatically picks up new
jobs when a participant joins a room — the worker server just creates the
room and returns session info for the dashboard.

Run as a separate process:
    python -m app.livekit.worker_server
"""

import logging

from fastapi import FastAPI
from pydantic import BaseModel

from app.config import settings
from app.livekit.room_manager import get_room_manager

logger = logging.getLogger("voiceai.livekit.worker_server")

worker_app = FastAPI(
    title="VoiceAI LiveKit Worker",
    version=settings.APP_VERSION,
    description="LiveKit agent worker server for realtime voice processing",
)


class StartSessionRequest(BaseModel):
    room_name: str
    participant_identity: str
    system_prompt: str | None = None


@worker_app.post("/sessions/start")
async def start_session(req: StartSessionRequest):
    """Create a LiveKit room for a new agent session.

    The LiveKit worker (running via `cli.run_app()`) automatically
    picks up new jobs when a participant joins the room.
    """
    room_manager = get_room_manager()
    session = await room_manager.create_room(
        participant_identity=req.participant_identity,
        room_name=req.room_name,
    )

    return {
        "session_id": session.session_id,
        "room_name": session.room_name,
        "status": "room_created",
    }


@worker_app.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str):
    """Stop a LiveKit agent session."""
    room_manager = get_room_manager()
    await room_manager.end_session(session_id)
    return {"status": "stopped", "session_id": session_id}


@worker_app.get("/sessions/active")
async def get_active_sessions():
    """Get all active sessions."""
    room_manager = get_room_manager()
    sessions = room_manager.get_active_sessions()
    return {
        "count": len(sessions),
        "sessions": [
            {
                "session_id": s.session_id,
                "room_name": s.room_name,
                "participant": s.participant_identity,
                "created_at": s.created_at,
            }
            for s in sessions
        ],
    }


@worker_app.get("/health")
async def health():
    """Health check endpoint."""
    room_manager = get_room_manager()
    return {
        "status": "ok",
        "active_sessions": room_manager.get_active_count(),
    }


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s",
    )

    port = settings.LIVEKIT_WORKER_PORT
    logger.info("Starting LiveKit worker server on port %d...", port)
    logger.info("Using production VoiceAgent (LiveKit Agents v1.x)")

    uvicorn.run(
        "app.livekit.worker_server:worker_app",
        host="0.0.0.0",
        port=port,
        log_level=settings.LIVEKIT_WORKER_LOG_LEVEL,
    )
