"""
⚠️⚠️⚠️  DEPRECATED MODULE  ⚠️⚠️⚠️

LiveKit Agent Worker — Legacy manual audio processing in a LiveKit room.

**DO NOT USE for new development.** Use `voice_agent.py` instead.

The production VoiceAgent (app.livekit.voice_agent) uses:
    - livekit.agents.voice.AgentSession for STT→LLM→TTS pipeline
    - LiveKit's built-in turn detection, interruption handling
    - Audio cache integration via TTS adapter
    - Adaptive modules (state engine, emotion tracking, barge-in)
    - MCP tool calling (CRM, RAG, external servers)

This legacy worker manually buffers audio, runs the old pipeline,
and publishes responses — duplicating what LiveKit's AgentSession
handles natively. It has no adaptive features, no tool integration,
and no audio cache.

Migration path:
    from app.livekit.voice_agent import run_worker
    run_worker()
"""

import asyncio
import logging
from typing import Any

from app.config import settings
from app.voice.pipeline import get_voice_pipeline
from app.livekit.voice_agent import VoiceAgent

logger = logging.getLogger("voiceai.livekit.agent_worker")


class LiveKitAgentWorker:
    """Legacy voice agent worker — manual audio handling in a LiveKit room.

    ⚠️  DEPRECATED: Use VoiceAgent (voice_agent.py) instead.
    
    This class bridges the old custom pipeline into LiveKit rooms.
    Prefer the LiveKit Agents framework for new deployments:
        from app.livekit import VoiceAgent, run_voice_agent_worker
    
    The VoiceAgent uses AgentSession which handles STT→LLM→TTS,
    turn detection, barge-in, and interruption management natively.
    """

    def __init__(self):
        self._pipeline = get_voice_pipeline()
        self._running = False
        self._conversation_id: str | None = None
        self._room_name: str | None = None
        self._room: Any = None

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def conversation_id(self) -> str | None:
        return self._conversation_id

    async def run(
        self,
        room_name: str,
        participant_identity: str,
        system_prompt: str | None = None,
    ) -> None:
        """Run the legacy agent in a LiveKit room (manual audio handling).

        ⚠️  DEPRECATED — Use VoiceAgent for production.
        
        Connects to a LiveKit room, subscribes to the participant's audio,
        buffers audio frames, processes through the pipeline, and publishes
        synthesized speech back to the room.

        Args:
            room_name: LiveKit room to join
            participant_identity: Identity of the participant to listen to
            system_prompt: Optional system prompt for the LLM
        """
        self._room_name = room_name
        self._running = True

        logger.warning(
            "Using legacy LiveKitAgentWorker (deprecated). "
            "Use VoiceAgent for production: from app.livekit import VoiceAgent"
        )

        try:
            from livekit.rtc import Room, RemoteTrackPublication, RemoteParticipant, TrackKind

            room = Room()
            self._room = room

            logger.info(
                "Legacy agent connecting to LiveKit room '%s'...",
                room_name,
            )

            @room.on("track_published")
            def on_track_published(
                publication: RemoteTrackPublication,
                participant: RemoteParticipant,
            ):
                if publication.kind != TrackKind.KIND_AUDIO:
                    return
                if participant.identity != participant_identity:
                    return
                logger.info(
                    "Legacy agent subscribing to audio from %s",
                    participant_identity,
                )
                asyncio.create_task(
                    self._handle_audio_track(publication, participant, system_prompt)
                )

            await room.connect(
                settings.LIVEKIT_URL,
                settings.LIVEKIT_API_KEY,
                identity=f"agent-{participant_identity}",
                room_name=room_name,
            )

            logger.info(
                "Legacy agent connected to room '%s'",
                room_name,
            )

            while self._running:
                await asyncio.sleep(1)

        except ImportError:
            logger.error("LiveKit Python SDK not installed. Install with: pip install livekit")
        except Exception as e:
            logger.exception("Legacy LiveKit agent error: %s", e)
        finally:
            self._running = False
            logger.info("Legacy agent disconnected from room '%s'", room_name)

    async def _handle_audio_track(
        self,
        publication: Any,
        participant: Any,
        system_prompt: str | None,
    ) -> None:
        """Process audio from a participant through the voice pipeline (legacy)."""
        try:
            import livekit as lk

            audio_stream = publication.subscribe()

            from app.models.schemas import ConversationCreate
            from app.services.conversation import get_conversation_service

            conv_service = get_conversation_service()
            conv = conv_service.create(
                ConversationCreate(
                    contact_phone=f"livekit-{participant.identity}",
                    contact_name=participant.identity,
                    metadata={"source": "livekit", "room": self._room_name},
                )
            )
            self._conversation_id = conv.id

            audio_buffer = bytearray()
            sample_rate = 16000

            async for frame in audio_stream:
                if not self._running:
                    break

                if hasattr(frame, "data"):
                    audio_buffer.extend(frame.data.tobytes())

                if len(audio_buffer) >= sample_rate * 2:
                    try:
                        result = await self._pipeline.process_audio(
                            audio_data=bytes(audio_buffer),
                            conversation_id=self._conversation_id,
                            language=settings.DEFAULT_LANGUAGE,
                            system_prompt=system_prompt or None,
                        )

                        if result.get("response"):
                            audio = await self._pipeline.synthesize_response(
                                text=result["response"],
                                voice_id=settings.DEFAULT_VOICE_ID,
                                language=settings.DEFAULT_LANGUAGE,
                            )
                            if self._room:
                                logger.debug(
                                    "Synthesized %d bytes of response audio (legacy)",
                                    len(audio),
                                )

                    except Exception as e:
                        logger.warning("Legacy pipeline error: %s", e)

                    audio_buffer.clear()

        except Exception as e:
            logger.exception("Legacy audio track handler error: %s", e)

    def stop(self) -> None:
        """Stop the legacy agent worker."""
        self._running = False
        logger.info("Legacy agent worker stopping")
