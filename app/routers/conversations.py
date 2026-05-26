"""
Conversation Routes — Manage conversations, messages, and summaries.
"""

import time
from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    Message,
    ConversationCreate,
    ConversationResponse,
    ConversationListResponse,
)
from app.services.conversation import get_conversation_service

router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.post("", response_model=ConversationResponse, status_code=201)
async def create_conversation(params: ConversationCreate):
    """Create a new conversation."""
    conv_service = get_conversation_service()
    conv = conv_service.create(params)
    return conv.to_response()


@router.get("", response_model=ConversationListResponse)
async def list_conversations(active_only: bool = False):
    """List all conversations, optionally filtered to active ones."""
    conv_service = get_conversation_service()
    convs = conv_service.get_all(active_only=active_only)
    return ConversationListResponse(
        conversations=[c.to_response() for c in convs],
        total=len(convs),
    )


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(conversation_id: str):
    """Get a conversation by ID."""
    conv_service = get_conversation_service()
    conv = conv_service.get(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv.to_response()


@router.post("/{conversation_id}/messages", response_model=Message)
async def add_message(conversation_id: str, message: Message):
    """Add a message to a conversation."""
    conv_service = get_conversation_service()
    try:
        msg = conv_service.add_message(conversation_id, message)
        return msg
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{conversation_id}/messages")
async def get_messages(conversation_id: str, limit: int = 10):
    """Get recent messages from a conversation."""
    conv_service = get_conversation_service()
    messages = conv_service.get_history(conversation_id, limit=limit)
    return {"messages": messages, "total": len(messages)}


@router.patch("/{conversation_id}/status")
async def update_conversation_status(conversation_id: str, status: str):
    """Update conversation status."""
    valid_statuses = ["initializing", "in_progress", "paused", "completed", "failed"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}",
        )
    conv_service = get_conversation_service()
    conv = conv_service.get(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv_service.update_status(conversation_id, status)
    return {"status": status, "conversation_id": conversation_id}


@router.get("/{conversation_id}/summary")
async def get_conversation_summary(conversation_id: str):
    """Get a summary of a conversation."""
    conv_service = get_conversation_service()
    summary = conv_service.generate_summary(conversation_id)
    return {"summary": summary, "conversation_id": conversation_id}


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation."""
    conv_service = get_conversation_service()
    deleted = conv_service.delete(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "Conversation deleted", "conversation_id": conversation_id}
