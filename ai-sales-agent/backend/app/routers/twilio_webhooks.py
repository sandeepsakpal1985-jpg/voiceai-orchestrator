"""
Twilio Webhook Orchestrator — Routes inbound/outbound calls through the voice pipeline.
"""

import asyncio
import logging
import time
from urllib.parse import urljoin

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, PlainTextResponse

from app.config import settings
from app.models.schemas import ConversationCreate, Message
from app.services.conversation import get_conversation_service, DEFAULT_SYSTEM_PROMPT
from app.voice import get_voice_pipeline

logger = logging.getLogger("ai_sales_agent.twilio")
router = APIRouter(prefix="/twilio", tags=["Twilio Webhooks"])

DEFAULT_GREETING = "Hello! Thank you for reaching out. This is your AI sales assistant speaking. How can I help you today?"
LLM_TIMEOUT_SECONDS: int = 15
_call_map: dict[str, str] = {}
_active_twilio_calls: set[str] = set()


def _escape_xml(unsafe: str) -> str:
    return unsafe.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")


def _build_twiml(message: str, gather: bool = True, hangup: bool = False, base_url: str = "") -> str:
    escaped = _escape_xml(message)
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<Response>"]
    lines.append(f'  <Say voice="alice" language="en-US">{escaped}</Say>')
    if gather and not hangup:
        gather_url = urljoin(base_url + "/", "twilio/gather") if base_url else "/twilio/gather"
        lines.append(f'  <Gather input="speech dtmf" timeout="5" speechTimeout="auto" speechModel="phone_call" action="{_escape_xml(gather_url)}" method="POST">')
        lines.append('    <Say voice="alice">Please go ahead.</Say>')
        lines.append("  </Gather>")
        fallback_url = urljoin(base_url + "/", "twilio/voice") if base_url else "/twilio/voice"
        lines.append(f'  <Redirect method="POST">{_escape_xml(fallback_url)}</Redirect>')
    if hangup:
        lines.append("  <Hangup />")
    lines.append("</Response>")
    return "\n".join(lines)


END_CALL_PHRASES = ["goodbye", "bye", "hang up", "end call", "that's all", "no thanks", "no thank you", "that is all"]


def _is_end_call(user_input: str) -> bool:
    lower = user_input.lower().strip()
    return any(lower == phrase or lower.startswith(phrase) for phrase in END_CALL_PHRASES)


@router.post("/incoming")
async def twilio_incoming(request: Request):
    form_data = await request.form()
    caller_number = form_data.get("From", "")
    called_number = form_data.get("To", "")
    call_sid = form_data.get("CallSid", "")
    logger.info("Incoming call from %s to %s (SID: %s)", caller_number, called_number, call_sid)

    conv_service = get_conversation_service()
    conv = conv_service.create(ConversationCreate(contact_phone=caller_number, contact_name=caller_number, metadata={"source": "twilio", "call_sid": call_sid}))
    _call_map[call_sid] = conv.id
    _active_twilio_calls.add(call_sid)

    greeting = DEFAULT_GREETING
    conv_service.add_message(conv.id, Message(role="agent", content=greeting, timestamp=time.time()))
    base_url = str(request.base_url).rstrip("/")
    twiml = _build_twiml(greeting, gather=True, base_url=base_url)
    return HTMLResponse(content=twiml, media_type="text/xml")


@router.post("/gather")
async def twilio_gather(request: Request):
    form_data = await request.form()
    speech_result = form_data.get("SpeechResult", "")
    call_sid = form_data.get("CallSid", "")
    digits = form_data.get("Digits", "")
    user_input = speech_result or digits or ""

    base_url = str(request.base_url).rstrip("/").removesuffix("/twilio/gather")
    conversation_id = _call_map.get(call_sid)

    if not conversation_id:
        conv_service = get_conversation_service()
        conv = conv_service.create(ConversationCreate(contact_phone=form_data.get("From", ""), contact_name="Caller", metadata={"source": "twilio", "call_sid": call_sid}))
        conversation_id = conv.id
        _call_map[call_sid] = conversation_id

    if not user_input:
        twiml = _build_twiml("I'm sorry, I didn't catch that. Could you please repeat yourself?", gather=True, base_url=base_url)
        return HTMLResponse(content=twiml, media_type="text/xml")

    if _is_end_call(user_input):
        get_conversation_service().update_status(conversation_id, "completed")
        twiml = _build_twiml("Thank you for your time! Have a wonderful day! Goodbye.", gather=False, hangup=True)
        return HTMLResponse(content=twiml, media_type="text/xml")

    try:
        result = await asyncio.wait_for(
            get_conversation_service().process_llm_turn(conversation_id=conversation_id, user_input=user_input, system_prompt=DEFAULT_SYSTEM_PROMPT, store_conversation=True),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        agent_message = result["response"]
    except asyncio.TimeoutError:
        agent_message = "I'm still thinking about that. Could you please repeat yourself?"
    except Exception:
        agent_message = "I'm sorry, I'm having trouble processing that right now. Could you please try again?"

    twiml = _build_twiml(agent_message, gather=True, base_url=base_url)
    return HTMLResponse(content=twiml, media_type="text/xml")


@router.post("/voice")
async def twilio_voice_fallback(request: Request):
    base_url = str(request.base_url).rstrip("/").removesuffix("/twilio/voice")
    twiml = _build_twiml("I didn't hear anything. Are you still there? Please say something.", gather=True, base_url=base_url)
    return HTMLResponse(content=twiml, media_type="text/xml")


@router.post("/status")
async def twilio_status(request: Request):
    form_data = await request.form()
    call_sid = form_data.get("CallSid", "")
    call_status = form_data.get("CallStatus", "")
    conversation_id = _call_map.get(call_sid)
    if conversation_id and call_status in ("completed", "failed", "busy", "no-answer"):
        get_conversation_service().update_status(conversation_id, "completed")
        _active_twilio_calls.discard(call_sid)
    return PlainTextResponse("OK")
