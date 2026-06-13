"""
Twilio Webhook Orchestrator — Routes inbound/outbound calls through the voice pipeline.

Handles Twilio's webhook lifecycle:
  1. /twilio/incoming  → Initial call, generates TwiML greeting + <Gather>
  2. /twilio/gather    → Speech input from caller, processes through pipeline
  3. /twilio/voice     → Fallback when <Gather> times out
  4. /twilio/status    → Call status callbacks (completed, failed, etc.)
  5. /twilio/outbound  → Generates TwiML for outbound calls

Architecture:
  - Routes speech through the shared voice pipeline (process_llm_turn)
  - Returns TwiML with <Say> for audible responses
  - Uses proper URL joining for callback routes
"""

import asyncio
import logging
import time
from urllib.parse import urljoin

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, PlainTextResponse
from twilio.rest import Client

from app.config import settings
from app.models.schemas import ConversationCreate, Message
from app.services.conversation import get_conversation_service, DEFAULT_SYSTEM_PROMPT
from app.voice import get_voice_pipeline

logger = logging.getLogger("voiceai.twilio_webhooks")

router = APIRouter(prefix="/twilio", tags=["Twilio Webhooks"])

# ── Constants ────────────────────────────────────────────────────────

# Static greeting avoids LLM cold-start latency on first Twilio call
DEFAULT_GREETING = (
    "Hello! Thank you for reaching out. "
    "This is your AI voice assistant speaking. How can I help you today?"
)

# Maximum time to wait for an LLM response before falling back
LLM_TIMEOUT_SECONDS: int = 15

# ── In-memory call → conversation mapping ──
_call_map: dict[str, str] = {}  # call_sid → conversation_id
# ── Track active Twilio calls for concurrent call limits ──
_active_twilio_calls: set[str] = set()


def get_active_twilio_call_count() -> int:
    return len(_active_twilio_calls)


def _escape_xml(unsafe: str) -> str:
    """Escape special XML characters for TwiML output."""
    return (
        unsafe.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _build_twiml(
    message: str,
    gather: bool = True,
    hangup: bool = False,
    base_url: str = "",
) -> str:
    """Build a TwiML response.

    Args:
        message: The text the agent should speak
        gather: Whether to include a <Gather> for further input
        hangup: Whether to end the call after the message
        base_url: Public base URL for the gather callback
    """
    escaped = _escape_xml(message)
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<Response>"]

    lines.append(f'  <Say voice="alice" language="en-US">{escaped}</Say>')

    if gather and not hangup:
        gather_url = urljoin(base_url + "/", "twilio/gather") if base_url else "/twilio/gather"
        lines.append(
            f'  <Gather input="speech dtmf" timeout="5" speechTimeout="auto"'
            f' speechModel="phone_call" action="{_escape_xml(gather_url)}" method="POST">'
        )
        lines.append('    <Say voice="alice">Please go ahead.</Say>')
        lines.append("  </Gather>")
        fallback_url = urljoin(base_url + "/", "twilio/voice") if base_url else "/twilio/voice"
        lines.append(
            f'  <Redirect method="POST">{_escape_xml(fallback_url)}</Redirect>'
        )

    if hangup:
        lines.append("  <Hangup />")

    lines.append("</Response>")
    return "\n".join(lines)


def _generate_system_prompt(contact_name: str | None = None) -> str:
    """Generate an appropriate system prompt for Twilio calls."""
    name_context = f" You are speaking with {contact_name}." if contact_name else ""
    return (
        f"You are a friendly and professional AI voice assistant handling a phone call.{name_context} "
        f"Keep responses concise, natural, and conversational. "
        f"Ask relevant follow-up questions to understand the caller's needs. "
        f"If the caller wants to end the call, wish them a good day and hang up. "
        f"Never mention that you are an AI or that this is a demo."
    )


END_CALL_PHRASES = [
    "goodbye", "bye", "hang up", "end call",
    "that's all", "no thanks", "no thank you",
    "that is all", "no more",
]


def _is_end_call(user_input: str) -> bool:
    """Check if the user input signals intent to end the call."""
    lower = user_input.lower().strip()
    return any(lower == phrase or lower.startswith(phrase) for phrase in END_CALL_PHRASES)


# ── Webhook Handlers ──


@router.post("/incoming")
async def twilio_incoming(request: Request):
    """Handle incoming Twilio voice calls.

    Twilio POSTs here when a call is received.
    Returns TwiML that greets the caller and begins gathering speech input.
    """
    form_data = await request.form()
    caller_number = form_data.get("From", "")
    called_number = form_data.get("To", "")
    call_sid = form_data.get("CallSid", "")
    call_status = form_data.get("CallStatus", "")

    logger.info(
        "📞 Incoming Twilio call — from: %s to: %s (SID: %s, status: %s)",
        caller_number, called_number, call_sid, call_status,
    )

    conv_service = get_conversation_service()
    conv = conv_service.create(
        ConversationCreate(
            contact_phone=caller_number,
            contact_name=caller_number,
            metadata={
                "source": "twilio",
                "call_sid": call_sid,
                "called_number": called_number,
            },
        )
    )
    _call_map[call_sid] = conv.id
    _active_twilio_calls.add(call_sid)

    base_url = str(request.base_url).rstrip("/")
    pipeline = get_voice_pipeline()
    system_prompt = _generate_system_prompt(caller_number)
    greeting_messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                "Start the conversation with a warm, professional greeting. "
                "Introduce yourself briefly and ask how you can help today. "
                "Keep it under 2 sentences."
            ),
        },
    ]

    # Use static greeting for fast response (avoids Ollama CPU latency on cold start)
    greeting = DEFAULT_GREETING

    conv_service.add_message(
        conv.id,
        Message(role="agent", content=greeting, timestamp=time.time()),
    )

    twiml = _build_twiml(greeting, gather=True, base_url=base_url)
    return HTMLResponse(content=twiml, media_type="text/xml")


@router.post("/gather")
async def twilio_gather(request: Request):
    """Handle gathered speech input from the caller."""
    form_data = await request.form()
    speech_result = form_data.get("SpeechResult", "")
    caller_number = form_data.get("From", "")
    call_sid = form_data.get("CallSid", "")
    digits = form_data.get("Digits", "")

    user_input = speech_result or digits or ""

    logger.info(
        "🗣️ Twilio gather — from: %s input: '%s' (SID: %s)",
        caller_number, user_input[:60], call_sid,
    )

    # Use proper URL joining for callback base URL
    base_url = str(request.base_url).rstrip("/")
    # Remove trailing /twilio/gather to get root
    base_url = base_url.removesuffix("/twilio/gather")

    conversation_id = _call_map.get(call_sid)
    if not conversation_id:
        logger.warning("No conversation found for CallSid: %s", call_sid)
        conv_service = get_conversation_service()
        conv = conv_service.create(
            ConversationCreate(
                contact_phone=caller_number,
                contact_name="Caller",
                metadata={"source": "twilio", "call_sid": call_sid},
            )
        )
        conversation_id = conv.id
        _call_map[call_sid] = conversation_id
        _active_twilio_calls.add(call_sid)

    if not user_input:
        twiml = _build_twiml(
            "I'm sorry, I didn't catch that. Could you please repeat yourself?",
            gather=True, base_url=base_url,
        )
        return HTMLResponse(content=twiml, media_type="text/xml")

    if _is_end_call(user_input):
        conv_service = get_conversation_service()
        conv_service.update_status(conversation_id, "completed")
        twiml = _build_twiml(
            "Thank you for your time! It was great speaking with you. "
            "Have a wonderful day! Goodbye.",
            gather=False, hangup=True,
        )
        return HTMLResponse(content=twiml, media_type="text/xml")

    # Process through shared pipeline with timeout
    try:
        conv_service = get_conversation_service()
        result = await asyncio.wait_for(
            conv_service.process_llm_turn(
                conversation_id=conversation_id,
                user_input=user_input,
                system_prompt=DEFAULT_SYSTEM_PROMPT,
                store_conversation=True,
            ),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        agent_message = result["response"]
    except asyncio.TimeoutError:
        logger.warning("LLM timeout for call %s — using fallback response", call_sid)
        agent_message = (
            "I'm still thinking about that. Could you please repeat yourself?"
        )
    except Exception:
        logger.exception("Pipeline processing error for call %s", call_sid)
        agent_message = (
            "I'm sorry, I'm having trouble processing that right now. "
            "Could you please try again?"
        )

    twiml = _build_twiml(agent_message, gather=True, base_url=base_url)
    return HTMLResponse(content=twiml, media_type="text/xml")


@router.post("/voice")
async def twilio_voice_fallback(request: Request):
    """Fallback handler when <Gather> times out without input."""
    form_data = await request.form()
    caller_number = form_data.get("From", "")
    call_sid = form_data.get("CallSid", "")

    logger.info(
        "🔊 Voice redirect (no input) — from: %s (SID: %s)",
        caller_number, call_sid,
    )

    base_url = str(request.base_url).rstrip("/")
    base_url = base_url.removesuffix("/twilio/voice")

    twiml = _build_twiml(
        "I didn't hear anything. Are you still there? "
        "Please say something or I'll have to end this call.",
        gather=True, base_url=base_url,
    )
    return HTMLResponse(content=twiml, media_type="text/xml")


@router.post("/status")
async def twilio_status(request: Request):
    """Handle call status callbacks from Twilio."""
    form_data = await request.form()
    call_sid = form_data.get("CallSid", "")
    call_status = form_data.get("CallStatus", "")

    logger.info(
        "📊 Twilio status — SID: %s status: %s",
        call_sid, call_status,
    )

    conversation_id = _call_map.get(call_sid)
    if conversation_id:
        conv_service = get_conversation_service()
        if call_status in ("completed", "failed", "busy", "no-answer"):
            conv_service.update_status(conversation_id, "completed")
            _active_twilio_calls.discard(call_sid)
            logger.info("Call %s completed — conversation: %s", call_sid, conversation_id)

    return PlainTextResponse("OK")


@router.post("/outbound")
async def initiate_outbound_call(
    to: str = Form(...),
    message: str = Form(""),
    contact_name: str | None = Form(None),
):
    """Initiate an outbound call via Twilio.

    Generates TwiML for use with Twilio's REST API /Calls resource.
    """
    conv_service = get_conversation_service()
    conv = conv_service.create(
        ConversationCreate(
            contact_phone=to,
            contact_name=contact_name or to,
            metadata={
                "source": "twilio_outbound",
                "direction": "outbound",
            },
        )
    )

    if message:
        greeting = message
    else:
        pipeline = get_voice_pipeline()
        system_prompt = _generate_system_prompt(contact_name)
        greeting_messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    f"You are calling {contact_name or 'the customer'}. "
                    f"Start the call with a friendly greeting and state the purpose of your call briefly."
                ),
            },
        ]
        try:
            greeting = await pipeline.llm.complete(
                greeting_messages, temperature=0.7, max_tokens=100
            )
        except Exception:
            greeting = (
                f"Hello{ ' ' + contact_name if contact_name else ''}! "
                f"This is your AI voice assistant calling. How are you today?"
            )

    conv_service.add_message(
        conv.id,
        Message(role="agent", content=greeting, timestamp=time.time()),
    )

    base_url = f"{settings.HOST}:{settings.PORT}"
    twiml = _build_twiml(greeting, gather=True, base_url=f"http://{base_url}")

    return {
        "conversation_id": conv.id,
        "greeting": greeting,
        "twiml_url": f"http://{base_url}/twilio/incoming",
        "twiml": twiml,
    }


# ── SMS → Voice Callback Demo ────────────────────────────────────────


@router.post("/sms")
async def twilio_sms_webhook(request: Request):
    """Handle incoming SMS and trigger a voice call back to the sender.

    Flow:
      1. User texts the Twilio number
      2. Twilio POSTs here with the message
      3. We process the text through the LLM
      4. We initiate a Twilio call back to the sender
      5. When they answer, /twilio/sms-voice speaks the AI response

    Configure in Twilio Console:
      Phone Number → Messaging → A message comes in → https://your-domain.com/twilio/sms
    """
    form_data = await request.form()
    from_number = form_data.get("From", "")
    body = form_data.get("Body", "")
    sms_sid = form_data.get("SmsSid", "")

    logger.info(
        "📱 SMS received — from: %s, body: '%s' (SID: %s)",
        from_number, body[:80], sms_sid,
    )

    if not from_number or not body:
        return PlainTextResponse("OK")

    # Create a conversation for this SMS exchange
    conv_service = get_conversation_service()
    conv = conv_service.create(
        ConversationCreate(
            contact_phone=from_number,
            contact_name=from_number,
            metadata={
                "source": "twilio_sms",
                "sms_sid": sms_sid,
            },
        )
    )

    # Store the mapping so the voice callback can find this conversation
    # (via conv_id query param in the TwiML URL)

    # Get the public base URL for Twilio to call back to
    base_url = str(request.base_url).rstrip("/")

    # Process the SMS text through LLM
    user_sms_prompt = (
        "You are a helpful AI assistant. A user sent you a text message. "
        "Respond in a concise, friendly, conversational way suitable for "
        "being read aloud over a phone call. Keep it under 3 sentences. "
        "Start with a brief greeting, answer their question or acknowledge "
        "their message, and ask if there's anything else you can help with."
    )

    try:
        result = await asyncio.wait_for(
            conv_service.process_llm_turn(
                conversation_id=conv.id,
                user_input=body,
                system_prompt=user_sms_prompt,
                store_conversation=True,
            ),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        agent_message = result["response"]
    except asyncio.TimeoutError:
        agent_message = (
            "Thanks for your message! Give me a moment while I think about that. "
            "I'll call you right back."
        )
    except Exception:
        logger.exception("LLM processing error for SMS from %s", from_number)
        agent_message = (
            "Thanks for reaching out! I'm having trouble processing your message "
            "right now, but let me call you back so we can chat."
        )

    # Initiate a Twilio call back to the sender
    # The TwiML URL includes the conversation_id so sms-voice can look up the response
    twilio_account_sid = settings.TWILIO_ACCOUNT_SID
    twilio_auth_token = settings.TWILIO_AUTH_TOKEN
    twilio_phone = settings.TWILIO_PHONE_NUMBER

    call_initiated = False
    call_sid_out = None
    if twilio_account_sid and twilio_auth_token and twilio_phone:
        try:
            client = Client(twilio_account_sid, twilio_auth_token)

            # Build the TwiML URL with conversation_id as query param
            voice_url = urljoin(base_url + "/", f"twilio/sms-voice?conv_id={conv.id}")

            twilio_call = client.calls.create(
                to=from_number,
                from_=twilio_phone,
                url=voice_url,
                status_callback=urljoin(base_url + "/", "twilio/status"),
                status_callback_event=["completed", "failed", "busy", "no-answer"],
                timeout=30,
            )
            call_sid_out = twilio_call.sid
            call_initiated = True
            logger.info(
                "📞 Outbound call initiated — to: %s (SID: %s, conv: %s)",
                from_number, call_sid_out, conv.id,
            )

            # Store the call mapping for status callbacks
            _call_map[call_sid_out] = conv.id
            _active_twilio_calls.add(call_sid_out)
        except Exception as e:
            logger.error("Failed to initiate call back to %s: %s", from_number, e)
    else:
        logger.warning(
            "Twilio credentials not fully configured — cannot initiate call back. "
            "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
        )

    # Return TwiML that acknowledges the SMS (Twilio expects a response)
    if call_initiated:
        sms_reply_body = (
            f"Thanks for texting! I'll give you a call right back at {from_number}. "
            f"Please pick up to hear my response. 🙌"
        )
    else:
        sms_reply_body = (
            "Thanks for your message! I'm processing it now. "
            "I'll get back to you shortly."
        )

    twiml = _build_sms_twiml(sms_reply_body)
    return HTMLResponse(content=twiml, media_type="text/xml")


@router.api_route("/sms-voice", methods=["GET", "POST"])
async def twilio_sms_voice(request: Request):
    """Serve TwiML for the SMS-triggered voice callback.

    Called by Twilio when the user answers the outbound call.
    Looks up the AI response from the conversation and speaks it aloud.
    Then gathers further speech for a natural continued conversation.
    """
    conv_id = request.query_params.get("conv_id", "")
    form_data = {}
    call_sid = ""
    from_number = ""

    if request.method == "POST":
        form_data = await request.form()
        call_sid = form_data.get("CallSid", "")
        from_number = form_data.get("From", "")
    else:
        call_sid = request.query_params.get("CallSid", "")
        from_number = request.query_params.get("From", "")

    logger.info(
        "🔊 SMS-voice callback — conv: %s, call: %s, from: %s",
        conv_id, call_sid, from_number,
    )

    # Look up the conversation to get the AI response
    conv_service = get_conversation_service()
    response_text = DEFAULT_GREETING

    if conv_id:
        conv = conv_service.get(conv_id)
        if conv and conv.messages:
            # Find the last agent message
            for msg in reversed(conv.messages):
                if msg.role == "agent":
                    response_text = msg.content
                    break

    base_url = str(request.base_url).rstrip("/")
    # Build the TwiML: speak the response, then gather for more input
    twiml = _build_twiml(response_text, gather=True, base_url=base_url)
    return HTMLResponse(content=twiml, media_type="text/xml")


def _build_sms_twiml(message: str) -> str:
    """Build a TwiML response for SMS webhook acknowledgment."""
    escaped = _escape_xml(message)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        f"<Message>{escaped}</Message>"
        "</Response>"
    )
