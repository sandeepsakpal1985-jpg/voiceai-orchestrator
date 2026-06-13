"""Tests for telephony/freeswitch/call_handler.py — Per-call handler."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from telephony.freeswitch.call_handler import FreeSwitchCallHandler
from telephony.freeswitch.types import FreeswitchCall, CallDirection, CallState
from telephony.freeswitch.config import get_freeswitch_settings


@pytest.fixture
def mock_pipeline():
    """Create a mock VoicePipeline."""
    pipeline = MagicMock()
    pipeline.stt.transcribe = AsyncMock(return_value="Hello, I'm interested in your service.")
    pipeline.llm.complete = AsyncMock(return_value="Great! Let me tell you about our service.")
    pipeline.synthesize_response = AsyncMock(return_value=b"\x00\x01\x02" * 100)  # ~300 bytes of fake WAV
    pipeline.build_messages = MagicMock(return_value=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello, I'm interested in your service."},
    ])
    return pipeline


@pytest.fixture
def mock_esl():
    """Create a mock ESL client."""
    esl = MagicMock()
    esl.is_connected = True
    esl.execute_uuid_record = AsyncMock(return_value=True)
    esl.execute_stop_record = AsyncMock(return_value=True)
    esl.execute_uuid_broadcast = AsyncMock(return_value=True)
    esl.execute_hangup = AsyncMock(return_value=True)
    return esl


@pytest.fixture
def mock_conversation_service():
    """Mock the conversation service singleton."""
    with patch("telephony.freeswitch.call_handler.get_conversation_service") as mock:
        svc = MagicMock()
        svc.create = MagicMock()
        conv = MagicMock()
        conv.id = "conv-test-123"
        svc.create.return_value = conv
        svc.add_message = MagicMock()
        svc.update_status = MagicMock()
        svc.get_history = MagicMock(return_value=[])
        svc.get = MagicMock()
        svc.get.return_value = conv
        mock.return_value = svc
        yield svc


@pytest.fixture
def call():
    return FreeswitchCall(
        call_uuid="test-call-uuid",
        caller_number="+15551234567",
        called_number="+15559876543",
        direction=CallDirection.INBOUND,
    )


@pytest.mark.asyncio
class TestFreeSwitchCallHandler:
    async def test_initial_state(self, call, mock_pipeline, mock_esl):
        """Handler should start in a valid initial state."""
        handler = FreeSwitchCallHandler(
            call=call,
            esl_client=mock_esl,
            audio_dir="/tmp/test_audio",
            greeting="Hello! Testing.",
        )
        assert handler.call_uuid == "test-call-uuid"
        assert handler.conversation_id == ""
        assert handler.is_active is True

    async def test_should_end_call_recognizes_goodbye(self, call, mock_pipeline, mock_esl):
        """End-call phrases should be detected."""
        handler = FreeSwitchCallHandler(call=call, esl_client=mock_esl)
        assert handler._should_end_call("goodbye") is True
        assert handler._should_end_call("Goodbye, thanks!") is True
        assert handler._should_end_call("bye") is True
        assert handler._should_end_call("no thanks") is True
        assert handler._should_end_call("no thank you") is True
        assert handler._should_end_call("hang up") is True
        assert handler._should_end_call("that's all") is True
        assert handler._should_end_call("have a good day") is True

    async def test_should_end_call_ignores_normal_speech(self, call, mock_pipeline, mock_esl):
        """Normal conversation should not be detected as end-call."""
        handler = FreeSwitchCallHandler(call=call, esl_client=mock_esl)
        assert handler._should_end_call("Hello!") is False
        assert handler._should_end_call("I need help with my account") is False
        assert handler._should_end_call("Can you tell me more?") is False
        assert handler._should_end_call("What time are you open?") is False

    async def test_stop_handler(self, call, mock_pipeline, mock_esl, mock_conversation_service):
        """Stop should mark call as completed."""
        handler = FreeSwitchCallHandler(call=call, esl_client=mock_esl)
        # Simulate start setting the conversation_id
        call.conversation_id = "conv-test-123"
        await handler.stop()
        assert call.state == CallState.COMPLETED
        assert handler.is_active is False
        mock_conversation_service.update_status.assert_called_with(
            "conv-test-123", "completed"
        )

    async def test_cleanup_audio_handles_missing_file(self, call, mock_pipeline, mock_esl):
        """Cleanup of non-existent audio files should not raise."""
        handler = FreeSwitchCallHandler(call=call, esl_client=mock_esl)
        # This should not raise
        handler._cleanup_audio("/tmp/nonexistent/file.wav")

    async def test_start_creates_conversation(self, call, mock_pipeline, mock_esl, mock_conversation_service):
        """start() should create a conversation via conversation service."""
        handler = FreeSwitchCallHandler(call=call, esl_client=mock_esl)

        # Patch the pipeline on the handler
        with patch.object(handler, "_pipeline", mock_pipeline):
            # Start the handler and immediately stop to avoid hanging
            task = asyncio.create_task(handler.start())
            await asyncio.sleep(0.05)
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

        # Verify conversation was created
        mock_conversation_service.create.assert_called_once()
        from app.models.schemas import ConversationCreate
        conv_arg = mock_conversation_service.create.call_args[0][0]
        assert isinstance(conv_arg, ConversationCreate)
        assert conv_arg.contact_phone == "+15551234567"

    async def test_max_turns_enforced(self, call, mock_pipeline, mock_esl):
        """Handler should respect max_turns limit."""
        handler = FreeSwitchCallHandler(call=call, esl_client=mock_esl, max_turns=3)
        assert handler._max_turns == 3
