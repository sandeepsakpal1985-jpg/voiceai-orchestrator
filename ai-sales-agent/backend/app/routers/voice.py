"""
Voice Processing Routes — STT, LLM, TTS endpoints for the voice pipeline.
"""

import base64
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.models.schemas import LLMRequest, LLMResponse, TranscriptionRequest, TranscriptionResponse, TTSRequest, TTSResponse
from app.providers import get_default_registry
from app.services.intent import get_intent_service
from app.voice import get_voice_pipeline

router = APIRouter(prefix="/voice", tags=["Voice Processing"])


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(request: TranscriptionRequest):
    try:
        audio_bytes = base64.b64decode(request.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")
    pipeline = get_voice_pipeline()
    text = await pipeline.stt.transcribe(audio_bytes, language=request.language)
    return TranscriptionResponse(text=text, provider=pipeline.stt.provider_name)


@router.post("/complete", response_model=LLMResponse)
async def llm_complete(request: LLMRequest):
    pipeline = get_voice_pipeline()
    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    response = await pipeline.llm.complete(messages, temperature=request.temperature, max_tokens=request.max_tokens)
    model_name = settings.OLLAMA_MODEL if settings.LLM_PROVIDER == "ollama" else settings.OPENAI_MODEL if settings.LLM_PROVIDER == "openai" else settings.GEMINI_MODEL if settings.LLM_PROVIDER == "gemini" else settings.OLLAMA_MODEL
    return LLMResponse(content=response, provider=pipeline.llm.provider_name, model=model_name)


@router.post("/complete/stream")
async def llm_complete_stream(request: LLMRequest):
    pipeline = get_voice_pipeline()
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    async def event_generator():
        async for chunk in pipeline.llm.complete_stream(messages, temperature=request.temperature, max_tokens=request.max_tokens):
            yield {"event": "chunk", "data": chunk}
        yield {"event": "done", "data": ""}

    return EventSourceResponse(event_generator())


@router.post("/synthesize", response_model=TTSResponse)
async def synthesize_speech(request: TTSRequest):
    pipeline = get_voice_pipeline()
    try:
        audio_bytes = await pipeline.tts.synthesize(text=request.text, voice_id=request.voice_id or settings.DEFAULT_VOICE_ID, language=request.language or settings.DEFAULT_LANGUAGE, speaking_rate=request.speaking_rate or settings.DEFAULT_SPEAKING_RATE, pitch=request.pitch or settings.DEFAULT_PITCH)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
    duration = len(request.text) * 0.15
    return TTSResponse(audio_base64=audio_base64, duration_seconds=duration, provider=pipeline.tts.provider_name)


class PipelineRequest(BaseModel):
    audio_base64: str
    conversation_id: str | None = None
    language: str = "en"
    system_prompt: str | None = None


@router.post("/process")
async def process_full_pipeline(request: PipelineRequest):
    try:
        audio_bytes = base64.b64decode(request.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")
    pipeline = get_voice_pipeline()
    return await pipeline.process_audio(audio_bytes, conversation_id=request.conversation_id, language=request.language, system_prompt=request.system_prompt)


class IntentRequest(BaseModel):
    text: str


@router.post("/intent")
async def detect_intent(request: IntentRequest):
    intent_service = get_intent_service()
    result = await intent_service.detect(request.text)
    return {"intent": result.intent, "confidence": result.confidence, "method": result.method, "top_matches": result.details}
