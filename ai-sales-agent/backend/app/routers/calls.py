"""
Call Routes — Initiate, manage, and end calls with AI agents.
"""

import time
from fastapi import APIRouter, HTTPException

from app.models.schemas import CallRequest, CallResponse, CallActionRequest, ConversationCreate, Message
from app.services.conversation import get_conversation_service, DEFAULT_SYSTEM_PROMPT
from app.voice import get_voice_pipeline

router = APIRouter(prefix="/calls", tags=["Calls"])


@router.post("", response_model=CallResponse, status_code=201)
async def initiate_call(request: CallRequest):
    conv_service = get_conversation_service()
    conv = conv_service.create(ConversationCreate(contact_name=request.contact_name, contact_phone=request.to, campaign_id=request.campaign_id, metadata={**request.metadata, "from": request.from_, "voice_id": request.voice_id, "language": request.language or "en"}))
    pipeline = get_voice_pipeline()
    system_prompt = request.prompt or f"You are a friendly AI sales assistant calling {request.contact_name or 'the customer'}. Introduce yourself briefly and ask how you can help."
    greeting_messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": "Start the conversation with a greeting."}]
    try:
        greeting = await pipeline.llm.complete(greeting_messages, temperature=0.7, max_tokens=100)
    except Exception:
        greeting = f"Hello{' ' + request.contact_name if request.contact_name else ''}! Thank you for your time. How can I help you today?"
    conv_service.add_message(conv.id, Message(role="agent", content=greeting, timestamp=time.time()))
    return CallResponse(call_id=f"call_{conv.id}", conversation_id=conv.id, status=conv.status, message=greeting)


@router.post("/{conversation_id}/action")
async def call_action(conversation_id: str, request: CallActionRequest):
    conv_service = get_conversation_service()
    conv = conv_service.get(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if request.action == "process_input":
        if not request.user_input:
            raise HTTPException(status_code=400, detail="user_input required")
        result = await conv_service.process_llm_turn(conversation_id=conversation_id, user_input=request.user_input, system_prompt=DEFAULT_SYSTEM_PROMPT, store_conversation=True)
        return {**result, "action": "processed"}
    elif request.action == "end":
        conv_service.update_status(conversation_id, "completed")
        return {"conversation_id": conversation_id, "action": "ended", "summary": conv_service.generate_summary(conversation_id)}
    raise HTTPException(status_code=400, detail=f"Unknown action: {request.action}")
