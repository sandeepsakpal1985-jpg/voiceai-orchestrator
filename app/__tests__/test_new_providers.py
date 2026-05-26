"""
Tests for new self-hosted architecture providers.

Covers:
- GeminiLLMProvider
- OpenRouterLLMProvider
- KokoroTTSProvider
- OpenVoiceTTSProvider
- ToolRegistry (CRM, RAG tools)
- LiveKit room manager
"""

import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from typing import AsyncIterator

from app.providers.base import LLMProvider, TTSProvider
from app.providers.llm import (
    OllamaLLMProvider,
    OpenAILLMProvider,
    GeminiLLMProvider,
    OpenRouterLLMProvider,
)
from app.providers.tts import (
    XTTSTTSProvider,
    KokoroTTSProvider,
    OpenVoiceTTSProvider,
    ElevenLabsTTSProvider,
)
from app.tools.base import ToolDefinition, ToolResult, ToolRegistry, get_tool_registry, reset_tool_registry
from app.tools.crm_tools import register_crm_tools
from app.tools.rag_tool import register_rag_tools
from app.livekit.room_manager import LiveKitRoomManager, get_room_manager


# =============================================================================
# Gemini LLM Provider Tests
# =============================================================================


class TestGeminiLLMProvider:
    @pytest.fixture
    def provider(self):
        return GeminiLLMProvider(
            api_key="test-key",
            model="gemini-2.0-flash",
        )

    def test_provider_properties(self, provider):
        assert provider.provider_name == "gemini"
        assert provider.supports_streaming is True
        assert provider.supports_tool_calling is False

    def test_convert_messages(self, provider):
        messages = [
            {"role": "system", "content": "You are a helpful assistant"},
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
            {"role": "agent", "content": "How can I help?"},
        ]
        contents = provider._convert_messages(messages)
        # System message should be excluded from contents
        assert len(contents) == 3
        # User role should be "user"
        assert contents[0]["role"] == "user"
        # Assistant and agent roles should be "model"
        assert contents[1]["role"] == "model"
        assert contents[2]["role"] == "model"

    def test_extract_system_instruction(self, provider):
        messages = [
            {"role": "system", "content": "You are a helpful assistant"},
            {"role": "user", "content": "Hello"},
        ]
        instruction = provider._extract_system_instruction(messages)
        assert instruction == "You are a helpful assistant"

    def test_extract_system_instruction_none(self, provider):
        messages = [
            {"role": "user", "content": "Hello"},
        ]
        assert provider._extract_system_instruction(messages) is None

    @pytest.mark.asyncio
    async def test_complete_no_api_key(self):
        provider = GeminiLLMProvider(api_key="")
        with pytest.raises(ValueError, match="Gemini API key is not configured"):
            await provider.complete([{"role": "user", "content": "Hello"}])

    @pytest.mark.asyncio
    async def test_complete_connection_error(self, provider):
        with patch("httpx.AsyncClient.post", side_effect=__import__("httpx").ConnectError("No connection")):
            with pytest.raises(ConnectionError, match="Cannot connect to Gemini API"):
                await provider.complete([{"role": "user", "content": "Hello"}])

    def test_provider_name(self, provider):
        assert provider.provider_name == "gemini"


# =============================================================================
# OpenRouter LLM Provider Tests
# =============================================================================


class TestOpenRouterLLMProvider:
    @pytest.fixture
    def provider(self):
        return OpenRouterLLMProvider(
            api_key="test-key",
            model="qwen/qwen-2.5-72b-instruct",
        )

    def test_provider_properties(self, provider):
        assert provider.provider_name == "openrouter"
        assert provider.supports_streaming is True
        assert provider.supports_tool_calling is True

    @pytest.mark.asyncio
    async def test_complete_no_api_key(self):
        provider = OpenRouterLLMProvider(api_key="")
        with pytest.raises(ValueError, match="OpenRouter API key is not configured"):
            await provider.complete([{"role": "user", "content": "Hello"}])

    def test_model_default(self):
        provider = OpenRouterLLMProvider(api_key="test-key")
        assert provider._model == "qwen/qwen-2.5-72b-instruct"

    @pytest.mark.asyncio
    async def test_complete_stream(self, provider):
        """Verify streaming method exists and yields."""
        # Mock the HTTP response
        mock_response = AsyncMock()
        mock_response.status_code = 200

        async def mock_lines():
            yield "data: {\"choices\": [{\"delta\": {\"content\": \"Hello\"}}]}\n"
            yield "data: {\"choices\": [{\"delta\": {\"content\": \" world\"}}]}\n"
            yield "data: [DONE]\n"

        mock_response.aiter_lines = mock_lines

        with patch.object(provider, "_post", return_value=mock_response):
            chunks = []
            async for chunk in provider.complete_stream([{"role": "user", "content": "Hi"}]):
                chunks.append(chunk)

            assert len(chunks) == 2
            assert "".join(chunks) == "Hello world"


# =============================================================================
# Kokoro TTS Provider Tests
# =============================================================================


class TestKokoroTTSProvider:
    @pytest.fixture
    def provider(self):
        return KokoroTTSProvider(voice="default")

    def test_provider_properties(self, provider):
        assert provider.provider_name == "kokoro"
        assert provider.supports_streaming is True

    def test_supported_voices(self, provider):
        voices = provider.supported_voices
        assert len(voices) >= 3
        assert any(v["id"] == "default" for v in voices)

    @pytest.mark.asyncio
    async def test_synthesize_without_model(self, provider):
        """Should raise ImportError if kokoro is not installed."""
        with patch.dict('sys.modules', {'kokoro': None}):
            with pytest.raises(ImportError, match="Kokoro requires the kokoro package"):
                await provider.synthesize("Hello")


# =============================================================================
# OpenVoice TTS Provider Tests
# =============================================================================


class TestOpenVoiceTTSProvider:
    @pytest.fixture
    def provider(self):
        return OpenVoiceTTSProvider(device="cpu")

    def test_provider_properties(self, provider):
        assert provider.provider_name == "openvoice"
        assert provider.supports_streaming is False

    def test_supported_voices(self, provider):
        voices = provider.supported_voices
        assert len(voices) >= 1
        assert any(v["id"] == "cloned" for v in voices)

    @pytest.mark.asyncio
    async def test_set_speaker_sample_nonexistent(self, provider):
        with pytest.raises(FileNotFoundError):
            await provider.set_speaker_sample("/nonexistent/path.wav")

    @pytest.mark.asyncio
    async def test_set_speaker_sample_valid(self, provider, tmp_path):
        audio_file = tmp_path / "sample.wav"
        audio_file.write_text("fake audio data")
        await provider.set_speaker_sample(str(audio_file))
        assert provider._speaker_sample == str(audio_file)

    @pytest.mark.asyncio
    async def test_synthesize_without_model(self, provider):
        """Should raise ImportError if openvoice is not installed."""
        with patch.dict('sys.modules', {'openvoice': None}):
            with pytest.raises(ImportError, match="OpenVoice requires the openvoice package"):
                await provider.synthesize("Hello")


# =============================================================================
# Tool Registry Tests
# =============================================================================


class TestToolDefinition:
    def test_tool_creation(self):
        def handler(name: str) -> str:
            return f"Hello {name}"

        tool = ToolDefinition(
            name="greet",
            description="Greet someone",
            parameters={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Name to greet"}
                },
                "required": ["name"],
            },
            handler=handler,
        )
        assert tool.name == "greet"
        assert tool.description == "Greet someone"
        assert tool.strict is False


class TestToolResult:
    def test_success_result(self):
        result = ToolResult(success=True, output="Done", tool_name="test")
        assert result.success is True
        assert result.output == "Done"
        assert result.error is None

    def test_error_result(self):
        result = ToolResult(success=False, output="", tool_name="test", error="Something broke")
        assert result.success is False
        assert result.error == "Something broke"


class TestToolRegistry:
    @pytest.fixture
    def registry(self):
        reset_tool_registry()
        reg = get_tool_registry()
        yield reg
        reset_tool_registry()

    def test_register_and_get(self, registry):
        def handler():
            return "done"

        tool = ToolDefinition(
            name="test_tool",
            description="A test tool",
            parameters={"type": "object", "properties": {}},
            handler=handler,
        )
        registry.register("test_tool", tool)

        assert registry.get("test_tool") is tool
        assert registry.get("nonexistent") is None

    def test_list_tools(self, registry):
        assert registry.list_tools() == []

        def handler():
            return "done"

        registry.register(
            "tool_a",
            ToolDefinition(name="tool_a", description="A", parameters={}, handler=handler),
        )
        registry.register(
            "tool_b",
            ToolDefinition(name="tool_b", description="B", parameters={}, handler=handler),
        )

        tools = registry.list_tools()
        assert "tool_a" in tools
        assert "tool_b" in tools
        assert len(tools) == 2

    def test_unregister(self, registry):
        def handler():
            return "done"

        registry.register(
            "test_tool",
            ToolDefinition(name="test_tool", description="A", parameters={}, handler=handler),
        )
        registry.unregister("test_tool")
        assert registry.get("test_tool") is None

    def test_get_openai_format(self, registry):
        def handler():
            return "done"

        registry.register(
            "my_tool",
            ToolDefinition(
                name="my_tool",
                description="My tool",
                parameters={"type": "object", "properties": {}},
                handler=handler,
            ),
        )

        tools = registry.get_openai_format()
        assert len(tools) == 1
        assert tools[0]["type"] == "function"
        assert tools[0]["function"]["name"] == "my_tool"

    @pytest.mark.asyncio
    async def test_execute_sync_handler(self, registry):
        def add(a: int, b: int) -> str:
            return str(a + b)

        registry.register(
            "add",
            ToolDefinition(
                name="add",
                description="Add two numbers",
                parameters={
                    "type": "object",
                    "properties": {
                        "a": {"type": "integer"},
                        "b": {"type": "integer"},
                    },
                    "required": ["a", "b"],
                },
                handler=add,
            ),
        )

        result = await registry.execute("add", {"a": 3, "b": 4})
        assert result.success is True
        assert result.output == "7"

    @pytest.mark.asyncio
    async def test_execute_nonexistent_tool(self, registry):
        result = await registry.execute("nonexistent", {})
        assert result.success is False
        assert "not found" in result.error

    @pytest.mark.asyncio
    async def test_execute_handler_error(self, registry):
        def failing():
            raise ValueError("Boom")

        registry.register(
            "failing",
            ToolDefinition(name="failing", description="Fails", parameters={}, handler=failing),
        )

        result = await registry.execute("failing", {})
        assert result.success is False
        assert "Boom" in result.error

    @pytest.mark.asyncio
    async def test_execute_tool_calls(self, registry):
        def greet(name: str) -> str:
            return f"Hello {name}"

        registry.register(
            "greet",
            ToolDefinition(
                name="greet",
                description="Greet someone",
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Name"}
                    },
                    "required": ["name"],
                },
                handler=greet,
            ),
        )

        tool_calls = [
            {
                "id": "call_1",
                "function": {
                    "name": "greet",
                    "arguments": '{"name": "World"}',
                },
            }
        ]

        result = await registry.execute_tool_calls(tool_calls)
        data = json.loads(result)
        assert len(data["tool_results"]) == 1
        assert "Hello World" in data["tool_results"][0]["result"]


class TestCRMTools:
    @pytest.fixture
    def registry(self):
        reset_tool_registry()
        reg = get_tool_registry()
        register_crm_tools()
        yield reg
        reset_tool_registry()

    def test_crm_tools_registered(self, registry):
        tools = registry.list_tools()
        assert "lookup_contact" in tools
        assert "get_contact_history" in tools
        assert "update_contact_notes" in tools

    @pytest.mark.asyncio
    async def test_lookup_contact(self, registry):
        result = await registry.execute("lookup_contact", {"name": "John"})
        assert result.success is True
        assert isinstance(result.output, str)

    @pytest.mark.asyncio
    async def test_update_contact_notes(self, registry):
        result = await registry.execute(
            "update_contact_notes",
            {"contact_phone": "+1234567890", "notes": "Called about billing"},
        )
        assert result.success is True
        assert "Notes added" in result.output


class TestRAGTools:
    @pytest.fixture
    def registry(self):
        reset_tool_registry()
        reg = get_tool_registry()
        register_rag_tools()
        yield reg
        reset_tool_registry()

    def test_rag_tool_registered(self, registry):
        tools = registry.list_tools()
        assert "search_knowledge_base" in tools

    @pytest.mark.asyncio
    async def test_search_knowledge_base(self, registry):
        result = await registry.execute(
            "search_knowledge_base",
            {"query": "What are your business hours?", "top_k": 3},
        )
        assert result.success is True
        assert isinstance(result.output, str)


# =============================================================================
# LiveKit Room Manager Tests
# =============================================================================


class TestLiveKitRoomManager:
    @pytest.fixture
    def manager(self):
        return LiveKitRoomManager()

    def test_empty_on_start(self, manager):
        assert manager.get_active_count() == 0
        assert manager.get_active_sessions() == []

    @pytest.mark.asyncio
    async def test_create_room(self, manager):
        session = await manager.create_room(
            participant_identity="user-1",
            room_name="test-room",
        )
        assert session.session_id is not None
        assert session.room_name == "test-room"
        assert session.participant_identity == "user-1"
        assert session.status == "active"

    @pytest.mark.asyncio
    async def test_create_room_auto_generates_name(self, manager):
        session = await manager.create_room(
            participant_identity="user-1",
        )
        assert session.room_name.startswith("voiceai-")

    @pytest.mark.asyncio
    async def test_get_session(self, manager):
        session = await manager.create_room(
            participant_identity="user-1",
            room_name="room-1",
        )
        retrieved = manager.get_session(session.session_id)
        assert retrieved is not None
        assert retrieved.session_id == session.session_id

    @pytest.mark.asyncio
    async def test_get_session_by_room(self, manager):
        session = await manager.create_room(
            participant_identity="user-1",
            room_name="room-1",
        )
        retrieved = manager.get_session_by_room("room-1")
        assert retrieved is not None
        assert retrieved.session_id == session.session_id

    @pytest.mark.asyncio
    async def test_end_session(self, manager):
        session = await manager.create_room(
            participant_identity="user-1",
            room_name="room-1",
        )
        await manager.end_session(session.session_id)

        updated = manager.get_session(session.session_id)
        assert updated.status == "ended"

    @pytest.mark.asyncio
    async def test_get_active_sessions(self, manager):
        s1 = await manager.create_room(participant_identity="user-1")
        s2 = await manager.create_room(participant_identity="user-2")

        assert manager.get_active_count() == 2

        await manager.end_session(s1.session_id)
        assert manager.get_active_count() == 1

    @pytest.mark.asyncio
    async def test_cleanup_stale_sessions(self, manager):
        import time
        session = await manager.create_room(participant_identity="user-1")
        await manager.end_session(session.session_id)

        # Should not clean up recent sessions
        cleaned = await manager.cleanup_stale_sessions(max_age=3600)
        assert cleaned == 0

        # Mock the session to be old
        session.created_at = time.time() - 7200  # 2 hours ago
        cleaned = await manager.cleanup_stale_sessions(max_age=3600)
        assert cleaned == 1

    def test_get_active_count_zero(self, manager):
        assert manager.get_active_count() == 0

    @pytest.mark.asyncio
    async def test_session_metadata(self, manager):
        session = await manager.create_room(
            participant_identity="user-1",
            metadata={"source": "browser", "campaign": "test"},
        )
        assert session.metadata["source"] == "browser"
        assert session.metadata["campaign"] == "test"


# =============================================================================
# LiveKit Audio Bridge Tests
# =============================================================================


class TestLiveKitAudioBridge:
    """Test audio bridge between LiveKit frames and voice pipeline bytes."""

    @pytest.fixture
    def bridge(self):
        from app.livekit.audio_bridge import LiveKitAudioBridge
        return LiveKitAudioBridge(sample_rate=16000, num_channels=1)

    def test_initial_state(self, bridge):
        assert bridge.sample_rate == 16000
        assert bridge.num_channels == 1

    def test_feed_and_drain(self, bridge):
        bridge.feed_audio(b"\x00\x01" * 100)
        bridge.feed_audio(b"\x02\x03" * 100)
        data = bridge.drain_buffer()
        assert data is not None
        assert len(data) == 400
        # Buffer should be empty after drain
        assert bridge.drain_buffer() is None

    def test_drain_empty(self, bridge):
        assert bridge.drain_buffer() is None

    def test_reset(self, bridge):
        bridge.feed_audio(b"\x00" * 1000)
        assert bridge.drain_buffer() is not None
        bridge.reset()
        assert bridge.drain_buffer() is None

    def test_frame_to_bytes_empty(self, bridge):
        """Frame without data attribute should return empty bytes."""
        result = bridge.frame_to_bytes(object())
        assert result == b""

    def test_frame_to_bytes_with_numpy(self, bridge):
        """Frame with numpy array data should convert correctly."""
        import numpy as np

        mock_frame = type('Frame', (), {'data': np.array([0, 100, -100, 32767], dtype=np.int16)})()
        result = bridge.frame_to_bytes(mock_frame)
        assert len(result) == 8  # 4 samples * 2 bytes

    def test_bytes_to_frame_missing_livekit(self, bridge):
        """Should return None if livekit SDK not available."""
        with patch.dict('sys.modules', {'livekit': None}):
            result = bridge.bytes_to_frame(b"\x00" * 100)
            assert result is None


# =============================================================================
# LiveKit Agent Worker Tests
# =============================================================================


class TestLiveKitAgentWorker:
    @pytest.fixture
    def worker(self):
        from app.livekit.agent_worker import LiveKitAgentWorker
        return LiveKitAgentWorker()

    def test_initial_state(self, worker):
        assert worker.is_running is False
        assert worker.conversation_id is None

    def test_stop(self, worker):
        worker.stop()
        assert worker.is_running is False

    @pytest.mark.asyncio
    async def test_run_import_error(self, worker):
        """Should handle missing livekit package gracefully."""
        with patch.dict('sys.modules', {'livekit.rtc': None}):
            await worker.run(
                room_name="test-room",
                participant_identity="test-user",
            )
            assert worker.is_running is False

    @pytest.mark.asyncio
    async def test_run_connection_error(self, worker):
        """Should handle connection errors gracefully."""
        with patch('builtins.__import__', side_effect=ImportError('no livekit')):
            await worker.run(
                room_name="test-room",
                participant_identity="test-user",
            )
            assert worker.is_running is False


# =============================================================================
# LiveKit Worker Server Tests
# =============================================================================


class TestLiveKitWorkerServer:
    def test_health_endpoint(self):
        """Verify the worker server FastAPI app can be created."""
        from app.livekit.worker_server import worker_app
        assert worker_app.title == "VoiceAI LiveKit Worker"
        assert worker_app.version is not None

    def test_routes_exist(self):
        from app.livekit.worker_server import worker_app
        routes = [r.path for r in worker_app.routes]
        assert "/health" in routes
        assert "/sessions/active" in routes
        assert "/sessions/start" in routes


# =============================================================================
# Provider Registration Order Tests
# =============================================================================


class TestProviderRegistration:
    """Verify that local-first providers are available when importing app.providers.llm and app.providers.tts."""

    def test_llm_providers_imported(self):
        """Verify all LLM providers can be imported."""
        from app.providers.llm import (
            OllamaLLMProvider,
            OpenAILLMProvider,
            GeminiLLMProvider,
            OpenRouterLLMProvider,
        )

        assert OllamaLLMProvider is not None
        assert OpenAILLMProvider is not None
        assert GeminiLLMProvider is not None
        assert OpenRouterLLMProvider is not None

    def test_tts_providers_imported(self):
        """Verify all TTS providers can be imported."""
        from app.providers.tts import (
            XTTSTTSProvider,
            KokoroTTSProvider,
            OpenVoiceTTSProvider,
            ElevenLabsTTSProvider,
        )

        assert XTTSTTSProvider is not None
        assert KokoroTTSProvider is not None
        assert OpenVoiceTTSProvider is not None
        assert ElevenLabsTTSProvider is not None

    def test_local_providers_listed_first_in_init(self):
        """Verify local providers are listed first in __init__.py exports."""
        from app.providers.llm import __all__ as llm_exports
        assert llm_exports[0].startswith("Ollama"), f"Expected Ollama first, got {llm_exports[0]}"

        from app.providers.tts import __all__ as tts_exports
        assert tts_exports[0].startswith("K"), f"Expected Kokoro first (local-first priority), got {tts_exports[0]}"
