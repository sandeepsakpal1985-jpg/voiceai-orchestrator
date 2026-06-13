"""
WebSocket Voice Bridge — Real-time streaming audio processing with barge-in support.
Connects browser microphone input through the STT->LLM->TTS pipeline.
"""

import base64
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.models.schemas import ConversationCreate, Message
from app.services.conversation import get_conversation_service
from app.voice import get_voice_pipeline

logger = logging.getLogger("ai_sales_agent.ws_voice")
router = APIRouter()

WS_SYSTEM_PROMPT = "You are a friendly and professional AI sales assistant. Keep responses concise and conversational. Ask relevant follow-up questions to understand the caller's needs."

_active_ws_sessions: set[str] = set()


@router.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time voice chat."""
    await websocket.accept()
    logger.info("WebSocket voice client connected")

    pipeline = get_voice_pipeline()
    conv_service = get_conversation_service()

    conv = conv_service.create(ConversationCreate(contact_phone="ws_session", contact_name="WebSocket Caller", metadata={"source": "websocket_voice"}))
    conversation_id = conv.id
    _active_ws_sessions.add(conversation_id)

    await websocket.send_json({"type": "connected", "conversation_id": conversation_id})

    audio_buffer = bytearray()

    async def stream_llm_response(user_text: str) -> str:
        messages = [{"role": "system", "content": WS_SYSTEM_PROMPT}, {"role": "user", "content": user_text}]
        full_response = ""
        async for chunk in pipeline.llm.complete_stream(messages):
            full_response += chunk
            await websocket.send_json({"type": "response", "text": chunk, "is_streaming": True})
        await websocket.send_json({"type": "response_done"})
        return full_response

    async def synthesize_and_send(text: str):
        if not text:
            return
        try:
            audio_bytes = await pipeline.tts.synthesize(text=text, voice_id=settings.DEFAULT_VOICE_ID, language=settings.DEFAULT_LANGUAGE)
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            await websocket.send_json({"type": "audio", "base64": audio_b64})
        except NotImplementedError:
            pass

    try:
        while True:
            raw = await websocket.receive()
            if "text" in raw:
                message = json.loads(raw["text"])
                if message.get("type") == "text":
                    full_response = await stream_llm_response(message["text"])
                    conv_service.add_message(conversation_id, Message(role="user", content=message["text"]))
                    conv_service.add_message(conversation_id, Message(role="agent", content=full_response))
                    await synthesize_and_send(full_response)
                elif message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif message.get("type") == "end_call":
                    conv_service.update_status(conversation_id, "completed")
                    summary = conv_service.generate_summary(conversation_id)
                    await websocket.send_json({"type": "call_ended", "summary": summary})
                    break

            elif "bytes" in raw:
                audio_buffer.extend(raw["bytes"])
                # Process audio immediately (browser sends complete WAV at once)
                try:
                    if len(audio_buffer) < 8000:
                        # Too small to be speech
                        await websocket.send_json({"type": "error", "message": "Audio too short. Please speak for at least half a second."})
                        audio_buffer.clear()
                        continue
                    transcription = await pipeline.stt.transcribe(bytes(audio_buffer), language=settings.DEFAULT_LANGUAGE)
                    if transcription.strip():
                        await websocket.send_json({"type": "transcription", "text": transcription, "is_final": True})
                        full_response = await stream_llm_response(transcription)
                        conv_service.add_message(conversation_id, Message(role="user", content=transcription))
                        conv_service.add_message(conversation_id, Message(role="agent", content=full_response))
                        await synthesize_and_send(full_response)
                    else:
                        await websocket.send_json({"type": "error", "message": "No speech detected. Please speak clearly."})
                except Exception as e:
                    logger.warning("STT error: %s", e)
                    await websocket.send_json({"type": "error", "message": f"Speech recognition failed. Try speaking more clearly or typing instead."})
                audio_buffer.clear()

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception:
        logger.exception("WebSocket error")
    finally:
        _active_ws_sessions.discard(conversation_id)
        conv_service.update_status(conversation_id, "completed")
