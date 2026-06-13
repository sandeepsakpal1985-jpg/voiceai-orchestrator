"""
FreeSWITCH Call Handler — Manages a single call's lifecycle through the AI voice pipeline.

Flow:
  Answer → Greeting (TTS) → Record (VAD) → Transcribe (STT) → LLM → TTS → Playback → Repeat
                                                                                       ↓
                                                                                  Hang up

Recording uses energy-based Voice Activity Detection (VAD) for natural turn-taking.
The recording stops when the caller pauses long enough (silence hangover).

This reuses the existing VoicePipeline (STT → LLM → TTS) and ConversationService.
"""

import asyncio
import logging
import os
import time
import uuid

from app.config import settings
from app.models.schemas import ConversationCreate, Message
from app.services.conversation import get_conversation_service
from app.voice import get_voice_pipeline

from app.services.recording import get_recording_service

from .config import get_freeswitch_settings
from .exceptions import AudioFileError, AudioProcessingError
from .types import CallState, FreeswitchCall, CallDirection
from .vad import EnergyVAD, VADConfig

logger = logging.getLogger("ai_sales_agent.freeswitch.call")

# System prompt for FreeSWITCH phone calls
FS_SYSTEM_PROMPT = (
    "You are a friendly and professional AI sales assistant on a phone call. "
    "Keep responses concise and conversational, suitable for a voice call. "
    "Speak naturally and ask relevant follow-up questions. "
    "Responses should be under 100 words unless complex. "
    "If the caller says goodbye or thank you, end the conversation politely."
)


class FreeSwitchCallHandler:
    """Manages a single FreeSWITCH call through the AI voice pipeline."""

    def __init__(
        self,
        call: FreeswitchCall,
        esl_client=None,
        audio_dir: str = "tmp_fs_audio",
        greeting: str = "Hello! Thank you for calling. This is your AI assistant. How can I help you today?",
        llm_timeout: int = 15,
        max_turns: int = 50,
        vad_config: VADConfig | None = None,
    ) -> None:
        self.call = call
        self._esl = esl_client
        self._audio_dir = audio_dir
        self._greeting = greeting
        self._llm_timeout = llm_timeout
        self._max_turns = max_turns
        self._pipeline = get_voice_pipeline()
        self._conv_service = get_conversation_service()
        self._fs_settings = get_freeswitch_settings()
        self._vad = EnergyVAD(config=vad_config or VADConfig())
        self._active = True
        self._current_task: asyncio.Task | None = None

    @property
    def call_uuid(self) -> str:
        return self.call.call_uuid

    @property
    def conversation_id(self) -> str:
        return self.call.conversation_id

    @property
    def is_active(self) -> bool:
        return self._active and self.call.is_active

    async def start(self) -> None:
        """Start the call handler: create conversation, greet, begin conversation loop."""
        logger.info("[CALL RECEIVED] Call %s from %s", self.call_uuid, self.call.caller_number)
        self.call.mark_answered()
        self.call.state = CallState.WAITING

        # Create conversation in the conversation service
        conv = self._conv_service.create(
            ConversationCreate(
                contact_phone=self.call.caller_number,
                contact_name=self.call.caller_number,
                metadata={
                    "source": "freeswitch",
                    "call_uuid": self.call.call_uuid,
                    "direction": self.call.direction.value,
                },
            )
        )
        self.call.conversation_id = conv.id
        logger.info(
            "Call %s: Conversation %s created with %s",
            self.call_uuid, conv.id, self.call.caller_number,
        )

        # Play greeting
        await self._speak(self._greeting)
        self._conv_service.add_message(
            self.call.conversation_id,
            Message(role="agent", content=self._greeting, timestamp=time.time()),
        )

        # Enter conversation loop
        self._current_task = asyncio.create_task(self._conversation_loop())

    async def stop(self) -> None:
        """Stop the call handler gracefully."""
        self._active = False
        if self._current_task:
            self._current_task.cancel()
            try:
                await self._current_task
            except (asyncio.CancelledError, Exception):
                pass
            self._current_task = None
        self.call.mark_completed()
        self._conv_service.update_status(self.call.conversation_id, "completed")
        logger.info("Call %s: Handler stopped", self.call_uuid)

    async def _conversation_loop(self) -> None:
        """Main conversation loop: Record → STT → LLM → TTS → Playback."""
        try:
            while self._active and self.call.turn_count < self._max_turns:
                # 1. Record caller audio
                audio_path = await self._record_turn()
                if not audio_path:
                    logger.info("Call %s: No audio recorded, ending", self.call_uuid)
                    break

                logger.info("[AUDIO RECEIVED] Call %s: Audio recorded (%.1fs)", self.call_uuid, self.call.duration)

                # 2. Read audio bytes
                audio_bytes = await self._read_audio(audio_path)
                if not audio_bytes:
                    break

                # 3. Save recording before processing
                try:
                    rec_svc = get_recording_service()
                    await rec_svc.save_recording(
                        conversation_id=self.call.conversation_id,
                        audio_bytes=audio_bytes,
                        call_id=self.call_uuid,
                        turn_number=self.call.turn_count + 1,
                        direction="inbound",
                    )
                except Exception:
                    logger.debug("Call %s: Recording save skipped", self.call_uuid)

                # 4. STT: Transcribe audio
                self.call.mark_processing()
                logger.info("[STT START] Call %s: Transcribing %d bytes...", self.call_uuid, len(audio_bytes))
                transcription = await self._transcribe(audio_bytes)
                logger.info("[STT COMPLETE] Call %s: Transcribed: '%s'", self.call_uuid, transcription[:80])
                if not transcription.strip():
                    await self._speak(
                        "I'm sorry, I didn't catch that. Could you please repeat yourself?"
                    )
                    continue

                logger.info(
                    "Call %s Turn %d: Transcribed: '%s'",
                    self.call_uuid, self.call.turn_count + 1,
                    transcription[:80],
                )

                # 4. Check for end-call phrases
                if self._should_end_call(transcription):
                    await self._speak(
                        "Thank you for your time! Have a wonderful day! Goodbye."
                    )
                    self._conv_service.add_message(
                        self.call.conversation_id,
                        Message(role="user", content=transcription, timestamp=time.time()),
                    )
                    self._conv_service.add_message(
                        self.call.conversation_id,
                        Message(
                            role="agent",
                            content="Thank you for your time! Goodbye.",
                            timestamp=time.time(),
                        ),
                    )
                    break

                # 5. Store user message
                self._conv_service.add_message(
                    self.call.conversation_id,
                    Message(role="user", content=transcription, timestamp=time.time()),
                )

                # 7. LLM: Get response with timeout
                logger.info("[LLM START] Call %s: Processing through LLM...", self.call_uuid)
                response = await self._llm_process(transcription)
                if not response:
                    response = "I'm sorry, I'm having trouble processing that. Could you please try again?"
                logger.info("[LLM COMPLETE] Call %s: LLM response (%d chars)", self.call_uuid, len(response))

                # 8. Store agent message
                self._conv_service.add_message(
                    self.call.conversation_id,
                    Message(role="agent", content=response, timestamp=time.time()),
                )

                # 9. TTS: Synthesize and play back
                logger.info("[TTS START] Call %s: Synthesizing response...", self.call_uuid)
                tts_audio = await self._speak(response, return_audio=True)
                logger.info("[TTS COMPLETE] Call %s: Audio synthesized and sent to caller", self.call_uuid)
                logger.info("[AUDIO PLAYBACK] Call %s: Response played to caller", self.call_uuid)

                # Save outbound (TTS) recording
                if tts_audio:
                    try:
                        rec_svc = get_recording_service()
                        await rec_svc.save_recording(
                            conversation_id=self.call.conversation_id,
                            audio_bytes=tts_audio,
                            call_id=self.call_uuid,
                            turn_number=self.call.turn_count + 1,
                            direction="outbound",
                        )
                    except Exception:
                        logger.debug("Call %s: Outbound recording save skipped", self.call_uuid)
                self.call.increment_turn()

                # 9. Clean up audio file
                self._cleanup_audio(audio_path)

            # End of loop
            logger.info(
                "[CALL ENDED] Call %s: Conversation ended after %d turns (%.1fs)",
                self.call_uuid, self.call.turn_count, self.call.duration,
            )

        except asyncio.CancelledError:
            logger.info("Call %s: Conversation loop cancelled", self.call_uuid)
        except Exception:
            logger.exception("Call %s: Error in conversation loop", self.call_uuid)
        finally:
            self._active = False
            self.call.mark_completed()
            # Attempt to hang up
            if self._esl and self._esl.is_connected:
                try:
                    await self._esl.execute_hangup(self.call_uuid)
                except Exception:
                    pass
            self._conv_service.update_status(self.call.conversation_id, "completed")

    async def _record_turn(self) -> str | None:
        """Record the caller's speech for one turn.

        Uses energy-based VAD to detect when the caller stops speaking,
        replacing the old fixed-duration recording for natural turn-taking.

        Returns:
            Path to the recorded audio file, or None if recording failed.
        """
        self.call.mark_recording("")
        os.makedirs(self._audio_dir, exist_ok=True)
        file_name = f"fs_{self.call_uuid}_{int(time.time())}.wav"
        file_path = os.path.join(self._audio_dir, file_name)

        if not self._esl or not self._esl.is_connected:
            logger.warning("Call %s: ESL not connected, cannot record", self.call_uuid)
            return None

        try:
            max_record = self._fs_settings.FREESWITCH_RECORD_TIMEOUT
            vad_max = int(self._vad.config.max_record_seconds)
            record_limit = min(max_record, vad_max)

            success = await self._esl.execute_uuid_record(
                self.call_uuid,
                file_path,
                limit_seconds=record_limit,
            )
            if not success:
                logger.error("Call %s: Failed to start recording", self.call_uuid)
                return None

            # VAD-driven recording loop:
            # Record in short chunks and check for voice activity.
            # Uses the VAD's built-in silence hangover (default 15 frames = 450ms).
            chunk_duration = 0.3  # Check every 300ms
            elapsed = 0.0
            vad_checks = 0
            vad_triggered = False

            while elapsed < record_limit:
                await asyncio.sleep(chunk_duration)
                elapsed += chunk_duration
                vad_checks += 1

                # Check VAD every ~1 second (every few chunks to avoid I/O thrash)
                if vad_checks % 3 == 0 and os.path.exists(file_path):
                    result = self._vad.detect_speech_end_from_file(file_path)

                    # VAD found speech that has now ended (silence hangover met)
                    if result.should_process and result.speech_duration >= 0.5:
                        # Check VAD's own silence hangover: look at trailing frames
                        hangover = self._vad.config.silence_hangover_frames
                        last_frames = result.frame_classifications[-hangover:] if len(result.frame_classifications) >= hangover else result.frame_classifications
                        silence_ratio = sum(1 for f in last_frames if not f) / max(1, len(last_frames))
                        if silence_ratio >= 0.9:  # 90% silence = caller has stopped speaking
                            logger.info(
                                "Call %s: VAD detected speech end after %.1fs (%.0f%% speech)",
                                self.call_uuid, elapsed, result.speech_percentage,
                            )
                            vad_triggered = True
                            break
                    elif not result.has_speech and elapsed >= self._vad.config.min_record_seconds:
                        # Enough time has passed with no speech — stop waiting
                        logger.info(
                            "Call %s: No speech detected after %.1fs",
                            self.call_uuid, elapsed,
                        )
                        break

            # Stop recording
            await self._esl.execute_stop_record(self.call_uuid)

            if vad_triggered:
                logger.info(
                    "Call %s: VAD stopped recording at %.1fs",
                    self.call_uuid, elapsed,
                )
            else:
                logger.info(
                    "Call %s: Recording stopped at %.1fs (VAD: %s)",
                    self.call_uuid, elapsed, "triggered" if vad_triggered else "timeout",
                )

            # Verify file exists and has content
            if os.path.exists(file_path) and os.path.getsize(file_path) > 100:
                self.call.mark_recording(file_path)
                self.call.last_audio_file = file_path
                return file_path
            else:
                logger.warning(
                    "Call %s: Recording file too small or missing: %s",
                    self.call_uuid, file_path,
                )
                return None

        except Exception as exc:
            logger.error(
                "Call %s: Recording error: %s", self.call_uuid, exc
            )
            return None

    async def _read_audio(self, file_path: str) -> bytes | None:
        """Read audio file bytes.

        Args:
            file_path: Path to audio file.

        Returns:
            Audio bytes, or None if read failed.
        """
        try:
            with open(file_path, "rb") as f:
                return f.read()
        except Exception as exc:
            raise AudioFileError(file_path, "read", cause=exc) from exc

    async def _transcribe(self, audio_bytes: bytes) -> str:
        """Transcribe audio bytes to text using the STT provider.

        Args:
            audio_bytes: Raw WAV audio bytes.

        Returns:
            Transcribed text string.
        """
        try:
            return await self._pipeline.stt.transcribe(
                audio_bytes,
                language=settings.DEFAULT_LANGUAGE,
            )
        except Exception as exc:
            raise AudioProcessingError(cause=exc) from exc

    async def _llm_process(self, user_input: str) -> str:
        """Process user input through the LLM.

        Args:
            user_input: Transcribed user text.

        Returns:
            LLM response text.
        """
        try:
            messages = self._pipeline.build_messages(
                user_input,
                conversation_id=self.call.conversation_id,
                system_prompt=FS_SYSTEM_PROMPT,
            )
            return await asyncio.wait_for(
                self._pipeline.llm.complete(messages),
                timeout=self._llm_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning("Call %s: LLM timeout", self.call_uuid)
            return ""
        except Exception as exc:
            raise AudioProcessingError(cause=exc) from exc

    async def _speak(self, text: str, return_audio: bool = False) -> bytes | None:
        """Synthesize text to speech and play it to the caller.

        Args:
            text: Text to speak.
            return_audio: If True, return the raw TTS audio bytes (for recording).

        Returns:
            Raw audio bytes if return_audio=True, else None.
        """
        if not text.strip():
            return None

        self.call.mark_speaking()
        audio_bytes = None

        if not self._esl or not self._esl.is_connected:
            logger.warning("Call %s: ESL not connected, cannot play audio", self.call_uuid)
            return None

        try:
            # Synthesize TTS audio
            audio_bytes = await self._pipeline.synthesize_response(
                text,
                voice_id=settings.DEFAULT_VOICE_ID,
                language=settings.DEFAULT_LANGUAGE,
            )

            if not audio_bytes or len(audio_bytes) < 100:
                logger.warning("Call %s: TTS produced empty audio", self.call_uuid)
                return None

            # Save TTS audio to a file FreeSWITCH can read
            os.makedirs(self._audio_dir, exist_ok=True)
            tts_file = os.path.join(
                self._audio_dir,
                f"tts_{self.call_uuid}_{int(time.time())}.wav",
            )
            with open(tts_file, "wb") as f:
                f.write(audio_bytes)

            # Broadcast to the call
            success = await self._esl.execute_uuid_broadcast(
                self.call_uuid, tts_file
            )
            if not success:
                logger.error(
                    "Call %s: Failed to broadcast audio", self.call_uuid
                )

            # Wait for playback to finish (approximate)
            playback_duration = max(len(text) * 0.08, 1.0)
            await asyncio.sleep(playback_duration)

            # Cleanup
            self._cleanup_audio(tts_file)

        except Exception as exc:
            logger.error(
                "Call %s: TTS/playback error: %s", self.call_uuid, exc
            )
            return None

        return audio_bytes if return_audio else None

    def _should_end_call(self, text: str) -> bool:
        """Check if the caller wants to end the call.

        Args:
            text: Transcribed user input.

        Returns:
            True if the call should end.
        """
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

    def _cleanup_audio(self, file_path: str) -> None:
        """Remove a temporary audio file.

        Args:
            file_path: Path to the audio file to remove.
        """
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass
