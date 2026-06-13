"""
Recording Routes — Manage call recordings with retrieval and listing.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.recording import get_recording_service

router = APIRouter(prefix="/recordings", tags=["Recordings"])


@router.get("")
async def list_recordings(conversation_id: str | None = None, limit: int = 20):
    """List all recordings, optionally filtered by conversation_id."""
    service = get_recording_service()
    recordings = await service.list_recordings(
        conversation_id=conversation_id, limit=limit,
    )
    return {"recordings": recordings, "total": len(recordings)}


@router.get("/{conversation_id}")
async def get_conversation_recordings(conversation_id: str):
    """Get all recordings for a specific conversation."""
    service = get_recording_service()
    recordings = await service.list_recordings(
        conversation_id=conversation_id, limit=50,
    )
    if not recordings:
        return {"recordings": [], "total": 0, "conversation_id": conversation_id}
    return {"recordings": recordings, "total": len(recordings), "conversation_id": conversation_id}


@router.get("/{conversation_id}/file")
async def get_recording_file(conversation_id: str, turn: int = 0):
    """Download a recording audio file."""
    service = get_recording_service()
    entry = await service.get_recording(conversation_id, turn_number=turn)
    if not entry:
        raise HTTPException(
            status_code=404,
            detail=f"No recording found for conversation {conversation_id}" +
                   (f" turn {turn}" if turn else ""),
        )
    return FileResponse(
        entry.file_path,
        media_type="audio/wav",
        filename=f"recording_{conversation_id[:8]}_{entry.turn_number}.wav",
    )


@router.delete("/{conversation_id}")
async def delete_conversation_recording(conversation_id: str, turn: int = 0):
    """Delete a recording."""
    service = get_recording_service()
    deleted = await service.delete_recording(conversation_id, turn_number=turn)
    if not deleted:
        raise HTTPException(status_code=404, detail="Recording not found")
    return {"message": "Recording deleted", "conversation_id": conversation_id}
