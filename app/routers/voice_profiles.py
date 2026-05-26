"""Voice Profile Router — CRUD operations for voice cloning profiles.

Voice profiles store:
    - Voice name and description (user-facing label)
    - Provider (openvoice, xtts, elevenlabs)
    - Speaker audio sample (uploaded WAV/MP3 for voice cloning)
    - Language and gender metadata
    - TTS preset parameters (speaking rate, pitch, emotion)

This router provides the API surface for the Voice Cloning dashboard page.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form

from app.config import settings

logger = logging.getLogger("voiceai.voice_profiles")

router = APIRouter(prefix="/voice-profiles", tags=["Voice Profiles"])

# ── In-Memory Voice Profile Store ──────────────────────────────────
# In production, this would be backed by PostgreSQL via Prisma.

_profiles: dict[str, dict] = {}
_AUDIO_DIR = os.path.join(settings.AUDIO_FOLDER, "voice_samples")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _ensure_audio_dir():
    """Ensure the voice samples directory exists."""
    os.makedirs(_AUDIO_DIR, exist_ok=True)


def _get_profile_or_404(profile_id: str) -> dict:
    profile = _profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Voice profile not found")
    return profile


def _filter_public(profile: dict) -> dict:
    """Filter out internal/private keys (prefixed with underscore) from a profile dict."""
    return {k: v for k, v in profile.items() if not k.startswith("_")}


# ── System Voices (pre-configured, read-only) ──────────────────────

_SYSTEM_VOICES = [
    {
        "id": "kokoro-default",
        "name": "Default (Kokoro)",
        "provider": "kokoro",
        "language": "en",
        "gender": "female",
        "is_system": True,
        "description": "Kokoro lightweight local TTS (82M params, CPU-friendly)",
    },
    {
        "id": "xtts-default",
        "name": "XTTS Multilingual",
        "provider": "xtts",
        "language": "multi",
        "gender": "neutral",
        "is_system": True,
        "description": "Coqui XTTS-v2 multi-language TTS (1.8GB model)",
    },
    {
        "id": "openvoice-default",
        "name": "OpenVoice Default",
        "provider": "openvoice",
        "language": "en",
        "gender": "female",
        "is_system": True,
        "description": "OpenVoice v2 base speaker (English)",
    },
]


# ── Voice Profile CRUD ─────────────────────────────────────────────


@router.get("", response_model=dict)
async def list_profiles():
    """List all voice profiles, including system defaults and user-created cloned voices."""
    user_profiles = list(_profiles.values())
    user_profiles.sort(key=lambda p: p.get("created_at", ""), reverse=True)

    return {
        "profiles": _SYSTEM_VOICES + [_filter_public(p) for p in user_profiles],
        "total_system": len(_SYSTEM_VOICES),
        "total_user": len(user_profiles),
    }


@router.get("/{profile_id}", response_model=dict)
async def get_profile(profile_id: str):
    """Get a single voice profile by ID."""
    # Check system voices first
    for sv in _SYSTEM_VOICES:
        if sv["id"] == profile_id:
            return {"profile": sv}

    profile = _get_profile_or_404(profile_id)
    return {"profile": _filter_public(profile)}


@router.post("", response_model=dict, status_code=201)
async def create_profile(
    name: str = Form(...),
    provider: str = Form("openvoice"),
    language: str = Form("en"),
    gender: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    speaking_rate: Optional[float] = Form(None),
    pitch: Optional[float] = Form(None),
    emotion: Optional[str] = Form(None),
    sample: Optional[UploadFile] = File(None),
):
    """Create a new voice profile with an optional speaker audio sample for cloning.

    Args:
        name: Display name for the voice profile
        provider: TTS provider to use (openvoice, xtts, elevenlabs)
        language: Language code (en, es, fr, hi, etc.)
        gender: Voice gender label
        description: Optional description
        speaking_rate: Default speaking rate (0.5-2.0)
        pitch: Default pitch adjustment (-20 to +20)
        emotion: Default emotion (neutral, friendly, professional, etc.)
        sample: Optional audio file for voice cloning (WAV/MP3, max 10MB)
    """
    profile_id = str(uuid.uuid4())
    now = _now()
    _ensure_audio_dir()

    sample_path: str | None = None
    sample_url: str | None = None

    if sample and sample.filename:
        # Validate file type
        ext = sample.filename.rsplit(".", 1)[-1].lower() if "." in sample.filename else ""
        if ext not in ("wav", "mp3", "m4a", "ogg"):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported audio format: .{ext}. Supported: .wav, .mp3, .m4a, .ogg",
            )

        # Validate file size (10MB max)
        content = await sample.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="Audio sample too large. Maximum size is 10MB.",
            )

        # Save to disk
        safe_filename = f"{profile_id}_{sample.filename}"
        sample_path = os.path.join(_AUDIO_DIR, safe_filename)
        with open(sample_path, "wb") as f:
            f.write(content)

        sample_url = f"/audio/voice_samples/{safe_filename}"
        logger.info("Saved voice sample: %s (%d bytes)", sample_path, len(content))

    profile = {
        "_sample_path": sample_path,
        "id": profile_id,
        "name": name,
        "provider": provider,
        "language": language,
        "gender": gender or "neutral",
        "is_system": False,
        "description": description or "",
        "speaking_rate": speaking_rate or 1.0,
        "pitch": pitch or 0,
        "emotion": emotion or "neutral",
        "has_sample": sample_path is not None,
        "sample_filename": sample.filename if sample else None,
        "sample_url": sample_url,
        "sample_duration_seconds": None,
        "created_at": now,
        "updated_at": now,
    }

    _profiles[profile_id] = profile

    logger.info("Created voice profile '%s' (id=%s, provider=%s)", name, profile_id, provider)
    return {"profile": _filter_public(profile)}


@router.put("/{profile_id}", response_model=dict)
async def update_profile(
    profile_id: str,
    name: Optional[str] = Form(None),
    provider: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    speaking_rate: Optional[float] = Form(None),
    pitch: Optional[float] = Form(None),
    emotion: Optional[str] = Form(None),
    sample: Optional[UploadFile] = File(None),
):
    """Update an existing voice profile."""
    profile = _get_profile_or_404(profile_id)
    now = _now()

    if name is not None:
        profile["name"] = name
    if provider is not None:
        profile["provider"] = provider
    if language is not None:
        profile["language"] = language
    if gender is not None:
        profile["gender"] = gender
    if description is not None:
        profile["description"] = description
    if speaking_rate is not None:
        profile["speaking_rate"] = speaking_rate
    if pitch is not None:
        profile["pitch"] = pitch
    if emotion is not None:
        profile["emotion"] = emotion

    # Replace audio sample
    if sample and sample.filename:
        ext = sample.filename.rsplit(".", 1)[-1].lower() if "." in sample.filename else ""
        if ext not in ("wav", "mp3", "m4a", "ogg"):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported audio format: .{ext}",
            )

        content = await sample.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Audio sample too large. Maximum size is 10MB.")

        _ensure_audio_dir()
        safe_filename = f"{profile_id}_{sample.filename}"

        # Remove old file if exists
        old_path = profile.get("_sample_path")
        if old_path and os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

        sample_path = os.path.join(_AUDIO_DIR, safe_filename)
        with open(sample_path, "wb") as f:
            f.write(content)

        profile["has_sample"] = True
        profile["sample_filename"] = sample.filename
        profile["sample_url"] = f"/audio/voice_samples/{safe_filename}"
        profile["_sample_path"] = sample_path

    profile["updated_at"] = now
    _profiles[profile_id] = profile

    logger.info("Updated voice profile '%s' (id=%s)", profile["name"], profile_id)
    return {"profile": _filter_public(profile)}


@router.delete("/{profile_id}", response_model=dict)
async def delete_profile(profile_id: str):
    """Delete a voice profile and its associated audio sample."""
    profile = _get_profile_or_404(profile_id)

    # Remove audio file if exists
    sample_path = profile.get("_sample_path")
    if sample_path and os.path.exists(sample_path):
        try:
            os.remove(sample_path)
            logger.info("Deleted voice sample file: %s", sample_path)
        except OSError as e:
            logger.warning("Failed to delete voice sample: %s", e)

    del _profiles[profile_id]
    logger.info("Deleted voice profile (id=%s)", profile_id)
    return {"success": True}


# ── Voice Presets ──────────────────────────────────────────────────


@router.get("/presets/emotions", response_model=dict)
async def list_emotion_presets():
    """List available emotion presets for TTS."""
    return {
        "presets": [
            {"id": "neutral", "name": "Neutral", "description": "Balanced, natural speaking tone"},
            {"id": "friendly", "name": "Friendly", "description": "Warm and approachable"},
            {"id": "professional", "name": "Professional", "description": "Formal business tone"},
            {"id": "empathetic", "name": "Empathetic", "description": "Caring and understanding"},
            {"id": "urgent", "name": "Urgent", "description": "Fast-paced, priority-driven"},
            {"id": "cheerful", "name": "Cheerful", "description": "Upbeat and positive"},
        ]
    }


@router.get("/presets/providers", response_model=dict)
async def list_voice_providers():
    """List available TTS providers with their capabilities."""
    return {
        "providers": [
            {
                "id": "kokoro",
                "name": "Kokoro (Local)",
                "type": "local",
                "priority": 1,
                "supports_cloning": False,
                "languages": ["en", "ja", "zh", "ko"],
                "description": "Lightweight TTS (~82M params), runs on CPU, instant synthesis",
            },
            {
                "id": "openvoice",
                "name": "OpenVoice v2 (Local)",
                "type": "local",
                "priority": 2,
                "supports_cloning": True,
                "languages": ["en", "zh", "jp", "kr", "es", "fr"],
                "description": "Voice cloning from 10-second audio sample, emotion/style control",
            },
            {
                "id": "xtts",
                "name": "XTTS-v2 (Local)",
                "type": "local",
                "priority": 3,
                "supports_cloning": True,
                "languages": ["en", "hi", "es", "fr", "de", "pt", "it", "pl", "tr", "ru", "nl", "ar", "zh", "ja", "ko"],
                "description": "Multi-language TTS with voice cloning (~1.8GB model)",
            },
            {
                "id": "elevenlabs",
                "name": "ElevenLabs (Cloud)",
                "type": "cloud",
                "priority": 4,
                "supports_cloning": True,
                "languages": ["en", "es", "fr", "de", "it", "pt", "pl", "hi", "ar", "zh", "ja", "ko"],
                "description": "Cloud TTS with professional voice cloning (API key required)",
            },
        ]
    }
