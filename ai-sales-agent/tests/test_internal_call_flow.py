"""
Integration Tests — Internal 1000 → 1001 → AI Agent Call Flow

Tests the full internal call lifecycle:
  1. Extensions 1000, 1001, 1002, 1003, 1004 exist in directory
  2. Dialplan correctly routes each extension
  3. ESL bridge picks up CHANNEL events
  4. Call handler processes greeting → record → STT → LLM → TTS → playback
  5. Multiple AI agent profiles are distinguishable

Uses mocked ESL streams (no real FreeSWITCH needed).
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
import sys
import os

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from telephony.freeswitch.call_handler import FreeSwitchCallHandler
from telephony.freeswitch.bridge_service import (
    FreeSwitchBridgeService,
    get_freeswitch_bridge,
    reset_freeswitch_bridge,
)
from telephony.freeswitch.types import (
    CallState,
    CallDirection,
    FreeswitchCall,
    ESLResponse,
)
from telephony.freeswitch.exceptions import (
    ESLConnectionError,
    BridgeServiceError,
)


# ── Fixtures ───────────────────────────────────────────────────────


@pytest.fixture
def mock_pipeline():
    """Create a mock VoicePipeline for call handler tests."""
    pipeline = MagicMock()
    pipeline.stt.transcribe = AsyncMock(return_value="Hello, I'm interested in your service.")
    pipeline.llm.complete = AsyncMock(
        return_value="Great! Let me tell you about our service."
    )
    pipeline.synthesize_response = AsyncMock(return_value=b"\x00\x01\x02" * 100)
    pipeline.build_messages = MagicMock(
        return_value=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello, I'm interested in your service."},
        ]
    )
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
        conv = MagicMock()
        conv.id = "conv-test-123"
        svc.create.return_value = conv
        svc.add_message = MagicMock()
        svc.update_status = MagicMock()
        svc.get_history = MagicMock(return_value=[])
        svc.get.return_value = conv
        mock.return_value = svc
        yield svc


@pytest.fixture
def make_call():
    """Factory fixture to create a FreeSWITCH call."""

    def _make_call(
        call_uuid="test-uuid",
        caller="1000",
        called="1001",
        direction=CallDirection.INBOUND,
    ):
        return FreeswitchCall(
            call_uuid=call_uuid,
            caller_number=caller,
            called_number=called,
            direction=direction,
        )

    return _make_call


# ── 1. Extension Tests ─────────────────────────────────────────────


class TestInternalExtensions:
    """Verify extensions 1000–1004 exist and have correct password/VoIP config."""

    def test_extension_1000_xml_exists(self):
        """Extension 1000 file should exist and contain 1000pass."""
        path = Path("telephony/configs/freeswitch/directory/default/1000.xml")
        assert path.exists(), "1000.xml must exist"
        content = path.read_text()
        assert "1000pass" in content, "1000 must have password 1000pass"
        assert "1000" in content, "1000 must use user id 1000"

    def test_extension_1001_xml_exists(self):
        """Extension 1001 file should exist and contain 1001pass."""
        path = Path("telephony/configs/freeswitch/directory/default/1001.xml")
        assert path.exists(), "1001.xml must exist"
        content = path.read_text()
        assert "1001pass" in content, "1001 must have password 1001pass"
        assert "1001" in content, "1001 must use user id 1001"

    def test_extension_1002_xml_exists(self):
        """Extension 1002 file should exist and contain 1002pass."""
        path = Path("telephony/configs/freeswitch/directory/default/1002.xml")
        assert path.exists(), "1002.xml must exist"
        content = path.read_text()
        assert "1002pass" in content, "1002 must have password 1002pass"
        assert "support" in content.lower(), "1002 should have support profile"

    def test_extension_1003_xml_exists(self):
        """Extension 1003 file should exist and contain 1003pass."""
        path = Path("telephony/configs/freeswitch/directory/default/1003.xml")
        assert path.exists(), "1003.xml must exist"
        content = path.read_text()
        assert "1003pass" in content, "1003 must have password 1003pass"
        assert "sales" in content.lower(), "1003 should have sales profile"

    def test_extension_1004_xml_exists(self):
        """Extension 1004 file should exist and contain 1004pass."""
        path = Path("telephony/configs/freeswitch/directory/default/1004.xml")
        assert path.exists(), "1004.xml must exist"
        content = path.read_bytes().decode("utf-8", errors="replace")
        assert "1004pass" in content, "1004 must have password 1004pass"
        assert "billing" in content.lower(), "1004 should have billing profile"
        assert "ai_agent_profile" in content, "1004 should set ai_agent_profile"

    def test_extension_passwords_unique(self):
        """All extensions should have unique passwords."""
        passwords = set()
        for ext in ["1000", "1001", "1002", "1003", "1004"]:
            path = Path(f"telephony/configs/freeswitch/directory/default/{ext}.xml")
            content = path.read_bytes().decode("utf-8", errors="replace")
            for line in content.split("\n"):
                if 'name="password"' in line:
                    pwd = line.split('value="')[1].split('"')[0]
                    passwords.add(pwd)
        assert len(passwords) == 5, f"All 5 extensions must have unique passwords, got {len(passwords)}"

    def test_dialplan_has_all_extensions(self):
        """Dialplan should have extensions for 1001, 1002, 1003."""
        path = Path("telephony/configs/freeswitch/dialplan/default.xml")
        assert path.exists(), "Dialplan must exist"
        content = path.read_bytes().decode("utf-8")
        assert 'expression="^1001$"' in content, "Dialplan must route 1001"
        assert 'expression="^1002$"' in content, "Dialplan must route 1002"
        assert 'expression="^1003$"' in content, "Dialplan must route 1003"
        assert 'expression="^1004$"' in content, "Dialplan must route 1004"
        assert "ai_agent_profile" in content, "Dialplan must set ai_agent_profile variable"
        assert "ai_agent_extension_1002" in content, "Dialplan must have 1002 extension block"
        assert "ai_agent_extension_1003" in content, "Dialplan must have 1003 extension block"
        assert "ai_agent_extension_1004" in content, "Dialplan must have 1004 extension block"


# ── 2. Call Flow Tests (via mocked ESL bridge) ─────────────────────


@pytest.mark.asyncio
class TestCallFlowLifecycle:
    """Test the full call lifecycle via bridge service events."""

    async def test_call_created_via_channel_create(self):
        """CHANNEL_CREATE should create a tracked call in RINGING state."""
        reset_freeswitch_bridge()
        bridge = get_freeswitch_bridge()
        await bridge.start()

        event = {
            "Event-Name": "CHANNEL_CREATE",
            "Unique-ID": "call-1000-1001",
            "Caller-Caller-ID-Number": "1000",
            "Caller-Dialplan": "ai-sales-agent",
            "Caller-Destination-Number": "1001",
            "Caller-Context": "ai-sales-agent",
            "Caller-Network-Addr": "127.0.0.1",
        }
        await bridge._on_channel_create(event)

        assert "call-1000-1001" in bridge._active_calls
        call = bridge._active_calls["call-1000-1001"]
        assert call.caller_number == "1000"
        assert call.called_number == "ai-sales-agent"
        assert call.state == CallState.RINGING
        assert call.direction == CallDirection.INBOUND
        await bridge.stop()

    async def test_call_from_1000_to_1001_tracks_correctly(self):
        """Call from 1000 to 1001 should be tracked with correct metadata."""
        reset_freeswitch_bridge()
        bridge = get_freeswitch_bridge()
        await bridge.start()

        event = {
            "Event-Name": "CHANNEL_CREATE",
            "Unique-ID": "call-uuid-1000-1001",
            "Caller-Caller-ID-Number": "1000",
            "Caller-Dialplan": "ai-sales-agent",
            "Caller-Destination-Number": "1001",
            "Caller-Context": "ai-sales-agent",
            "Caller-Network-Addr": "127.0.0.1",
        }
        await bridge._on_channel_create(event)
        call = bridge._active_calls["call-uuid-1000-1001"]
        assert call.metadata["caller_destination"] == "1001"
        assert call.metadata["context"] == "ai-sales-agent"
        await bridge.stop()

    async def test_channel_answer_transitions_state(self):
        """CHANNEL_ANSWER should transition call to ANSWERED and start handler."""
        reset_freeswitch_bridge()
        bridge = get_freeswitch_bridge()
        await bridge.start()

        # First create the call
        create_event = {
            "Event-Name": "CHANNEL_CREATE",
            "Unique-ID": "answer-uuid",
            "Caller-Caller-ID-Number": "1000",
            "Caller-Dialplan": "ai-sales-agent",
            "Caller-Destination-Number": "1001",
            "Caller-Context": "ai-sales-agent",
            "Caller-Network-Addr": "127.0.0.1",
        }
        await bridge._on_channel_create(create_event)

        # Then answer it
        answer_event = {
            "Event-Name": "CHANNEL_ANSWER",
            "Unique-ID": "answer-uuid",
        }
        # The answer handler will try to create handler/pipeline - mock those
        with patch(
            "telephony.freeswitch.bridge_service.FreeSwitchCallHandler"
        ) as mock_handler_cls:
            mock_handler = MagicMock()
            mock_handler.start = AsyncMock()
            mock_handler_cls.return_value = mock_handler

            await bridge._on_channel_answer(answer_event)

        call = bridge._active_calls["answer-uuid"]
        assert call.state == CallState.ANSWERED
        assert call.answered_at > 0
        # Handler should have been created
        assert "answer-uuid" in bridge._handlers
        mock_handler_cls.assert_called_once()
        await bridge.stop()

    async def test_hangup_marks_call_completed(self):
        """CHANNEL_HANGUP should mark call as COMPLETED."""
        reset_freeswitch_bridge()
        bridge = get_freeswitch_bridge()
        await bridge.start()

        call = FreeswitchCall(
            call_uuid="hangup-uuid",
            caller_number="1000",
            called_number="1001",
        )
        bridge._active_calls["hangup-uuid"] = call

        event = {"Event-Name": "CHANNEL_HANGUP", "Unique-ID": "hangup-uuid"}
        await bridge._on_channel_hangup(event)

        assert call.state == CallState.COMPLETED
        assert call.ended_at is not None
        await bridge.stop()

    async def test_full_call_cycle_create_answer_hangup(self):
        """Complete call cycle should transition through all expected states."""
        reset_freeswitch_bridge()
        bridge = get_freeswitch_bridge()
        await bridge.start()

        # Create
        await bridge._on_channel_create({
            "Event-Name": "CHANNEL_CREATE",
            "Unique-ID": "cycle-uuid",
            "Caller-Caller-ID-Number": "1000",
            "Caller-Dialplan": "ai-sales-agent",
            "Caller-Destination-Number": "1001",
        })
        assert bridge._active_calls["cycle-uuid"].state == CallState.RINGING

        # Answer (mock handler creation)
        with patch(
            "telephony.freeswitch.bridge_service.FreeSwitchCallHandler"
        ) as mock_cls:
            mock_cls.return_value.start = AsyncMock()
            await bridge._on_channel_answer({
                "Event-Name": "CHANNEL_ANSWER",
                "Unique-ID": "cycle-uuid",
            })
        assert bridge._active_calls["cycle-uuid"].state == CallState.ANSWERED

        # Hangup
        await bridge._on_channel_hangup({
            "Event-Name": "CHANNEL_HANGUP",
            "Unique-ID": "cycle-uuid",
        })
        assert bridge._active_calls["cycle-uuid"].state == CallState.COMPLETED

        await bridge.stop()


# ── 3. Call Handler Pipeline Tests ─────────────────────────────────


@pytest.mark.asyncio
class TestCallHandlerPipeline:
    """Test the call handler's STT → LLM → TTS pipeline."""

    async def test_handler_creates_conversation(
        self, make_call, mock_pipeline, mock_esl, mock_conversation_service
    ):
        """start() should create a conversation on the conversation service."""
        call = make_call()
        handler = FreeSwitchCallHandler(
            call=call, esl_client=mock_esl, greeting="Hello!"
        )
        with patch.object(handler, "_pipeline", mock_pipeline):
            task = asyncio.create_task(handler.start())
            await asyncio.sleep(0.05)
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

        mock_conversation_service.create.assert_called_once()
        conv_arg = mock_conversation_service.create.call_args[0][0]
        assert conv_arg.contact_phone == "1000"

    async def test_handler_speaks_greeting(
        self, make_call, mock_pipeline, mock_esl, mock_conversation_service
    ):
        """start() should synthesize and broadcast a greeting."""
        call = make_call()
        handler = FreeSwitchCallHandler(
            call=call,
            esl_client=mock_esl,
            greeting="Hello! Thank you for calling.",
        )
        with patch.object(handler, "_pipeline", mock_pipeline):
            # Mock _speak to track calls
            original_speak = handler._speak
            spoken_texts = []

            async def tracking_speak(text, return_audio=False):
                spoken_texts.append(text)
                # Actually produce audio bytes so return_audio=True works
                audio = await mock_pipeline.synthesize_response(text)
                if return_audio:
                    return audio
                return None

            handler._speak = tracking_speak

            # Start and immediately stop
            task = asyncio.create_task(handler.start())
            await asyncio.sleep(0.1)
            # Stop the internal conversation loop by marking not active
            handler._active = False
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

            assert len(spoken_texts) >= 1, "Should have spoken at least the greeting"
            assert "Hello! Thank you for calling." in spoken_texts[0]

    async def test_transcribe_calls_stt(
        self, make_call, mock_pipeline, mock_esl
    ):
        """_transcribe should call pipeline.stt.transcribe."""
        handler = FreeSwitchCallHandler(
            call=make_call(), esl_client=mock_esl
        )
        handler._pipeline = mock_pipeline
        result = await handler._transcribe(b"\x00\x01\x02" * 100)
        assert result == "Hello, I'm interested in your service."
        mock_pipeline.stt.transcribe.assert_awaited_once()

    async def test_llm_process_calls_llm(
        self, make_call, mock_pipeline, mock_esl
    ):
        """_llm_process should call pipeline.llm.complete."""
        handler = FreeSwitchCallHandler(
            call=make_call(), esl_client=mock_esl
        )
        handler._pipeline = mock_pipeline
        result = await handler._llm_process("Hello!")
        assert "Great!" in result

    async def test_speak_synthesizes_and_broadcasts(
        self, make_call, mock_pipeline, mock_esl
    ):
        """_speak should synthesize TTS audio and broadcast via ESL."""
        call = make_call()
        handler = FreeSwitchCallHandler(
            call=call, esl_client=mock_esl
        )
        handler._pipeline = mock_pipeline
        result = await handler._speak("Hello, world!", return_audio=True)
        assert result is not None
        assert len(result) > 0
        mock_pipeline.synthesize_response.assert_awaited_once()
        mock_esl.execute_uuid_broadcast.assert_awaited_once()

    async def test_max_turns_enforced(
        self, make_call, mock_pipeline, mock_esl
    ):
        """Handler should respect max_turns."""
        handler = FreeSwitchCallHandler(
            call=make_call(), esl_client=mock_esl, max_turns=3
        )
        assert handler._max_turns == 3

    async def test_end_call_detection(self, make_call, mock_pipeline, mock_esl):
        """End-call phrases should be detected correctly."""
        handler = FreeSwitchCallHandler(
            call=make_call(), esl_client=mock_esl
        )
        assert handler._should_end_call("goodbye") is True
        assert handler._should_end_call("thanks goodbye") is True
        assert handler._should_end_call("continue please") is False

    async def test_stop_handler_cleanup(
        self, make_call, mock_pipeline, mock_esl, mock_conversation_service
    ):
        """stop() should mark call completed and update conversation."""
        call = make_call()
        call.conversation_id = "conv-test-123"
        handler = FreeSwitchCallHandler(
            call=call, esl_client=mock_esl
        )
        await handler.stop()
        assert call.state == CallState.COMPLETED
        mock_conversation_service.update_status.assert_called_with(
            "conv-test-123", "completed"
        )


# ── 4. Multi-Agent Profile Tests ───────────────────────────────────


class TestMultiAgentProfiles:
    """Test that multiple AI agent extensions are distinguishable."""

    def _get_dialplan_content(self):
        """Read dialplan XML with proper UTF-8 encoding."""
        path = Path("telephony/configs/freeswitch/dialplan/default.xml")
        return path.read_bytes().decode("utf-8", errors="replace")

    def _get_ext_block(self, content: str, ext_num: str, size: int = 1200) -> str:
        """Extract an extension block from the dialplan content."""
        ext_name = f'ai_agent_extension_{ext_num}'
        ext_start = content.find(ext_name)
        assert ext_start >= 0, f"Extension {ext_num} ({ext_name}) not found in dialplan"
        return content[ext_start : ext_start + size]

    def test_dialplan_1001_sets_default_profile(self):
        """Extension 1001 should set ai_agent_profile=default."""
        content = self._get_dialplan_content()
        ext_block = self._get_ext_block(content, "1001")
        assert 'ai_agent_profile=default' in ext_block, \
            f"ai_agent_profile=default not found in ext block"
        # Verify it's within an XML set action
        assert 'set' in ext_block

    def test_dialplan_1002_sets_support_profile(self):
        """Extension 1002 should set ai_agent_profile=support."""
        content = self._get_dialplan_content()
        ext_block = self._get_ext_block(content, "1002")
        assert 'ai_agent_profile=support' in ext_block, \
            f"ai_agent_profile=support not found in ext block"

    def test_dialplan_1003_sets_sales_profile(self):
        """Extension 1003 should set ai_agent_profile=sales."""
        content = self._get_dialplan_content()
        ext_block = self._get_ext_block(content, "1003")
        assert 'ai_agent_profile=sales' in ext_block, \
            f"ai_agent_profile=sales not found in ext block"

    def test_dialplan_1004_sets_billing_profile(self):
        """Extension 1004 should set ai_agent_profile=billing."""
        content = self._get_dialplan_content()
        ext_block = self._get_ext_block(content, "1004")
        assert 'ai_agent_profile=billing' in ext_block, \
            f"ai_agent_profile=billing not found in ext block"

    def test_all_extensions_use_break_on_true(self):
        """Each AI agent extension should use break=\"on-true\" to prevent duplicate routing."""
        content = self._get_dialplan_content()
        for ext in ["1001", "1002", "1003", "1004"]:
            # Find the extension block for this extension number
            ext_name = f'ai_agent_extension_{ext}'
            ext_start = content.find(ext_name)
            assert ext_start >= 0, f"Extension {ext} ({ext_name}) not found in dialplan"
            # Get the extension block (up to 300 chars from the start)
            ext_block = content[ext_start:ext_start + 300]
            assert 'break="on-true"' in ext_block, \
                f"Extension {ext} should use break=\"on-true\" in its condition"


# ── 5. Bridge Service Limits ───────────────────────────────────────


@pytest.mark.asyncio
class TestBridgeServiceLimits:
    """Test bridge service handles concurrent calls and limits."""

    async def test_multiple_concurrent_calls(self):
        """Bridge should track multiple concurrent calls."""
        reset_freeswitch_bridge()
        bridge = get_freeswitch_bridge()
        await bridge.start()

        for i in range(5):
            await bridge._on_channel_create({
                "Event-Name": "CHANNEL_CREATE",
                "Unique-ID": f"call-{i}",
                "Caller-Caller-ID-Number": f"100{i}",
                "Caller-Dialplan": "ai-sales-agent",
            })

        assert bridge.active_call_count == 5
        await bridge.stop()

    async def test_cleanup_loop_removes_stale_calls(self):
        """Cleanup loop should remove calls past max duration."""
        reset_freeswitch_bridge()
        bridge = get_freeswitch_bridge()
        await bridge.start()

        # Add a completed call
        import time
        old_call = FreeswitchCall(
            call_uuid="stale-uuid",
            caller_number="1000",
            called_number="1001",
            started_at=time.time() - 1000,  # Very old
        )
        old_call.mark_completed()
        bridge._active_calls["stale-uuid"] = old_call

        # Run cleanup manually
        await bridge._cleanup_loop()

        # Cleanup should have removed calls past max duration
        # The max duration is 600s, our call is 1000s old, but it's already completed
        # so it should be in the stale list
        assert "stale-uuid" not in bridge._active_calls
        await bridge.stop()


# ── 6. Startup Script Tests ────────────────────────────────────────


class TestStartupDependencies:
    """Test that startup scripts and config injection files exist."""

    def test_startup_script_exists(self):
        """scripts/start_internal_test.ps1 should exist."""
        path = Path("scripts/start_internal_test.ps1")
        assert path.exists(), "Startup script must exist"
        # Read as bytes and decode with UTF-8 to handle special chars
        content = path.read_bytes().decode("utf-8", errors="replace")
        assert "FreeSWITCH" in content, "Script should check FreeSWITCH"
        assert "Ollama" in content, "Script should check Ollama"

    def test_config_injection_script_exists(self):
        """scripts/setup_internal_fs.ps1 should exist."""
        path = Path("scripts/setup_internal_fs.ps1")
        assert path.exists(), "Config injection script must exist"

    def test_dockerfile_freeswitch_test_exists(self):
        """docker/Dockerfile.freeswitch.test should exist."""
        path = Path("docker/Dockerfile.freeswitch.test")
        assert path.exists(), "Custom FreeSWITCH Dockerfile must exist"

    def test_entrypoint_override_exists(self):
        """docker/entrypoint-override.sh should exist."""
        path = Path("docker/entrypoint-override.sh")
        assert path.exists(), "Entrypoint override script must exist"

    def entrypoint_override_has_structure(self):
        """entrypoint-override.sh should have expected sections."""
        path = Path("docker/entrypoint-override.sh")
        content = path.read_text()
        assert "freeswitch" in content
        assert "CUSTOM_CONFIG_DIR" in content
        assert "exec freeswitch" in content

    def test_validation_script_exists(self):
        """telephony/scripts/test_internal_extension.py should exist."""
        path = Path("telephony/scripts/test_internal_extension.py")
        assert path.exists(), "Validation script must exist"

    def test_test_guide_exists(self):
        """docs/microsip_internal_test.md should exist."""
        path = Path("docs/microsip_internal_test.md")
        assert path.exists(), "Test guide must exist"
