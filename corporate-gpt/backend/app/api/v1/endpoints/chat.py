"""Chat API with streaming support."""
import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.chat import Chat, Message
from app.services.rag_service import RAGService
from fastapi.responses import StreamingResponse


# Singleton RAG service instance
_rag_service: RAGService | None = None


def get_rag_service() -> RAGService:
    global _rag_service
    if _rag_service is None:
        _rag_service = RAGService()
    return _rag_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/")
async def create_chat(title: str = "New Chat", department_filter: str = None,
                       ai_mode: str = "strict", current_user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    chat = Chat(organization_id=current_user.organization_id, user_id=current_user.id,
                title=title, department_filter=department_filter, ai_mode=ai_mode)
    db.add(chat)
    await db.flush()
    return chat


@router.get("/")
async def list_chats(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List chats with pagination."""
    from sqlalchemy import func as sa_func
    # Count
    count_q = select(sa_func.count()).select_from(Chat).where(Chat.user_id == current_user.id)
    total = (await db.execute(count_q)).scalar() or 0
    # Query
    result = await db.execute(
        select(Chat).where(Chat.user_id == current_user.id)
        .order_by(Chat.updated_at.desc())
        .limit(page_size).offset((page - 1) * page_size)
    )
    return {
        "items": result.scalars().all(),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("/{chat_id}/messages")
async def send_message(chat_id: str, content: str, current_user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404)

    # Store user message
    user_msg = Message(chat_id=chat_id, role="user", content=content)
    db.add(user_msg)
    await db.flush()

    # Get AI response
    rag = get_rag_service()
    response = await rag.query(
        organization_id=current_user.organization_id,
        query=content,
        mode=chat.ai_mode,
    )

    # Store AI message
    confidence = None
    if response["citations"]:
        confidence = response["citations"][0].get("score")
    ai_msg = Message(chat_id=chat_id, role="assistant", content=response["answer"],
                     citations=response["citations"], ai_mode=chat.ai_mode,
                     confidence_score=confidence)
    db.add(ai_msg)
    await db.flush()

    chat.message_count += 1
    chat.updated_at = datetime.now(timezone.utc)

    return {
        "user_message": {"id": user_msg.id, "content": content},
        "ai_message": {"id": ai_msg.id, "content": response["answer"],
                       "citations": response["citations"], "ai_mode": response["ai_mode"]},
    }


@router.get("/{chat_id}/messages")
async def get_messages(chat_id: str, current_user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404)
    msgs = await db.execute(
        select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at)
    )
    return msgs.scalars().all()


@router.post("/{chat_id}/stream")
async def stream_message(chat_id: str, content: str, current_user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404)

    user_msg = Message(chat_id=chat_id, role="user", content=content)
    db.add(user_msg)
    await db.flush()

    async def event_stream():
        full_content = ""
        citations = []
        rag = get_rag_service()

        async for event in rag.stream_query(
            organization_id=current_user.organization_id,
            query=content,
            mode=chat.ai_mode,
        ):
            if event["type"] == "token":
                full_content += event["content"]
                data = {"type": "token", "content": event["content"]}
                yield f"data: {json.dumps(data)}\n\n"
            elif event["type"] == "citations":
                citations = event.get("citations", [])
            elif event["type"] == "done":
                ai_msg = Message(
                    chat_id=chat_id, role="assistant", content=full_content,
                    citations=citations, ai_mode=chat.ai_mode,
                )
                db.add(ai_msg)
                chat.message_count += 1
                chat.updated_at = datetime.now(timezone.utc)
                data = {"type": "done", "citations": citations}
                yield f"data: {json.dumps(data)}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
