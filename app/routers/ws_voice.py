"""
WebSocket Voice Bridge — Real-time streaming audio processing with barge-in support.

Connects browser microphone input through the STT→LLM→TTS pipeline
and streams results back via WebSocket messages.

Integrates advanced modules for:
- Barge-in / interrupt detection (live mic monitoring during TTS playback)
- State engine (conversation state machine with emotion tracking)
- Adaptive playback (emotional pacing and context injection)

Protocol:
  Client → Server: (binary audio chunks)
  Client → Server: { "type": "text", "text": "..." }
  Client → Server: { "type": "interrupt" }  # Explicit barge-in signal
  Server → Client: { "type": "transcription", "text": "...", "is_final": bool }
  Server → Client: { "type": "response", "text": "...", "is_streaming": bool }
  Server → Client: { "type": "response_done" }
  Server → Client: { "type": "audio", "base64": "..." }  # TTS audio
  Server → Client: { "type": "sentiment", "label": "...", "score": float, "emotion": "...", "trust": int }
  Server → Client: { "type": "interrupt", "message": "Interruption detected" }
  Server → Client: { "type": "state", "state": "...", "transition_count": int }
  Server → Client: { "type": "pong" }
  Server → Client: { "type": "call_ended", "summary": {...} }
  Server → Client: { "type": "error", "message": "..." }
  Server → Client: { "type": "connected", "conversation_id": "..." }
"""

import base64
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.models.schemas import ConversationCreate, Message
from app.services.conversation import get_conversation_service, DEFAULT_SYSTEM_PROMPT
from app.services.adaptive_conversation import get_adaptive_conversation_service
from app.voice import get_voice_pipeline

logger = logging.getLogger("voiceai.ws_voice")

router = APIRouter()

WS_SYSTEM_PROMPT = (
    "You are a friendly and professional AI voice assistant. "
    "Keep responses concise and conversational. "
    "Ask relevant follow-up questions to understand the caller's needs."
)

# ── Track active WebSocket sessions for concurrent call limits ──
_active_ws_sessions: set[str] = set()

def get_active_ws_count() -> int:
    return len(_active_ws_sessions)


@router.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time voice chat with barge-in support."""
    await websocket.accept()
    logger.info("WebSocket voice client connected")

    pipeline = get_voice_pipeline()
    conv_service = get_conversation_service()
    adaptive = get_adaptive_conversation_service() if settings.ADAPTIVE_CONVERSATION_ENABLED else None

    # Create a conversation for this session
    conv = conv_service.create(
        ConversationCreate(
            contact_phone="ws_session",
            contact_name="WebSocket Caller",
            metadata={"source": "websocket_voice"},
        )
    )
    conversation_id = conv.id
    _active_ws_sessions.add(conversation_id)

    # Reset adaptive state for new conversation
    if adaptive:
        adaptive.reset()
        adaptive.conversation_state = "listening"

    # Reset advanced state engine for new conversation
    if pipeline.state_engine:
        pipeline.state_engine.reset()

    await websocket.send_json({
        "type": "connected",
        "conversation_id": conversation_id,
    })

    audio_buffer = bytearray()
    last_process_time = time.time()
    min_chunk_duration = 1.0  # seconds of audio to buffer

    # ── Helpers ───────────────────────────────────────────────────

    def build_system_content(user_text: str) -> str:
        """Build LLM system content with adaptive and advanced context injection."""
        content = WS_SYSTEM_PROMPT

        # Adaptive conversation context
        if adaptive:
            content += f"\n\nCustomer context: {adaptive.get_context_summary()}"

        # State engine context
        if pipeline.state_engine:
            content += (
                f"\nConversation state: {pipeline.state_engine.current_state}. "
                f"Transitions: {pipeline.state_engine.transition_count}."
            )

        # Adaptive playback pacing context
        if pipeline.adaptive_playback and adaptive:
            pacing = pipeline.adaptive_playback.get_prompt_context(
                adaptive.customer_state.emotion
            )
            content += f"\n{pacing}"

        return content

    async def send_sentiment_update():
        """Send sentiment and emotional state to the client."""
        payload = {}
        if adaptive:
            payload = {
                "emotion": adaptive.customer_state.emotion.value,
                "trust": adaptive.customer_state.trust,
                "patience": adaptive.customer_state.patience,
            }
        await websocket.send_json({"type": "sentiment", **payload})

    async def send_state_update():
        """Send state engine status to the client."""
        if pipeline.state_engine:
            await websocket.send_json({
                "type": "state",
                "state": pipeline.state_engine.current_state,
                "transition_count": pipeline.state_engine.transition_count,
            })

    async def stream_llm_response(user_text: str) -> str:
        """Stream LLM response to the client and return the full response."""
        system_content = build_system_content(user_text)
        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_text},
        ]

        full_response = ""
        async for chunk in pipeline.llm.complete_stream(messages):
            full_response += chunk
            await websocket.send_json({
                "type": "response",
                "text": chunk,
                "is_streaming": True,
            })

        await websocket.send_json({"type": "response_done"})
        return full_response

    async def synthesize_and_send(text: str):
        """Synthesize TTS audio and send to client."""
        if not text:
            return
        try:
            audio_bytes = await pipeline.tts.synthesize(
                text=text,
                voice_id=settings.DEFAULT_VOICE_ID,
                language=settings.DEFAULT_LANGUAGE,
            )
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            await websocket.send_json({"type": "audio", "base64": audio_b64})
        except NotImplementedError:
            logger.debug("TTS not available, skipping audio synthesis")

    # ── Handlers ──────────────────────────────────────────────────

    async def _handle_text_input(user_text: str):
        """Process text input through the shared LLM turn pipeline.

        When adaptive conversation is enabled, injects emotional
        context and tracks customer state across turns.
        When advanced state engine is enabled, tracks state transitions.
        """
        logger.debug("Received text input: %s", user_text[:50])

        # Adaptive: update customer state
        if adaptive:
            adaptive.update_customer_state(user_text)
            adaptive.add_to_history("user", user_text)

        # Advanced: process through state engine
        if pipeline.state_engine:
            pipeline.state_engine.process_input(
                transcript=user_text,
                detected_emotion=adaptive.customer_state.emotion if adaptive else None,
            )
            await send_state_update()

        # Process through shared pipeline
        result = await conv_service.process_llm_turn(
            conversation_id=conversation_id,
            user_input=user_text,
            system_prompt=WS_SYSTEM_PROMPT,
            store_conversation=True,
        )

        # Send sentiment with adaptive context
        await send_sentiment_update()

        # Stream LLM response with advanced context injection
        full_response = await stream_llm_response(user_text)

        # Adaptive: track agent response
        if adaptive:
            adaptive.add_to_history("agent", full_response)

        # Synthesize TTS
        await synthesize_and_send(full_response)

    async def _handle_audio_chunk(audio_chunk: bytes):
        """Buffer and process audio through STT when enough data accumulated.

        When adaptive conversation is enabled, injects emotional
        context and tracks customer state from audio input.
        When advanced state engine is enabled, tracks state transitions.
        """
        nonlocal audio_buffer, last_process_time
        audio_buffer.extend(audio_chunk)

        elapsed = time.time() - last_process_time
        if elapsed < min_chunk_duration or len(audio_buffer) == 0:
            return

        try:
            transcription = await pipeline.stt.transcribe(
                bytes(audio_buffer),
                language=settings.DEFAULT_LANGUAGE,
            )

            if transcription.strip():
                logger.debug("Transcription: %s", transcription[:60])

                await websocket.send_json({
                    "type": "transcription",
                    "text": transcription,
                    "is_final": True,
                })

                # Adaptive: update customer state from audio transcription
                if adaptive:
                    adaptive.update_customer_state(transcription)
                    adaptive.add_to_history("user", transcription)

                # Advanced: process through state engine
                if pipeline.state_engine:
                    pipeline.state_engine.process_input(
                        transcript=transcription,
                        detected_emotion=adaptive.customer_state.emotion if adaptive else None,
                    )
                    await send_state_update()

                # Stream LLM response with adaptive context
                full_response = await stream_llm_response(transcription)

                # Adaptive: track agent response
                if adaptive:
                    adaptive.add_to_history("agent", full_response)

                # Store in conversation service
                if full_response:
                    from app.models.schemas import Message as SchemaMessage
                    conv_service.add_message(
                        conversation_id,
                        SchemaMessage(role="user", content=transcription, timestamp=time.time()),
                    )
                    conv_service.add_message(
                        conversation_id,
                        SchemaMessage(role="agent", content=full_response, timestamp=time.time()),
                    )

                    # Sentiment analysis
                    await send_sentiment_update()

                # Synthesize TTS
                await synthesize_and_send(full_response)

        except Exception as e:
            logger.warning("STT processing error: %s", e)
            try:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Speech recognition error: {str(e)}",
                })
            except Exception:
                pass

        # Reset buffer with small overlap for context
        overlap = max(len(audio_buffer) - 32000, 0)  # ~2s at 16kHz
        if overlap > 0:
            audio_buffer = audio_buffer[-overlap:]
        else:
            audio_buffer.clear()
        last_process_time = time.time()

    async def _handle_interrupt():
        """Handle an explicit barge-in / interrupt signal from the client.

        When interrupt detection is enabled, clears the interrupt flag
        and updates the state engine with a recovery flow.
        """
        logger.info("🚨 Client signaled interrupt (barge-in)")

        # Signal the adaptive service
        if adaptive:
            adaptive.signal_interruption()

        # Signal the advanced interrupt detector
        if pipeline.interrupt_detector:
            pipeline.interrupt_detector.signal_interrupt()

        # Update state engine
        if pipeline.state_engine:
            pipeline.state_engine.transition_to(
                "INTERRUPTED",
                trigger="interrupt",
                metadata={"source": "websocket_barge_in"},
            )
            await send_state_update()

        # Notify client
        await websocket.send_json({
            "type": "interrupt",
            "message": "Interruption detected, recovery flow ready",
        })

    # ── Main Loop ─────────────────────────────────────────────────

    try:
        while True:
            raw = await websocket.receive()

            if "text" in raw:
                message = json.loads(raw["text"])

                if message.get("type") == "text":
                    await _handle_text_input(message["text"])

                elif message.get("type") == "interrupt":
                    await _handle_interrupt()

                elif message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})

                elif message.get("type") == "end_call":
                    conv_service.update_status(conversation_id, "completed")
                    summary = conv_service.generate_summary(conversation_id)
                    await websocket.send_json({
                        "type": "call_ended",
                        "summary": summary,
                    })
                    break

            elif "bytes" in raw:
                await _handle_audio_chunk(raw["bytes"])

    except WebSocketDisconnect:
        logger.info("WebSocket voice client disconnected")
    except Exception:
        logger.exception("WebSocket voice error")
        try:
            await websocket.send_json({
                "type": "error",
                "message": "Internal error occurred",
            })
        except Exception:
            pass
    finally:
        _active_ws_sessions.discard(conversation_id)
        conv_service.update_status(conversation_id, "completed")
        logger.info("Voice session ended: %s", conversation_id)
