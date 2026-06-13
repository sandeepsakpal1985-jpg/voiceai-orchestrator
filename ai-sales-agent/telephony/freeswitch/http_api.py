"""
FreeSWITCH HTTP API — REST endpoints for FreeSWITCH dialplan curl integration.

Provides an alternative integration path where FreeSWITCH dialplan
uses HTTP/curl to interact with the AI pipeline instead of ESL.

Endpoints:
  POST /fs/incoming     — Inbound call webhook (dialplan curl)
  POST /fs/process      — Process audio and return TTS audio
  POST /fs/gather       — Gather speech input from caller
  GET  /fs/health       — Integration health check

This complements the ESL-based bridge for simpler setups.
"""

import base64
import json
import logging
import os
import time
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.config import settings
from app.models.schemas import ConversationCreate, Message
from app.services.conversation import get_conversation_service
from app.voice import get_voice_pipeline

from .config import get_freeswitch_settings

logger = logging.getLogger("ai_sales_agent.freeswitch.http")

router = APIRouter(prefix="/fs", tags=["FreeSWITCH Integration"])

# In-memory call state tracking for HTTP mode
_call_state: dict[str, dict] = {}

FS_SYSTEM_PROMPT = (
    "You are a friendly and professional AI sales assistant on a phone call. "
    "Keep responses concise and conversational, suitable for a voice call. "
    "Speak naturally and ask relevant follow-up questions. "
    "Responses should be under 100 words unless complex."
)


class FsIncomingRequest(BaseModel):
    """Incoming call notification from FreeSWITCH dialplan."""
    call_uuid: str = Field(..., description="FreeSWITCH call UUID")
    caller_number: str = Field(default="", description="Caller's phone number")
    called_number: str = Field(default="", description="Called number/DID")
    sip_call_id: str = Field(default="", description="SIP Call-ID")


class FsProcessRequest(BaseModel):
    """Request to process audio through the AI pipeline."""
    call_uuid: str
    audio_base64: str = Field(..., description="WAV audio as base64 string")
    conversation_id: str = ""


class FsProcessResponse(BaseModel):
    """Response with AI-processed TTS audio."""
    audio_base64: str = ""
    transcription: str = ""
    response: str = ""
    conversation_id: str = ""
    end_call: bool = False


class FsOutboundRequest(BaseModel):
    """Request to initiate an outbound call."""
    to_number: str = Field(..., min_length=5, description="Destination phone number")
    from_number: str | None = Field(default=None, description="Source/caller ID number")
    prompt: str | None = Field(default=None, description="Optional custom greeting")


class FsOutboundResponse(BaseModel):
    """Response with outbound call details."""
    call_uuid: str = ""
    conversation_id: str = ""
    status: str = "initiated"
    message: str = ""


# ── Endpoints ───────────────────────────────────────────────────────


@router.post("/incoming")
async def freeswitch_incoming(request: FsIncomingRequest):
    """Handle an incoming call notification from FreeSWITCH dialplan.

    Called via curl from the FreeSWITCH dialplan when a call arrives.
    Creates a conversation session and returns a greeting.
    """
    call_uuid = request.call_uuid
    caller_number = request.caller_number

    logger.info(
        "[CALL RECEIVED] FS HTTP: Incoming call %s from %s",
        call_uuid, caller_number,
    )

    # Create conversation
    conv_service = get_conversation_service()
    conv = conv_service.create(
        ConversationCreate(
            contact_phone=caller_number,
            contact_name=caller_number,
            metadata={
                "source": "freeswitch_http",
                "call_uuid": call_uuid,
                "sip_call_id": request.sip_call_id,
            },
        )
    )

    # Track call state
    _call_state[call_uuid] = {
        "conversation_id": conv.id,
        "caller_number": caller_number,
        "called_number": request.called_number,
        "turn_count": 0,
        "started_at": time.time(),
        "ended_at": None,
    }

    # Generate and store greeting
    fs_settings = get_freeswitch_settings()
    greeting = fs_settings.FREESWITCH_GREETING
    conv_service.add_message(
        conv.id,
        Message(role="agent", content=greeting, timestamp=time.time()),
    )

    return JSONResponse({
        "conversation_id": conv.id,
        "greeting": greeting,
        "action": "play_greeting",
    })


@router.post("/process", response_model=FsProcessResponse)
async def freeswitch_process(request: FsProcessRequest):
    """Process audio through the AI voice pipeline.

    Accepts recorded audio from FreeSWITCH, runs it through
    STT → LLM → TTS, and returns the TTS audio as base64.

    FreeSWITCH dialplan calls this after recording the caller's speech.
    """
    call_uuid = request.call_uuid
    call = _call_state.get(call_uuid)

    if not call:
        raise HTTPException(
            status_code=404,
            detail=f"Call {call_uuid} not found. Call /fs/incoming first.",
        )

    conversation_id = call.get("conversation_id", "") or request.conversation_id

    if not conversation_id:
        raise HTTPException(
            status_code=400,
            detail="No conversation_id for this call",
        )

    try:
        audio_bytes = base64.b64decode(request.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")

    if len(audio_bytes) < 100:
        return FsProcessResponse(
            transcription="",
            response="",
            conversation_id=conversation_id,
            end_call=False,
        )

    # Process through pipeline
    pipeline = get_voice_pipeline()
    conv_service = get_conversation_service()

    # 1. STT
    logger.info("[STT START] FS call %s: Transcribing %d bytes...", call_uuid, len(audio_bytes))
    transcription = await pipeline.stt.transcribe(
        audio_bytes, language=settings.DEFAULT_LANGUAGE,
    )
    logger.info("[STT COMPLETE] FS call %s: Transcribed: '%s'", call_uuid, transcription[:80])

    if not transcription.strip():
        return FsProcessResponse(
            transcription="",
            response="I'm sorry, I didn't catch that. Could you please repeat yourself?",
            conversation_id=conversation_id,
            end_call=False,
        )

    # Check for end-call
    if _is_end_call(transcription):
        conv_service.add_message(
            conversation_id,
            Message(role="user", content=transcription, timestamp=time.time()),
        )
        farewell = "Thank you for your time! Have a wonderful day! Goodbye."
        conv_service.add_message(
            conversation_id,
            Message(role="agent", content=farewell, timestamp=time.time()),
        )
        conv_service.update_status(conversation_id, "completed")
        return FsProcessResponse(
            transcription=transcription,
            response=farewell,
            conversation_id=conversation_id,
            end_call=True,
        )

    # 3. Store user message
    conv_service.add_message(
        conversation_id,
        Message(role="user", content=transcription, timestamp=time.time()),
    )

    # 4. LLM
    logger.info("[LLM START] FS call %s: Processing through LLM...", call_uuid)
    messages = pipeline.build_messages(
        transcription,
        conversation_id=conversation_id,
        system_prompt=FS_SYSTEM_PROMPT,
    )
    response_text = await pipeline.llm.complete(messages)
    logger.info("[LLM COMPLETE] FS call %s: LLM response (%d chars)", call_uuid, len(response_text))

    # 5. Store agent message
    conv_service.add_message(
        conversation_id,
        Message(role="agent", content=response_text, timestamp=time.time()),
    )
    call["turn_count"] = call.get("turn_count", 0) + 1

    # 6. TTS
    logger.info("[TTS START] FS call %s: Synthesizing response...", call_uuid)
    audio_bytes = await pipeline.synthesize_response(
        response_text,
        voice_id=settings.DEFAULT_VOICE_ID,
        language=settings.DEFAULT_LANGUAGE,
    )
    logger.info("[TTS COMPLETE] FS call %s: Synthesized %d bytes", call_uuid, len(audio_bytes) if audio_bytes else 0)
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8") if audio_bytes else ""
    logger.info("[AUDIO PLAYBACK] FS call %s: Audio returned to FreeSWITCH (%d base64 chars)", call_uuid, len(audio_b64))

    return FsProcessResponse(
        audio_base64=audio_b64,
        transcription=transcription,
        response=response_text,
        conversation_id=conversation_id,
        end_call=False,
    )


@router.post("/hangup")
async def freeswitch_hangup(request: Request):
    """Handle call hangup notification from FreeSWITCH."""
    body = await request.json() if request.headers.get("content-type") == "application/json" else {}
    call_uuid = body.get("call_uuid", "")
    call = _call_state.pop(call_uuid, None)

    if call:
        conv_id = call.get("conversation_id", "")
        if conv_id:
            get_conversation_service().update_status(conv_id, "completed")
        logger.info("[CALL ENDED] FS call %s: Hangup, conversation %s completed", call_uuid, conv_id)

    return JSONResponse({"status": "ok"})


@router.post("/outbound", response_model=FsOutboundResponse)
async def freeswitch_outbound(request: FsOutboundRequest):
    """Initiate an outbound call through the FreeSWITCH ESL bridge.

    Uses the bridge service's ESL connection to originate a call
    to the specified number. When answered, the AI pipeline will
    handle the conversation.

    Requires the ESL bridge to be connected (FREESWITCH_BRIDGE_ENABLED=true
    and FreeSWITCH ESL running). Falls back to an error if ESL is down.
    """
    from .bridge_service import get_freeswitch_bridge

    bridge = get_freeswitch_bridge()

    if not bridge.esl_connected:
        return FsOutboundResponse(
            status="error",
            message="FreeSWITCH ESL bridge is not connected. "
                    "Ensure FreeSWITCH is running and FREESWITCH_BRIDGE_ENABLED=true.",
        )

    try:
        call_uuid = await bridge.initiate_outbound_call(
            to_number=request.to_number,
            from_number=request.from_number,
        )

        logger.info(
            "Outbound call initiated via API: %s -> %s (UUID: %s)",
            request.from_number or "default", request.to_number, call_uuid,
        )

        return FsOutboundResponse(
            call_uuid=call_uuid,
            conversation_id="",  # Assigned when call is answered
            status="initiated",
            message=f"Call initiated to {request.to_number} (UUID: {call_uuid}).",
        )

    except Exception as exc:
        logger.exception("Failed to initiate outbound call to %s", request.to_number)
        return FsOutboundResponse(
            status="error",
            message=f"Failed to initiate call: {exc}",
        )


@router.get("/health")
async def freeswitch_health():
    """Health check for the FreeSWITCH HTTP integration."""
    return JSONResponse({
        "status": "ok",
        "active_calls": len(_call_state),
        "calls": [
            {
                "call_uuid": uuid,
                "conversation_id": c.get("conversation_id", ""),
                "caller": c.get("caller_number", ""),
                "turns": c.get("turn_count", 0),
                "active": c.get("ended_at") is None,
            }
            for uuid, c in _call_state.items()
        ],
    })


# ── Helpers ─────────────────────────────────────────────────────────


def _is_end_call(text: str) -> bool:
    """Check if the caller wants to end the call."""
    lower = text.lower().strip()
    end_phrases = [
        "goodbye", "bye", "hang up", "end call",
        "that's all", "no thanks", "no thank you",
        "that is all", "have a good day",
    ]
    return any(
        lower == phrase or lower.startswith(phrase)
        for phrase in end_phrases
    )
