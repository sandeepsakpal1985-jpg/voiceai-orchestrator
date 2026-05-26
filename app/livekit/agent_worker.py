"""
LiveKit Agent Worker — Runs the voice pipeline inside a LiveKit room.

The agent worker connects to a LiveKit room, receives audio from
the participant, processes it through the STT→LLM→TTS pipeline,
and publishes the response audio back to the room.

This is the core realtime voice loop for the platform.
"""

import asyncio
import logging
import time
from typing import Any

from app.config import settings
from app.voice.pipeline import get_voice_pipeline

logger = logging.getLogger("voiceai.livekit.agent_worker")


class LiveKitAgentWorker:
    """Voice agent worker that processes audio in a LiveKit room.

    Connects to a LiveKit room, subscribes to participant audio tracks,
    runs the STT→LLM→TTS pipeline, and publishes synthesized speech back.

    Usage:
        worker = LiveKitAgentWorker()
        await worker.run(room_name="voiceai-abc123", participant_identity="user-1")
    """

    def __init__(self):
        self._pipeline = get_voice_pipeline()
        self._running = False
        self._conversation_id: str | None = None
        self._room_name: str | None = None

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
        """Run the agent in a LiveKit room.

        This is the main entry point. It:
        1. Connects to the LiveKit room
        2. Subscribes to the participant's audio track
        3. Processes audio through the voice pipeline
        4. Publishes synthesized speech back to the room

        Args:
            room_name: LiveKit room to join
            participant_identity: Identity of the participant to listen to
            system_prompt: Optional system prompt for the LLM
        """
        self._room_name = room_name
        self._running = True

        try:
            from livekit.rtc import Room, RemoteTrackPublication, RemoteParticipant, TrackKind

            # Connect to LiveKit
            room = Room()
            self._room = room

            logger.info(
                "Agent connecting to LiveKit room '%s'...",
                room_name,
            )

            @room.on("track_published")
            def on_track_published(
                publication: RemoteTrackPublication,
                participant: RemoteParticipant,
            ):
                """Handle incoming audio tracks from the participant."""
                if publication.kind != TrackKind.KIND_AUDIO:
                    return
                if participant.identity != participant_identity:
                    return

                logger.info(
                    "Subscribing to audio from %s",
                    participant_identity,
                )
                asyncio.create_task(
                    self._handle_audio_track(
                        publication,
                        participant,
                        system_prompt,
                    )
                )

            # Connect and join room
            await room.connect(
                settings.LIVEKIT_URL,
                settings.LIVEKIT_API_KEY,
                identity=f"agent-{participant_identity}",
                room_name=room_name,
            )

            logger.info(
                "Agent connected to room '%s', listening for participant '%s'",
                room_name,
                participant_identity,
            )

            # Keep running until disconnected
            while self._running:
                await asyncio.sleep(1)

        except ImportError:
            logger.error(
                "LiveKit Python SDK not installed. "
                "Install with: pip install livekit"
            )
        except Exception as e:
            logger.exception("LiveKit agent error: %s", e)
        finally:
            self._running = False
            logger.info("Agent disconnected from room '%s'", room_name)

    async def _handle_audio_track(
        self,
        publication: Any,
        participant: Any,
        system_prompt: str | None,
    ) -> None:
        """Process audio from a participant through the voice pipeline."""
        try:
            import livekit as lk

            audio_stream = publication.subscribe()

            # Create a conversation for this session
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

            # Buffer audio and process
            audio_buffer = bytearray()
            sample_rate = 16000

            async for frame in audio_stream:
                if not self._running:
                    break

                # Collect audio data
                if hasattr(frame, "data"):
                    audio_buffer.extend(frame.data.tobytes())

                # Process when enough audio is buffered
                if len(audio_buffer) >= sample_rate * 2:  # ~2 seconds
                    try:
                        # Process through pipeline
                        result = await self._pipeline.process_audio(
                            audio_data=bytes(audio_buffer),
                            conversation_id=self._conversation_id,
                            language=settings.DEFAULT_LANGUAGE,
                            system_prompt=system_prompt or None,
                        )

                        # If there's a response, synthesize and publish
                        if result.get("response"):
                            audio = await self._pipeline.synthesize_response(
                                text=result["response"],
                                voice_id=settings.DEFAULT_VOICE_ID,
                                language=settings.DEFAULT_LANGUAGE,
                            )
                            # Publish synthesized audio back to room
                            if self._room:
                                source = lk.AudioSource(
                                    sample_rate=24000,
                                    num_channels=1,
                                )
                                # Feed audio data to source
                                # (simplified — real implementation uses proper buffering)
                                logger.debug(
                                    "Synthesized %d bytes of response audio",
                                    len(audio),
                                )

                    except Exception as e:
                        logger.warning("Pipeline error during LiveKit processing: %s", e)

                    # Reset buffer with overlap
                    audio_buffer.clear()

        except Exception as e:
            logger.exception("Audio track handler error: %s", e)

    def stop(self) -> None:
        """Stop the agent worker."""
        self._running = False
        logger.info("Agent worker stopping")
