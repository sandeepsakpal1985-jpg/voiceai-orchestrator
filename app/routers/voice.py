"""
Voice Processing Routes — STT, LLM, TTS endpoints for the voice pipeline.
"""

import base64
import time
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.models.schemas import (
    LLMRequest,
    LLMResponse,
    TranscriptionRequest,
    TranscriptionResponse,
    TTSRequest,
    TTSResponse,
)
from app.providers import get_default_registry
from app.services.conversation import get_conversation_service
from app.services.intent import get_intent_service
from app.voice import get_voice_pipeline

router = APIRouter(prefix="/voice", tags=["Voice Processing"])


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(request: TranscriptionRequest):
    """Transcribe audio to text using the configured STT provider."""
    try:
        audio_bytes = base64.b64decode(request.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")

    pipeline = get_voice_pipeline()
    text = await pipeline.stt.transcribe(audio_bytes, language=request.language)

    return TranscriptionResponse(
        text=text,
        provider=pipeline.stt.provider_name,
    )


@router.post("/complete", response_model=LLMResponse)
async def llm_complete(request: LLMRequest):
    """Complete a conversation using the configured LLM provider."""
    pipeline = get_voice_pipeline()

    messages = [
        {"role": m.role, "content": m.content} for m in request.messages
    ]

    response = await pipeline.llm.complete(
        messages,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
    )

    return LLMResponse(
        content=response,
        provider=pipeline.llm.provider_name,
        model=settings.OLLAMA_MODEL if settings.LLM_PROVIDER == "ollama" else settings.OPENAI_MODEL,
    )


@router.post("/complete/stream")
async def llm_complete_stream(request: LLMRequest):
    """Streaming LLM completion using SSE."""
    pipeline = get_voice_pipeline()

    messages = [
        {"role": m.role, "content": m.content} for m in request.messages
    ]

    async def event_generator():
        async for chunk in pipeline.llm.complete_stream(
            messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        ):
            yield {"event": "chunk", "data": chunk}
        yield {"event": "done", "data": ""}

    return EventSourceResponse(event_generator())


@router.post("/synthesize", response_model=TTSResponse)
async def synthesize_speech(request: TTSRequest):
    """Synthesize text to speech using the configured TTS provider."""
    pipeline = get_voice_pipeline()

    try:
        audio_bytes = await pipeline.tts.synthesize(
            text=request.text,
            voice_id=request.voice_id or settings.DEFAULT_VOICE_ID,
            language=request.language or settings.DEFAULT_LANGUAGE,
            speaking_rate=request.speaking_rate or settings.DEFAULT_SPEAKING_RATE,
            pitch=request.pitch or settings.DEFAULT_PITCH,
        )
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))

    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

    # Estimate duration (rough: assume 150ms per character)
    duration = len(request.text) * 0.15

    return TTSResponse(
        audio_base64=audio_base64,
        duration_seconds=duration,
        provider=pipeline.tts.provider_name,
    )


class PipelineRequest(BaseModel):
    audio_base64: str
    conversation_id: str | None = None
    language: str = "en"
    system_prompt: str | None = None


@router.post("/process")
async def process_full_pipeline(request: PipelineRequest):
    """Process audio through the full STT → LLM pipeline.

    Accepts base64-encoded audio and returns transcription,
    LLM response, and intent analysis.
    """
    try:
        audio_bytes = base64.b64decode(request.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")

    pipeline = get_voice_pipeline()
    result = await pipeline.process_audio(
        audio_bytes,
        conversation_id=request.conversation_id,
        language=request.language,
        system_prompt=request.system_prompt,
    )

    return result


class IntentRequest(BaseModel):
    text: str


@router.post("/intent")
async def detect_intent(request: IntentRequest):
    """Detect intent from text using the configured intent service."""
    intent_service = get_intent_service()
    result = await intent_service.detect(request.text)
    return {
        "intent": result.intent,
        "confidence": result.confidence,
        "method": result.method,
        "top_matches": result.details,
    }


@router.get("/livekit-token")
async def get_livekit_token(room_name: str | None = None):
    """Generate a LiveKit access token for browser clients.

    This endpoint enables the browser voice chat widget to connect
    directly to LiveKit rooms instead of going through the WebSocket bridge.

    Args:
        room_name: Optional room name (auto-generated if not provided)

    Returns:
        JSON with token and room_name for LiveKit connection
    """
    if not settings.LIVEKIT_ENABLED:
        raise HTTPException(
            status_code=501,
            detail=(
                "LiveKit is not enabled. Set LIVEKIT_ENABLED=true and "
                "configure LIVEKIT_API_KEY and LIVEKIT_API_SECRET."
            ),
        )

    if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise HTTPException(
            status_code=500,
            detail=(
                "LiveKit API credentials not configured. "
                "Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET environment variables."
            ),
        )

    try:
        import livekit.api as lkapi

        import uuid
        room = room_name or f"voiceai-{uuid.uuid4().hex[:8]}"

        token = lkapi.AccessToken(
            settings.LIVEKIT_API_KEY,
            settings.LIVEKIT_API_SECRET,
        )
        token.identity = f"browser-{uuid.uuid4().hex[:8]}"
        token.add_grant(room_join=True, room=room)

        return {
            "token": token.to_jwt(),
            "room_name": room,
            "url": settings.LIVEKIT_URL,
        }
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="livekit-api package not installed. Run: pip install livekit-api",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate LiveKit token: {e}",
        )
