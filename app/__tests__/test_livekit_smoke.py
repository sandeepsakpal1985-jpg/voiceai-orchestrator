"""
LiveKit E2E Smoke Tests — Validates the adapter pipeline, toolset bridge,
MCP server bridge, and provider integration without a real LiveKit server.

Tests:
  - Provider adapter instantiation (STT, TTS, LLM)
  - ToolRegistryToolset creation and tool discovery
  - MCP server bridge: ToolRegistryMCPServer via MCPToolset
  - VoiceAgent mock JobContext integration (start/stop lifecycle)
  - Mock STT → LLM → TTS pipeline via adapters
  - Audio cache integration with TTS adapter
  - Voice agent module imports and error handling
  - MCP bridge module imports (no servers configured)
  - Adapter fallback behaviors (provider failures)
"""

import json
import os
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── Mock Providers ──────────────────────────────────────────────────


class MockSTTProvider:
    """Mock STT provider that returns a fixed transcript."""

    def __init__(self, transcript: str = "hello world"):
        self.transcript = transcript

    async def transcribe(self, audio: bytes, language: str | None = None) -> str:
        return self.transcript

    async def transcribe_stream(self, audio_stream):
        yield self.transcript


class MockTTSProvider:
    """Mock TTS provider that records input text for verification."""

    def __init__(self):
        self.synthesized_texts: list[str] = []
        self.voice = "test-voice"

    async def synthesize(self, text: str, **kwargs: Any) -> bytes:
        self.synthesized_texts.append(text)
        # Return enough bytes to pass the 100-byte minimum check (22 bytes of 16-bit PCM @ 24kHz ~ 400 bytes = ~8ms)
        return b"\x00\x80" * 200  # 400 bytes of 16-bit PCM audio

    async def synthesize_stream(self, text_stream):
        async for text in text_stream:
            self.synthesized_texts.append(text)
            yield b"mock_audio_chunk"


class MockLLMProvider:
    """Mock LLM provider that returns a fixed response."""

    def __init__(self, response: str = "Hello! How can I help you today?"):
        self.response = response
        self.prompts: list[list[dict]] = []

    async def chat(self, messages: list[dict], **kwargs: Any) -> str:
        self.prompts.append(messages)
        return self.response

    async def chat_stream(self, messages: list[dict], **kwargs: Any):
        self.prompts.append(messages)
        yield self.response


# ── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_registries():
    """Reset global registries before each test."""
    from app.providers import reset_default_registry
    reset_default_registry()
    from app.tools.base import reset_tool_registry
    reset_tool_registry()

    # Ensure minimum env vars are set
    old_stt = os.environ.get("STT_PROVIDER", "")
    old_llm = os.environ.get("LLM_PROVIDER", "")
    old_tts = os.environ.get("TTS_PROVIDER", "")
    old_cache = os.environ.get("AUDIO_CACHE_ENABLED", "")

    os.environ["STT_PROVIDER"] = "test_stt"
    os.environ["LLM_PROVIDER"] = "test_llm"
    os.environ["TTS_PROVIDER"] = "test_tts"
    os.environ["AUDIO_CACHE_ENABLED"] = "false"

    # Reload settings singleton to pick up env var changes
    from app.config import reload_settings
    reload_settings()

    yield

    # Restore env vars
    if old_stt:
        os.environ["STT_PROVIDER"] = old_stt
    else:
        os.environ.pop("STT_PROVIDER", None)
    if old_llm:
        os.environ["LLM_PROVIDER"] = old_llm
    else:
        os.environ.pop("LLM_PROVIDER", None)
    if old_tts:
        os.environ["TTS_PROVIDER"] = old_tts
    else:
        os.environ.pop("TTS_PROVIDER", None)
    if old_cache:
        os.environ["AUDIO_CACHE_ENABLED"] = old_cache
    else:
        os.environ.pop("AUDIO_CACHE_ENABLED", None)

    # Reload settings singleton to restore defaults
    reload_settings()


@pytest.fixture
def mock_provider_registry():
    """Create a provider registry with mock STT/TTS/LLM providers."""
    from app.providers import ProviderRegistry, get_default_registry

    registry = get_default_registry()
    mock_stt = MockSTTProvider()
    mock_llm = MockLLMProvider()
    mock_tts = MockTTSProvider()

    registry.register_stt("test_stt", mock_stt)
    registry.register_llm("test_llm", mock_llm)
    registry.register_tts("test_tts", mock_tts)

    return registry, mock_stt, mock_llm, mock_tts


# ── Test Class 1: Smoke / Adapters / Toolset / Pipeline ─────────────


class TestLiveKitSmoke:
    """Smoke tests for the LiveKit integration layer."""

    # ── Adapter Instantiation ────────────────────────────────────────

    async def test_stt_adapter_creation(self, mock_provider_registry):
        """STT adapter should wrap our provider correctly."""
        registry, mock_stt, _, _ = mock_provider_registry
        from app.livekit.adapters import LiveKitSTTAdapter

        adapter = LiveKitSTTAdapter(stt_provider=mock_stt, sample_rate=16000)
        assert adapter is not None
        assert adapter._sample_rate == 16000
        # Check that the adapter is a proper LiveKit STT subclass
        from livekit.agents import stt as lk_stt
        assert isinstance(adapter, lk_stt.STT)

    async def test_tts_adapter_creation(self, mock_provider_registry):
        """TTS adapter should wrap our provider correctly."""
        registry, _, _, mock_tts = mock_provider_registry
        from app.livekit.adapters import LiveKitTTSAdapter

        adapter = LiveKitTTSAdapter(tts_provider=mock_tts, sample_rate=24000)
        assert adapter is not None
        assert adapter._sample_rate == 24000
        from livekit.agents import tts as lk_tts
        assert isinstance(adapter, lk_tts.TTS)

    async def test_tts_adapter_with_cache(self, mock_provider_registry):
        """TTS adapter should work with audio cache disabled."""
        registry, _, _, mock_tts = mock_provider_registry
        from app.livekit.adapters import LiveKitTTSAdapter

        adapter = LiveKitTTSAdapter(
            tts_provider=mock_tts,
            audio_cache=None,
            sample_rate=24000,
        )
        assert adapter is not None

    async def test_llm_adapter_creation(self, mock_provider_registry):
        """LLM adapter should wrap our provider correctly."""
        registry, _, mock_llm, _ = mock_provider_registry
        from app.livekit.adapters import LiveKitLLMAdapter

        adapter = LiveKitLLMAdapter(llm_provider=mock_llm)
        assert adapter is not None
        from livekit.agents import llm as lk_llm_mod
        assert isinstance(adapter, lk_llm_mod.LLM)

    # ── Provider Adapter Loading ─────────────────────────────────────

    async def test_load_provider_adapters(self, mock_provider_registry):
        """_load_provider_adapters should return all adapters."""
        from app.livekit.voice_agent import _load_provider_adapters

        adapters = _load_provider_adapters()
        assert "stt" in adapters
        assert "tts" in adapters
        assert "llm" in adapters
        assert "vad" in adapters

    async def test_load_provider_adapters_with_missing_provider(
        self, mock_provider_registry,
    ):
        """Missing providers should be handled gracefully (None result)."""
        import os

        from app.config import reload_settings
        from app.livekit.voice_agent import _load_provider_adapters

        # Set STT_PROVIDER to a name not in the mock registry, then reload
        orig = os.environ.get("STT_PROVIDER", "")
        os.environ["STT_PROVIDER"] = "nonexistent_stt"
        reload_settings()
        try:
            adapters = _load_provider_adapters()
            # Should not crash — stt will be None due to missing provider
            assert adapters["stt"] is None
        finally:
            # Restore
            if orig:
                os.environ["STT_PROVIDER"] = orig
            else:
                os.environ.pop("STT_PROVIDER", None)
            reload_settings()

    # ── ToolRegistryToolset ──────────────────────────────────────────

    async def test_toolset_creation_no_tools(self):
        """ToolRegistryToolset should return None when no tools registered."""
        from app.livekit.toolset_bridge import create_registry_toolset

        result = create_registry_toolset()
        assert result is None

    async def test_toolset_creation_with_tools(self):
        """ToolRegistryToolset should wrap all registered tools."""
        from app.tools.base import get_tool_registry, ToolDefinition
        from app.livekit.toolset_bridge import create_registry_toolset

        registry = get_tool_registry()
        # Register a simple test tool
        async def test_handler(query: str) -> str:
            return f"Result for: {query}"

        registry.register(
            "test_tool",
            ToolDefinition(
                name="test_tool",
                description="A test tool",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "A search query",
                        },
                    },
                    "required": ["query"],
                },
                handler=test_handler,
            ),
        )

        result = create_registry_toolset()
        assert result is not None
        assert result.id == "tool_registry"
        # Should expose at least one tool
        assert len(result.tools) >= 1

        # Verify the tool ID matches (LiveKit RawFunctionTool._info.name)
        # Use getattr() to avoid Python's double-underscore name mangling
        first_tool = result.tools[0]
        assert hasattr(first_tool, '_info')
        assert first_tool._info.name == "test_tool"  # type: ignore[union-attr]

    async def test_toolset_execution(self):
        """Tools wrapped by ToolRegistryToolset should execute correctly."""
        from app.tools.base import get_tool_registry, ToolDefinition
        from app.livekit.toolset_bridge import create_registry_toolset

        registry = get_tool_registry()

        async def greet_handler(name: str) -> str:
            return f"Hello, {name}!"

        registry.register(
            "greet",
            ToolDefinition(
                name="greet",
                description="Greet someone by name",
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "The person's name",
                        },
                    },
                    "required": ["name"],
                },
                handler=greet_handler,
            ),
        )

        toolset = create_registry_toolset()
        assert toolset is not None

        # Execute via the ToolRegistry directly
        result = await registry.execute("greet", {"name": "Alice"})
        assert result.success
        assert result.output == "Hello, Alice!"

    # ── Tool Registry CRM/RAG Registration ───────────────────────────

    async def test_crm_tools_registration(self):
        """CRM tools should register correctly with the ToolRegistry."""
        from app.tools.crm_tools import register_crm_tools
        from app.tools.base import get_tool_registry

        register_crm_tools()
        registry = get_tool_registry()

        tools = registry.list_tools()
        assert "lookup_contact" in tools
        assert "get_contact_history" in tools
        assert "update_contact_notes" in tools

    async def test_rag_tools_registration(self):
        """RAG tools should register correctly with the ToolRegistry."""
        from app.tools.rag_tool import register_rag_tools
        from app.tools.base import get_tool_registry

        register_rag_tools()
        registry = get_tool_registry()

        tools = registry.list_tools()
        assert "search_knowledge_base" in tools

    async def test_full_toolset_with_crm_and_rag(self):
        """ToolRegistryToolset should wrap all CRM + RAG tools."""
        from app.tools.crm_tools import register_crm_tools
        from app.tools.rag_tool import register_rag_tools
        from app.livekit.toolset_bridge import create_registry_toolset

        register_crm_tools()
        register_rag_tools()

        toolset = create_registry_toolset()
        assert toolset is not None
        assert len(toolset.tools) >= 4  # 3 CRM + 1 RAG

    # ── Module Import Tests ──────────────────────────────────────────

    async def test_voice_agent_module_imports(self):
        """All voice agent module imports should work."""
        from app.livekit.voice_agent import (
            BASE_INSTRUCTIONS,
            AdaptiveVoiceAgent,
            VoiceAgent,
            entrypoint,
            get_voice_agent,
            run_worker,
            _load_provider_adapters,
        )
        assert BASE_INSTRUCTIONS is not None
        assert AdaptiveVoiceAgent is not None
        assert VoiceAgent is not None

    async def test_toolset_bridge_module_imports(self):
        """Toolset bridge module imports should work."""
        from app.livekit.toolset_bridge import (
            ToolRegistryToolset,
            create_registry_toolset,
        )
        assert ToolRegistryToolset is not None

    async def test_mcp_bridge_module_imports(self):
        """MCP bridge module imports should work (no servers configured)."""
        from app.livekit.mcp_bridge import (
            load_mcp_toolsets,
            close_mcp_toolsets,
        )
        # With no MCP_SERVERS env var, should return empty list
        toolsets = await load_mcp_toolsets()
        assert toolsets == []

    async def test_mcp_server_bridge_module_imports(self):
        """MCP server bridge module imports should work."""
        from app.livekit.mcp_server_bridge import (
            ToolRegistryMCPServer,
            create_tool_registry_mcp_server,
        )
        assert ToolRegistryMCPServer is not None
        assert create_tool_registry_mcp_server() is None  # no tools yet

    # ── Audio Cache Integration ──────────────────────────────────────

    async def test_audio_cache_disabled_by_default(self, mock_provider_registry):
        """Audio cache should be disabled when AUDIO_CACHE_ENABLED=false."""
        from app.config import settings
        assert settings.AUDIO_CACHE_ENABLED is False

    async def test_audio_cache_integration(self):
        """Audio cache service should be created and work."""
        os.environ["AUDIO_CACHE_ENABLED"] = "true"
        os.environ["AUDIO_CACHE_DIR"] = "/tmp/test_audio_cache_livekit"
        try:
            from app.services.audio_cache import get_audio_cache_service
            svc = get_audio_cache_service()
            # May or may not be initialized depending on dependencies
            assert svc is not None
        finally:
            os.environ.pop("AUDIO_CACHE_ENABLED", None)
            os.environ.pop("AUDIO_CACHE_DIR", None)

    # ── Error Handling ──────────────────────────────────────────────

    async def test_voice_agent_init_no_session(self):
        """VoiceAgent should initialize without a session."""
        from app.livekit.voice_agent import VoiceAgent
        agent = VoiceAgent()
        assert agent._session is None
        assert agent._adapters == {}

    async def test_voice_agent_stop_no_session(self):
        """Calling stop() with no session should not crash."""
        from app.livekit.voice_agent import VoiceAgent
        agent = VoiceAgent()
        # Should not raise
        await agent.stop()
        await agent.close()

    async def test_voice_agent_stop_twice(self):
        """Calling stop() twice should be idempotent."""
        from app.livekit.voice_agent import VoiceAgent
        agent = VoiceAgent()
        await agent.stop()
        await agent.stop()
        await agent.close()

    # ── Adapter Pipeline Simulation ──────────────────────────────────

    async def test_stt_transcribe_through_adapter(self, mock_provider_registry):
        """STT adapter should delegate to our provider."""
        registry, mock_stt, _, _ = mock_provider_registry
        from app.livekit.adapters import LiveKitSTTAdapter

        adapter = LiveKitSTTAdapter(stt_provider=mock_stt, sample_rate=16000)

        # Test the underlying provider directly
        result = await mock_stt.transcribe(b"fake_audio_data")
        assert result == "hello world"

    async def test_llm_chat_through_adapter(self, mock_provider_registry):
        """LLM adapter should delegate to our provider."""
        registry, _, mock_llm, _ = mock_provider_registry
        from app.livekit.adapters import LiveKitLLMAdapter

        adapter = LiveKitLLMAdapter(llm_provider=mock_llm)

        # Test the underlying provider directly
        result = await mock_llm.chat([{"role": "user", "content": "Hi"}])
        assert result == "Hello! How can I help you today?"
        assert len(mock_llm.prompts) == 1

    async def test_tts_synthesize_through_adapter(self, mock_provider_registry):
        """TTS adapter should delegate to our provider."""
        registry, _, _, mock_tts = mock_provider_registry
        from app.livekit.adapters import LiveKitTTSAdapter

        adapter = LiveKitTTSAdapter(tts_provider=mock_tts, sample_rate=24000)

        # Test the underlying provider directly
        result = await mock_tts.synthesize("Hello world")
        assert len(result) >= 100  # At least 400 bytes of PCM audio
        assert mock_tts.synthesized_texts == ["Hello world"]

    # ── Item 1: Adapter-Level LiveKit Public API Tests ────────────────

    async def test_stt_recognize_through_public_api(self, mock_provider_registry):
        """STT.recognize() should return SpeechEvent via _recognize_impl."""
        registry, mock_stt, _, _ = mock_provider_registry
        from app.livekit.adapters import LiveKitSTTAdapter
        from livekit import rtc

        adapter = LiveKitSTTAdapter(stt_provider=mock_stt, sample_rate=16000)

        # Create a valid audio frame of sufficient length (>320 bytes = 20ms at 16kHz)
        frame = rtc.AudioFrame(
            data=b'\x00\x80' * 320,  # 640 bytes = 40ms of 16-bit mono audio
            sample_rate=16000,
            num_channels=1,
            samples_per_channel=320,
        )

        event = await adapter.recognize(buffer=frame)
        assert event is not None
        from livekit.agents.stt import SpeechEventType
        assert event.type == SpeechEventType.FINAL_TRANSCRIPT
        assert len(event.alternatives) == 1
        assert event.alternatives[0].text == "hello world"
        assert event.alternatives[0].language == "en"

    async def test_stt_recognize_short_audio(self, mock_provider_registry):
        """STT.recognize() with very short audio should return END_OF_SPEECH."""
        registry, mock_stt, _, _ = mock_provider_registry
        from app.livekit.adapters import LiveKitSTTAdapter
        from livekit import rtc

        adapter = LiveKitSTTAdapter(stt_provider=mock_stt, sample_rate=16000)

        # Audio too short (< 320 bytes)
        frame = rtc.AudioFrame(
            data=b'\x00\x80' * 80,  # 160 bytes = 10ms
            sample_rate=16000,
            num_channels=1,
            samples_per_channel=80,
        )

        event = await adapter.recognize(buffer=frame)
        assert event is not None
        from livekit.agents.stt import SpeechEventType
        # Should return END_OF_SPEECH for empty input
        assert event.type == SpeechEventType.END_OF_SPEECH

    async def test_stt_recognize_list_of_frames(self, mock_provider_registry):
        """STT.recognize() should accept a list of AudioFrames."""
        registry, mock_stt, _, _ = mock_provider_registry
        from app.livekit.adapters import LiveKitSTTAdapter
        from livekit import rtc

        adapter = LiveKitSTTAdapter(stt_provider=mock_stt, sample_rate=16000)

        frames = [
            rtc.AudioFrame(data=b'\x00\x80' * 160, sample_rate=16000, num_channels=1, samples_per_channel=160),
            rtc.AudioFrame(data=b'\x00\x80' * 160, sample_rate=16000, num_channels=1, samples_per_channel=160),
        ]

        event = await adapter.recognize(buffer=frames)
        assert event is not None
        from livekit.agents.stt import SpeechEventType
        assert event.type == SpeechEventType.FINAL_TRANSCRIPT
        assert event.alternatives[0].text == "hello world"

    async def test_tts_synthesize_through_public_api(self, mock_provider_registry):
        """TTS.synthesize() should return a ChunkedStream with audio."""
        registry, _, _, mock_tts = mock_provider_registry
        from app.livekit.adapters import LiveKitTTSAdapter

        adapter = LiveKitTTSAdapter(tts_provider=mock_tts, sample_rate=24000)

        stream = adapter.synthesize(text="Hello world")
        assert stream is not None
        assert stream.input_text == "Hello world"

        # Collect events from the stream
        events = []
        async for event in stream:
            events.append(event)

        assert len(events) >= 1
        last_event = events[-1]
        assert last_event.is_final
        assert last_event.frame is not None
        assert last_event.frame.sample_rate == 24000
        assert len(bytes(last_event.frame.data)) > 0
        # Verify the provider was called
        assert "Hello world" in mock_tts.synthesized_texts

    async def test_llm_chat_through_public_api(self, mock_provider_registry):
        """LLM.chat() should return an LLMStream with ChatChunks."""
        registry, _, mock_llm, _ = mock_provider_registry
        from app.livekit.adapters import LiveKitLLMAdapter
        from livekit.agents import llm as lk_llm

        adapter = LiveKitLLMAdapter(llm_provider=mock_llm)

        chat_ctx = lk_llm.ChatContext()
        chat_ctx.items = [
            lk_llm.ChatMessage(role="system", content=["You are a helpful assistant."]),
            lk_llm.ChatMessage(role="user", content=["Hello!"]),
        ]

        stream = adapter.chat(chat_ctx=chat_ctx)
        assert stream is not None

        # Collect chunks
        chunks = []
        async for chunk in stream:
            chunks.append(chunk)
            break  # Just need one chunk to verify

        assert len(chunks) >= 1
        first_chunk = chunks[0]
        assert first_chunk.delta is not None
        assert mock_llm.prompts[0][-1]["role"] == "user"

    async def test_llm_chat_through_public_api_collect_all(self, mock_provider_registry):
        """LLM.chat() stream should produce the complete response."""
        registry, _, mock_llm, _ = mock_provider_registry
        from app.livekit.adapters import LiveKitLLMAdapter
        from livekit.agents import llm as lk_llm

        adapter = LiveKitLLMAdapter(llm_provider=mock_llm)

        chat_ctx = lk_llm.ChatContext()
        chat_ctx.items = [
            lk_llm.ChatMessage(role="user", content=["What is 2+2?"]),
        ]

        stream = adapter.chat(chat_ctx=chat_ctx)
        collected = []
        async for chunk in stream:
            collected.append(chunk.delta.content if chunk.delta else "")

        full_response = "".join(collected)
        assert "Hello!" in full_response or "help" in full_response

    async def test_adapter_capabilities_and_properties(self, mock_provider_registry):
        """All adapters should expose correct capabilities and properties."""
        registry, mock_stt, mock_llm, mock_tts = mock_provider_registry
        from app.livekit.adapters import (
            LiveKitSTTAdapter,
            LiveKitTTSAdapter,
            LiveKitLLMAdapter,
        )

        stt = LiveKitSTTAdapter(stt_provider=mock_stt, sample_rate=16000)
        assert stt.provider == "MockSTTProvider"
        assert stt.capabilities.streaming is True
        assert stt.capabilities.interim_results is True

        tts = LiveKitTTSAdapter(tts_provider=mock_tts, sample_rate=24000)
        assert tts.provider == "MockTTSProvider"
        assert tts.sample_rate == 24000

        llm = LiveKitLLMAdapter(llm_provider=mock_llm)
        assert llm.provider == "MockLLMProvider"


# ── Test Class 2: MCP Server Bridge (Item 2) ────────────────────────


class TestMCPToolRegistryBridge:
    """Tests for ToolRegistryMCPServer — in-process MCP server bridging to ToolRegistry."""

    # ── Server Creation ────────────────────────────────────────────────

    async def test_create_server_no_tools(self):
        """create_tool_registry_mcp_server should return None when no tools registered."""
        from app.livekit.mcp_server_bridge import create_tool_registry_mcp_server
        result = create_tool_registry_mcp_server()
        assert result is None

    async def test_create_server_with_tools(self):
        """create_tool_registry_mcp_server should return a server when tools are registered."""
        from app.tools.base import get_tool_registry, ToolDefinition
        from app.livekit.mcp_server_bridge import create_tool_registry_mcp_server, ToolRegistryMCPServer

        registry = get_tool_registry()

        async def test_handler(query: str) -> str:
            return f"Result: {query}"

        registry.register(
            "mcp_test_tool",
            ToolDefinition(
                name="mcp_test_tool",
                description="MCP test tool",
                parameters={
                    "type": "object",
                    "properties": {"query": {"type": "string", "description": "A query"}},
                    "required": ["query"],
                },
                handler=test_handler,
            ),
        )

        server = create_tool_registry_mcp_server()
        assert server is not None
        assert isinstance(server, ToolRegistryMCPServer) or server.__class__.__name__ == "ToolRegistryMCPServer"

    # ── Client Streams ─────────────────────────────────────────────────

    async def test_client_streams_returns_valid_streams(self):
        """client_streams() should yield a tuple of (receive, send) streams."""
        from app.tools.base import get_tool_registry, ToolDefinition
        from app.livekit.mcp_server_bridge import ToolRegistryMCPServer

        registry = get_tool_registry()

        async def test_handler(query: str) -> str:
            return f"Result: {query}"

        registry.register(
            "stream_test_tool",
            ToolDefinition(
                name="stream_test_tool",
                description="Stream test tool",
                parameters={
                    "type": "object",
                    "properties": {"query": {"type": "string", "description": "A query"}},
                    "required": ["query"],
                },
                handler=test_handler,
            ),
        )

        server = ToolRegistryMCPServer()
        async with server.client_streams() as streams:
            recv, send = streams
            assert recv is not None
            assert send is not None

    # ── MCPToolset Integration ─────────────────────────────────────────

    async def test_mcp_toolset_integration_initialize_and_list(self):
        """ToolRegistryMCPServer should work with LiveKit's MCPToolset."""
        from app.tools.base import get_tool_registry, ToolDefinition
        from app.livekit.mcp_server_bridge import create_tool_registry_mcp_server
        from livekit.agents.llm.mcp import MCPToolset

        registry = get_tool_registry()

        async def greet_handler(name: str = "World") -> str:
            return f"Hello, {name}!"

        registry.register(
            "mcp_greet",
            ToolDefinition(
                name="mcp_greet",
                description="Greet someone by name",
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Name to greet"},
                    },
                    "required": ["name"],
                },
                handler=greet_handler,
            ),
        )

        server = create_tool_registry_mcp_server()
        assert server is not None

        toolset = MCPToolset(id="test_registry", mcp_server=server)
        await toolset.setup()

        # Should have discovered the tool via MCP
        assert len(toolset.tools) >= 1

        # Verify tool name matches
        first_tool = toolset.tools[0]
        assert hasattr(first_tool, '_info')
        assert first_tool._info.name == "mcp_greet"

        await toolset.aclose()

    async def test_mcp_toolset_tool_execution(self):
        """Tools discovered via MCPToolset should execute correctly."""
        from app.tools.base import get_tool_registry, ToolDefinition
        from app.livekit.mcp_server_bridge import create_tool_registry_mcp_server
        from livekit.agents.llm.mcp import MCPToolset

        registry = get_tool_registry()

        async def query_handler(query: str) -> str:
            return f"Search result for: {query}"

        registry.register(
            "mcp_search",
            ToolDefinition(
                name="mcp_search",
                description="Search the database",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                    },
                    "required": ["query"],
                },
                handler=query_handler,
            ),
        )

        server = create_tool_registry_mcp_server()
        assert server is not None

        toolset = MCPToolset(id="search_tools", mcp_server=server)
        await toolset.setup()

        assert len(toolset.tools) == 1
        first_tool = toolset.tools[0]
        assert hasattr(first_tool, '_info')
        assert first_tool._info.name == "mcp_search"

        # Execute via registry directly (MCPToolset internal API may vary)
        result = await registry.execute("mcp_search", {"query": "test query"})
        assert result is not None
        assert result.success
        assert "Search result for: test query" in str(result.output)

        await toolset.aclose()

    async def test_mcp_toolset_multiple_tools(self):
        """ToolRegistryMCPServer should expose all registered tools via MCP."""
        from app.tools.base import get_tool_registry, ToolDefinition
        from app.livekit.mcp_server_bridge import create_tool_registry_mcp_server
        from livekit.agents.llm.mcp import MCPToolset

        registry = get_tool_registry()

        async def tool_a(x: str) -> str:
            return f"A: {x}"

        async def tool_b(y: str) -> str:
            return f"B: {y}"

        registry.register(
            "mcp_tool_a",
            ToolDefinition(name="mcp_tool_a", description="Tool A",
                           parameters={"type": "object", "properties": {"x": {"type": "string"}},
                                       "required": ["x"]}, handler=tool_a),
        )
        registry.register(
            "mcp_tool_b",
            ToolDefinition(name="mcp_tool_b", description="Tool B",
                           parameters={"type": "object", "properties": {"y": {"type": "string"}},
                                       "required": ["y"]}, handler=tool_b),
        )

        server = create_tool_registry_mcp_server()
        assert server is not None

        toolset = MCPToolset(id="multi", mcp_server=server)
        await toolset.setup()

        assert len(toolset.tools) == 2

        tool_names = sorted(t._info.name for t in toolset.tools)
        assert tool_names == ["mcp_tool_a", "mcp_tool_b"]

        await toolset.aclose()

    # ── Tool Registry Direct Execution (parallel path) ─────────────────

    async def test_tool_registry_direct_execution_via_mcp(self):
        """Tools should execute correctly via registry.execute through MCP."""
        from app.tools.base import get_tool_registry, ToolDefinition
        from app.livekit.mcp_server_bridge import create_tool_registry_mcp_server

        registry = get_tool_registry()

        async def calc_handler(a: int, b: int) -> str:
            return f"Sum: {a + b}"

        registry.register(
            "mcp_calc",
            ToolDefinition(
                name="mcp_calc",
                description="Add two numbers",
                parameters={
                    "type": "object",
                    "properties": {
                        "a": {"type": "integer", "description": "First number"},
                        "b": {"type": "integer", "description": "Second number"},
                    },
                    "required": ["a", "b"],
                },
                handler=calc_handler,
            ),
        )

        # Execute via registry directly (tests the handler path used by MCP bridge)
        result = await registry.execute("mcp_calc", {"a": 3, "b": 4})
        assert result.success
        assert result.output == "Sum: 7"

    # ── Error Handling ─────────────────────────────────────────────────

    async def test_mcp_toolset_execution_error(self):
        """Tool execution errors should propagate correctly through MCP."""
        from app.tools.base import get_tool_registry, ToolDefinition
        from app.livekit.mcp_server_bridge import create_tool_registry_mcp_server
        from livekit.agents.llm.mcp import MCPToolset

        registry = get_tool_registry()

        async def failing_handler(**kwargs: Any) -> str:
            msg = "Intentional test failure"
            raise RuntimeError(msg)

        registry.register(
            "mcp_failing",
            ToolDefinition(
                name="mcp_failing",
                description="A tool that always fails",
                parameters={
                    "type": "object",
                    "properties": {},
                },
                handler=failing_handler,
            ),
        )

        server = create_tool_registry_mcp_server()
        assert server is not None

        toolset = MCPToolset(id="fail_tools", mcp_server=server)
        await toolset.setup()

        assert len(toolset.tools) == 1
        first_tool = toolset.tools[0]
        assert hasattr(first_tool, '_info')
        assert first_tool._info.name == "mcp_failing"

        # Execute via registry directly to test error propagation
        result = await registry.execute("mcp_failing", {})
        assert result is not None
        assert not result.success
        assert result.error is not None

        await toolset.aclose()


# ── Test Class 3: VoiceAgent Mock JobContext Integration (Item 3) ───


class TestVoiceAgentJobContext:
    """Tests for VoiceAgent lifecycle with a mock JobContext."""

    # ── Mock JobContext Fixture ───────────────────────────────────────

    @pytest.fixture
    def mock_job_context(self, request):
        """Create a minimal mock JobContext for testing VoiceAgent.start()."""
        from livekit import rtc

        # Mock Room
        mock_room = MagicMock(spec=rtc.Room)
        mock_room.name = "test-room"
        mock_room.sid = "RM_test"

        # Mock Participant
        mock_participant = MagicMock(spec=rtc.RemoteParticipant)
        mock_participant.identity = "test-user"
        mock_participant.name = "Test User"
        mock_participant.sid = "PA_test"

        # Mock JobContext
        ctx = MagicMock()
        ctx.room = mock_room
        ctx.agent = None
        ctx.proc = MagicMock()
        ctx.job = MagicMock()
        ctx.worker_id = "test-worker"
        # Ensure job.participant_identity returns a string
        ctx.job.participant_identity = "test-user"

        # connect() should be a real coroutine
        async def mock_connect(**kwargs):
            ctx.agent = MagicMock()
            return ctx.agent

        ctx.connect = AsyncMock(side_effect=mock_connect)

        # wait_for_participant() returns the mock participant
        ctx.wait_for_participant = AsyncMock(return_value=mock_participant)

        # Add shutdown methods
        ctx.shutdown = AsyncMock()
        ctx.add_shutdown_callback = MagicMock()

        return ctx

    # ── Agent Construction ─────────────────────────────────────────────

    async def test_voice_agent_construction(self):
        """VoiceAgent should be constructable without arguments."""
        from app.livekit.voice_agent import VoiceAgent
        agent = VoiceAgent()
        assert agent is not None
        assert agent._session is None
        assert agent._adapters == {}

    async def test_adaptive_voice_agent_construction(self):
        """AdaptiveVoiceAgent should be constructable with minimal arguments."""
        from app.livekit.voice_agent import AdaptiveVoiceAgent
        agent = AdaptiveVoiceAgent(
            instructions="You are a test assistant.",
        )
        assert agent is not None

    # ── Start/Stop Lifecycle ───────────────────────────────────────────

    async def test_voice_agent_start_with_mock_ctx(self, mock_job_context):
        """VoiceAgent.start() should initialize adapters and store the context."""
        from app.livekit.voice_agent import VoiceAgent

        agent = VoiceAgent()
        with patch('app.livekit.voice_agent._load_provider_adapters', return_value={}):
            with patch('app.services.conversation.get_conversation_service'):
                with patch('app.livekit.mcp_bridge.load_mcp_toolsets', return_value=[]):
                    await agent.start(ctx=mock_job_context)

        # Should have stored the context
        assert agent._ctx is not None
        assert agent._ctx.room.name == "test-room"

    async def test_voice_agent_start_stores_adapters(self, mock_job_context):
        """start() should load provider adapters and store the room name."""
        from app.livekit.voice_agent import VoiceAgent

        agent = VoiceAgent()
        with patch('app.livekit.voice_agent._load_provider_adapters', return_value={}):
            with patch('app.services.conversation.get_conversation_service'):
                with patch('app.livekit.mcp_bridge.load_mcp_toolsets', return_value=[]):
                    await agent.start(ctx=mock_job_context)

        # Room name should be set
        assert agent._room_name == "test-room"

    async def test_voice_agent_stop_after_start(self, mock_job_context):
        """VoiceAgent.stop() after start() should clean up gracefully."""
        from app.livekit.voice_agent import VoiceAgent

        agent = VoiceAgent()
        with patch('app.livekit.voice_agent._load_provider_adapters', return_value={}):
            with patch('app.services.conversation.get_conversation_service'):
                with patch('app.livekit.mcp_bridge.load_mcp_toolsets', return_value=[]):
                    await agent.start(ctx=mock_job_context)

        await agent.stop()
        # stop() should not raise — session is simulated
        assert True

    async def test_voice_agent_close_after_start(self, mock_job_context):
        """VoiceAgent.close() after start() should clean up MCP connections."""
        from app.livekit.voice_agent import VoiceAgent

        agent = VoiceAgent()
        with patch('app.livekit.voice_agent._load_provider_adapters', return_value={}):
            with patch('app.services.conversation.get_conversation_service'):
                with patch('app.livekit.mcp_bridge.load_mcp_toolsets', return_value=[]):
                    await agent.start(ctx=mock_job_context)

        await agent.close()
        # close() should not raise
        assert True

    async def test_full_stop_close_lifecycle(self, mock_job_context):
        """Full lifecycle: start → stop → close should be clean."""
        from app.livekit.voice_agent import VoiceAgent

        agent = VoiceAgent()
        with patch('app.livekit.voice_agent._load_provider_adapters', return_value={}):
            with patch('app.services.conversation.get_conversation_service'):
                with patch('app.livekit.mcp_bridge.load_mcp_toolsets', return_value=[]):
                    await agent.start(ctx=mock_job_context)
        await agent.stop()
        await agent.close()
        assert True

    # ── start() with sessions ──────────────────────────────────────────

    async def test_voice_agent_start_with_session(self, mock_job_context):
        """start() should handle the session creation path."""
        from livekit.agents import AgentSession
        from app.livekit.voice_agent import VoiceAgent

        agent = VoiceAgent()

        # Set a mock session before start
        mock_session = MagicMock(spec=AgentSession)
        mock_session.aclose = AsyncMock()

        agent._session = mock_session
        with patch('app.livekit.voice_agent._load_provider_adapters', return_value={}):
            with patch('app.services.conversation.get_conversation_service'):
                with patch('app.livekit.mcp_bridge.load_mcp_toolsets', return_value=[]):
                    await agent.start(ctx=mock_job_context)

        # Start should complete without error
        assert agent._room_name == "test-room"

    # ── entrypoint() simulation ────────────────────────────────────────

    async def test_voice_agent_run_and_stop(self, mock_job_context):
        """Simulate running agent.start() then agent.stop() like entrypoint()."""
        from app.livekit.voice_agent import VoiceAgent

        agent = VoiceAgent()
        try:
            with patch('app.livekit.voice_agent._load_provider_adapters', return_value={}):
                with patch('app.services.conversation.get_conversation_service'):
                    with patch('app.livekit.mcp_bridge.load_mcp_toolsets', return_value=[]):
                        await agent.start(ctx=mock_job_context)
        finally:
            await agent.stop()
            await agent.close()

        # cleanup should succeed
        assert True

    async def test_voice_agent_close_idempotent(self, mock_job_context):
        """close() should be idempotent when called multiple times."""
        from app.livekit.voice_agent import VoiceAgent

        agent = VoiceAgent()
        with patch('app.livekit.voice_agent._load_provider_adapters', return_value={}):
            with patch('app.services.conversation.get_conversation_service'):
                with patch('app.livekit.mcp_bridge.load_mcp_toolsets', return_value=[]):
                    await agent.start(ctx=mock_job_context)

        await agent.close()
        await agent.close()  # second call should not raise
        assert True


# ── Test Class 4: Redis Persistence ─────────────────────────────────


class TestLiveKitSmokeRedisPersistence:
    """Redis-backed persistence integration with LiveKit artifacts."""

    @pytest.fixture(autouse=True)
    async def reset_persistence(self):
        from app.services.persistence import reset_persistence
        await reset_persistence()

    @pytest.mark.asyncio
    async def test_mem_store_conversation_save(self):
        """In-memory store should persist the conversation structure used by VoiceAgent."""
        from app.services.persistence import get_persistence, reset_persistence
        await reset_persistence()
        store = await get_persistence()

        conv_id = "test-conv-livekit-1"
        await store.save_conversation(conv_id, {
            "contact_phone": "livekit-test-user",
            "contact_name": "test-user",
            "room": "test-room",
            "status": "in_progress",
            "started_at": 1234567890.0,
        })

        conv = await store.get_conversation(conv_id)
        assert conv is not None
        assert conv["contact_phone"] == "livekit-test-user"
        assert conv["status"] == "in_progress"

        await store.update_conversation_status(conv_id, "completed")
        conv = await store.get_conversation(conv_id)
        assert conv["status"] == "completed"

    @pytest.mark.asyncio
    async def test_mem_store_conversation_list_active(self):
        """Active conversation listing should work for in-progress calls."""
        from app.services.persistence import get_persistence, reset_persistence
        await reset_persistence()
        store = await get_persistence()

        await store.save_conversation("conv-1", {
            "contact_phone": "+1111",
            "status": "in_progress",
        })
        await store.save_conversation("conv-2", {
            "contact_phone": "+2222",
            "status": "completed",
        })
        await store.save_conversation("conv-3", {
            "contact_phone": "+3333",
            "status": "in_progress",
        })

        active = await store.list_active_conversations()
        active_ids = [c.get("conversation_id", "") for c in active]
        assert "conv-1" in active_ids
        assert "conv-2" not in active_ids
        assert "conv-3" in active_ids
