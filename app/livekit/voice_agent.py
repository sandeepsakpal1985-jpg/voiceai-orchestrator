"""
LiveKit Voice Agent — Production voice agent using the LiveKit Agents v1.x framework.

Architecture:

    ┌──────────────────────────────────────────────────────────────┐
    │ Worker (cli.run_app)                                         │
    │  ┌─ JobContext (room, participant)                          │
    │  │  ┌─ AdaptiveVoiceAgent (Agent subclass)                 │
    │  │  │   - STT/LLM/TTS/VAD adapters (constructor)           │
    │  │  │   - instructions with adaptive context injection      │
    │  │  │   - @function_tool → CRM, RAG, knowledge             │
    │  │  │   - on_enter() / on_user_turn_completed() hooks      │
    │  │  └──────────────────────────────────────────────────────-│
    │  │  ┌─ AgentSession (runtime)                               │
    │  │  │   - session.start(agent=agent, room=room)             │
    │  │  │   - Built-in turn detection + interruptions           │
    │  │  └──────────────────────────────────────────────────────-│
    │  └──────────────────────────────────────────────────────────│
    └──────────────────────────────────────────────────────────────┘

Integration points:
  - Adaptive modules (state engine, adaptive playback, semantic analysis)
    are injected via on_user_turn_completed() before each LLM turn.
  - Tools (CRM, RAG) are registered as @function_tool methods,
    automatically available to the LLM via LiveKit's tool calling.
  - Audio cache is integrated at the TTS adapter level.

Usage:
    # Standalone worker:
    python -c "from app.livekit.voice_agent import run_worker; run_worker()"
"""

import asyncio
import logging
import time
from typing import Any

from livekit.agents import (
    AutoSubscribe,
    JobContext,
    TurnHandlingOptions,
    WorkerOptions,
    cli,
    llm as lk_llm,
)
from livekit.agents.llm import function_tool
from livekit.agents.voice import Agent, AgentSession

from app.config import settings
from app.providers import get_default_registry

logger = logging.getLogger("voiceai.livekit.voice_agent")


# ── Helper: Load Provider Adapters ──────────────────────────────────


def _load_provider_adapters() -> dict[str, Any]:
    """Load and wrap our providers into LiveKit-compatible adapters.

    Always reads fresh settings via get_settings() so that env var changes
    (e.g. from tests calling reload_settings()) are reflected correctly.

    Returns dict with 'stt', 'llm', 'tts', 'vad' adapter instances.
    This is called lazily to avoid startup dependency issues.
    """
    from app.config import get_settings as _get_settings
    from app.livekit.adapters import (
        LiveKitLLMAdapter,
        LiveKitSTTAdapter,
        LiveKitTTSAdapter,
    )

    s = _get_settings()
    registry = get_default_registry()
    adapters: dict[str, Any] = {}

    # Wrap STT provider
    try:
        stt_provider = registry.get_stt(s.STT_PROVIDER)
        adapters["stt"] = LiveKitSTTAdapter(
            stt_provider=stt_provider,
            sample_rate=s.SAMPLE_RATE,
        )
        logger.info("STT adapter: %s → LiveKitSTTAdapter", s.STT_PROVIDER)
    except Exception as e:
        logger.warning("Failed to create STT adapter: %s", e)
        adapters["stt"] = None

    # Wrap LLM provider
    try:
        llm_provider = registry.get_llm(s.LLM_PROVIDER)
        adapters["llm"] = LiveKitLLMAdapter(llm_provider=llm_provider)
        logger.info("LLM adapter: %s → LiveKitLLMAdapter", s.LLM_PROVIDER)
    except Exception as e:
        logger.warning("Failed to create LLM adapter: %s", e)
        adapters["llm"] = None

    # Wrap TTS provider with audio cache
    try:
        tts_provider = registry.get_tts(s.TTS_PROVIDER)
        cache = None
        if s.AUDIO_CACHE_ENABLED:
            try:
                from app.services.audio_cache import get_audio_cache_service
                cache_svc = get_audio_cache_service()
                if cache_svc.is_initialized:
                    cache = cache_svc
            except Exception:
                pass

        adapters["tts"] = LiveKitTTSAdapter(
            tts_provider=tts_provider,
            audio_cache=cache,
            sample_rate=24000,
        )
        logger.info(
            "TTS adapter: %s → LiveKitTTSAdapter (cache=%s)",
            s.TTS_PROVIDER,
            "enabled" if cache else "disabled",
        )
    except Exception as e:
        logger.warning("Failed to create TTS adapter: %s", e)
        adapters["tts"] = None

    adapters["vad"] = None  # Use LiveKit's built-in VAD

    return adapters


# ── Base Instructions ───────────────────────────────────────────────

BASE_INSTRUCTIONS = (
    "You are a friendly and professional AI voice assistant. "
    "Keep responses concise and conversational, suitable for a voice call. "
    "Speak naturally and ask relevant follow-up questions. "
    "Responses should be under 100 words unless complex information is needed. "
    "If you don't know something, say so honestly. "
    "Use the available tools when you need to look up information, "
    "search the knowledge base, or update customer records."
)


# ── Phase 3: Adaptive Agent Subclass ────────────────────────────────


class AdaptiveVoiceAgent(Agent):
    """Agent subclass with adaptive module integration and tool support.

    Integrates three phases:
    - **Phase 3**: Adaptive conversation modules (state engine, adaptive
      playback, interrupt detection, semantic analysis)
    - **Phase 5**: Tool registry via @function_tool methods
    - **Built-in**: Audio cache (at TTS adapter level)

    Lifecycle hooks:
      on_enter() — Load adaptive modules, set up conversation tracking
      on_user_turn_completed() — Inject adaptive context before LLM turn
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._conversation_id: str | None = None
        self._participant_identity: str | None = None
        self._room_name: str | None = None
        self._turn_count: int = 0

        # Lazy-loaded adaptive modules
        self._orchestrator = None
        self._adaptive_service = None
        self._conversation_service = None

    # ── Lazy Module Accessors ──────────────────────────────────────

    @property
    def orchestrator(self):
        if self._orchestrator is None:
            try:
                from app.advanced.orchestrator import get_orchestrator
                self._orchestrator = get_orchestrator()
            except Exception:
                pass
        return self._orchestrator

    @property
    def adaptive_service(self):
        if self._adaptive_service is None and settings.ADAPTIVE_CONVERSATION_ENABLED:
            try:
                from app.services.adaptive_conversation import \
                    get_adaptive_conversation_service
                self._adaptive_service = get_adaptive_conversation_service()
            except Exception:
                pass
        return self._adaptive_service

    @property
    def conversation_service(self):
        if self._conversation_service is None:
            try:
                from app.services.conversation import get_conversation_service
                self._conversation_service = get_conversation_service()
            except Exception:
                pass
        return self._conversation_service

    # ── Phase 3: Lifecycle Hooks ───────────────────────────────────

    async def on_enter(self) -> None:
        """Called when the agent session starts.

        Sets up conversation tracking, resets adaptive state,
        and initialises the orchestrator for this session.
        """
        session = self.session
        if session and hasattr(session, '_room'):
            self._room_name = getattr(session._room, 'name', None)

        # Reset adaptive modules for a fresh conversation
        if self.orchestrator:
            self.orchestrator.reset()
        if self.adaptive_service:
            self.adaptive_service.reset()

        self._turn_count = 0
        logger.info("AdaptiveVoiceAgent entered session (room=%s)", self._room_name)

    async def on_user_turn_completed(
        self, turn_ctx: lk_llm.ChatContext, new_message: lk_llm.ChatMessage
    ) -> None:
        """Called after user finishes speaking, before LLM responds.

        Injects adaptive context into the agent instructions so the LLM
        is aware of conversation state, emotion, pacing, and history.

        Args:
            turn_ctx: The full chat context so far
            new_message: The user's just-completed message
        """
        self._turn_count += 1

        # Extract the user's text
        user_text = ""
        for content in new_message.content:
            if hasattr(content, 'text'):
                user_text += content.text

        if not user_text.strip():
            return

        # ── Update adaptive services ──
        adaptive = self.adaptive_service
        if adaptive:
            adaptive.update_customer_state(user_text)
            adaptive.add_to_history("user", user_text)
            adaptive.conversation_state = "processing"

        # ── Run orchestrator processing ──
        emotion = adaptive.customer_state.emotion if adaptive else None
        if self.orchestrator:
            await self.orchestrator.process_utterance(
                text=user_text,
                emotion=emotion,
            )

        # ── Build adaptive context string ──
        context_parts = []

        if adaptive:
            context_parts.append(adaptive.get_context_summary())

        if self.orchestrator:
            llm_ctx = self.orchestrator.get_llm_context(emotion)
            if llm_ctx:
                context_parts.append(llm_ctx)

        # ── Store in conversation service ──
        conv = self.conversation_service
        if conv and self._conversation_id:
            from app.models.schemas import Message
            conv.add_message(
                self._conversation_id,
                Message(role="user", content=user_text, timestamp=time.time()),
            )

        # ── Update turn context with adaptive context ──
        if context_parts:
            # Inject adaptive context as a system message into the turn context.
            # This gives the LLM awareness of conversation state, emotion, and pacing
            # for the upcoming response.
            try:
                context_text = "[Adaptive Context]\n" + "\n".join(context_parts)
                turn_ctx.append(role="system", text=context_text)
                logger.debug("Injected adaptive context into turn: %d chars", len(context_text))
            except Exception as e:
                logger.warning("Failed to inject adaptive context: %s", e)

    # ── Phase 5: @function_tool Methods ────────────────────────────

    # These methods are automatically registered as LLM-callable tools.
    # They delegate to the ToolRegistry for CRM and RAG operations.

    @function_tool
    async def lookup_contact(
        self,
        name: str = "",
        phone: str = "",
    ) -> str:
        """Look up a contact in the CRM by name or phone number.

        Args:
            name: Contact name to search for
            phone: Phone number to search for

        Returns:
            Contact information as a formatted string
        """
        try:
            from app.tools.base import get_tool_registry
            registry = get_tool_registry()
            result = await registry.execute(
                "lookup_contact", {"name": name, "phone": phone}
            )
            return result.output
        except Exception as e:
            logger.warning("lookup_contact error: %s", e)
            return f"Unable to look up contact: {e}"

    @function_tool
    async def search_knowledge_base(self, query: str, top_k: int = 3) -> str:
        """Search the knowledge base for relevant information.

        Args:
            query: Natural language search query
            top_k: Number of results to return (1-10)

        Returns:
            Formatted search results with relevant content
        """
        try:
            from app.tools.base import get_tool_registry
            registry = get_tool_registry()
            result = await registry.execute(
                "search_knowledge_base", {"query": query, "top_k": min(top_k, 10)}
            )
            return result.output
        except Exception as e:
            logger.warning("search_knowledge_base error: %s", e)
            return f"Knowledge base search unavailable: {e}"

    @function_tool
    async def get_contact_history(self, contact_phone: str, limit: int = 5) -> str:
        """Get recent conversation history for a contact.

        Args:
            contact_phone: Phone number of the contact
            limit: Maximum number of conversations to return

        Returns:
            Recent conversation summary
        """
        try:
            from app.tools.base import get_tool_registry
            registry = get_tool_registry()
            result = await registry.execute(
                "get_contact_history",
                {"contact_phone": contact_phone, "limit": limit},
            )
            return result.output
        except Exception as e:
            logger.warning("get_contact_history error: %s", e)
            return f"History unavailable: {e}"

    @function_tool
    async def get_state_summary(self) -> str:
        """Get a summary of the current conversation state, emotion, and pacing.

        Returns:
            Conversation state summary for the assistant context
        """
        parts = []
        if self.orchestrator:
            parts.append(self.orchestrator.summary())
        if self.adaptive_service:
            parts.append(self.adaptive_service.get_context_summary())
        return " | ".join(parts) if parts else "No adaptive state available."


# ── VoiceAgent Wrapper ──────────────────────────────────────────────


class VoiceAgent:
    """High-level voice agent that manages the LiveKit session lifecycle.

    Creates the AdaptiveVoiceAgent (with adaptive modules + tools),
    wraps it in an AgentSession, and manages the room lifecycle.

    Usage:
        agent = VoiceAgent()
        await agent.start(ctx)
    """

    def __init__(self):
        self._adapters: dict[str, Any] = {}
        self._session: AgentSession | None = None
        self._conversation_id: str | None = None
        self._agent_instance: AdaptiveVoiceAgent | None = None

    async def start(self, ctx: JobContext) -> None:
        """Start the voice agent in the LiveKit room.

        Loads provider adapters, creates AdaptiveVoiceAgent,
        initialises AgentSession, and processes audio until room ends.

        Args:
            ctx: JobContext from LiveKit
        """
        # Store state synchronously before first await so callers can
        # inspect it immediately after awaiting start()
        self._ctx = ctx
        self._room_name = ctx.room.name

        logger.info(
            "Agent received job: room=%s, participant=%s",
            ctx.room.name,
            ctx.job.participant_identity,
        )

        await ctx.connect()
        participant = await ctx.wait_for_participant()
        logger.info("Participant joined: %s", participant.identity)

        # Load provider adapters
        self._adapters = _load_provider_adapters()

            # ── Load external MCP servers (optional) ──
        mcp_toolsets: list = []
        try:
            from app.livekit.mcp_bridge import load_mcp_toolsets
            mcp_toolsets = await load_mcp_toolsets()
            if mcp_toolsets:
                logger.info("Loaded %d MCP toolset(s)", len(mcp_toolsets))
        except Exception as e:
            logger.warning("Failed to load MCP servers: %s", e)

        # Build turn handling config
        # TurnHandlingOptions is a TypedDict — pass endpointing/interruption as dicts
        turn_handling = TurnHandlingOptions(
            endpointing={
                "min_delay": 0.5,
                "max_delay": 2.0,
            },
            interruption={"enabled": True},
        )

        # Store MCP toolsets for lifecycle cleanup
        self._mcp_toolsets = mcp_toolsets

        # ── Create the AdaptiveVoiceAgent ──
        # This Agent subclass wires adaptive modules and tools.
        # MCP toolsets are passed via the tools parameter alongside @function_tool.
        tools_arg = mcp_toolsets if mcp_toolsets else None
        agent = AdaptiveVoiceAgent(
            instructions=BASE_INSTRUCTIONS,
            stt=self._adapters.get("stt"),
            llm=self._adapters.get("llm"),
            tts=self._adapters.get("tts"),
            vad=self._adapters.get("vad"),
            turn_handling=turn_handling,
            tools=tools_arg,
        )
        self._agent_instance = agent

        # ── Create the ToolRegistryToolset (bridges CRM/RAG tools) ──
        registry_tools = None
        try:
            from app.livekit.toolset_bridge import create_registry_toolset
            toolset = create_registry_toolset()
            if toolset:
                registry_tools = toolset
                logger.info("ToolRegistryToolset created with %d tools", len(toolset.tools))
        except Exception as e:
            logger.warning("Failed to create ToolRegistryToolset: %s", e)

        # Combine MCP toolsets with registry toolset
        tools_list: list = []
        if mcp_toolsets:
            tools_list.extend(mcp_toolsets)
        if registry_tools:
            tools_list.append(registry_tools)
        tools_arg = tools_list if tools_list else None

        # ── Create conversation record ──
        try:
            from app.services.conversation import get_conversation_service
            from app.models.schemas import ConversationCreate

            conv_service = get_conversation_service()
            conv = conv_service.create(
                ConversationCreate(
                    contact_phone=f"livekit-{participant.identity}",
                    contact_name=participant.identity,
                    metadata={
                        "source": "livekit",
                        "room": ctx.room.name,
                    },
                )
            )
            agent._conversation_id = conv.id
            agent._participant_identity = participant.identity
            agent._room_name = ctx.room.name
            self._conversation_id = conv.id
            logger.info("Conversation created: %s", conv.id)

            # Store in Redis-backed persistence if available
            try:
                from app.services.persistence import get_persistence
                store = await get_persistence()
                await store.save_conversation(
                    conv.id,
                    {
                        "contact_phone": f"livekit-{participant.identity}",
                        "contact_name": participant.identity,
                        "room": ctx.room.name,
                        "status": "in_progress",
                        "started_at": time.time(),
                    },
                )
            except Exception:
                pass
        except Exception as e:
            logger.warning("Failed to create conversation record: %s", e)

        # ── Create session and start ──
        session = AgentSession()
        self._session = session

        @session.on("agent_state_changed")
        def on_agent_state(state):
            logger.debug("Agent state changed: %s", state)

        logger.info("Starting agent session in room '%s'...", ctx.room.name)
        await session.start(
            agent=agent,
            room=ctx.room,
        )

        try:
            await session.wait_for_inactive()
        except asyncio.CancelledError:
            logger.info("Agent session cancelled for room '%s'", ctx.room.name)
        finally:
            await session.aclose()
            logger.info("Agent session ended for room '%s'", ctx.room.name)

            # Mark conversation as completed in Redis
            if self._conversation_id:
                try:
                    from app.services.persistence import get_persistence
                    store = await get_persistence()
                    await store.update_conversation_status(
                        self._conversation_id, "completed"
                    )
                except Exception:
                    pass

    async def stop(self) -> None:
        """Stop the voice agent session and close MCP connections."""
        if self._session:
            await self._session.aclose()
            logger.info("Agent session stopped")

    async def close(self) -> None:
        """Close the agent and clean up MCP toolset connections."""
        if self._session:
            try:
                await self._session.aclose()
            except Exception:
                pass
        # Close MCP toolset connections
        mcp = getattr(self, '_mcp_toolsets', None)
        if mcp:
            try:
                from app.livekit.mcp_bridge import close_mcp_toolsets
                await close_mcp_toolsets(mcp)
            except Exception:
                pass
        logger.info("VoiceAgent resources closed")


# ── Worker Entrypoint ───────────────────────────────────────────────


async def entrypoint(ctx: JobContext) -> None:
    """LiveKit worker entrypoint — called when a new job is dispatched.

    Creates a VoiceAgent, starts it in the room, and cleans up
    resources when the session ends.
    """
    agent = VoiceAgent()
    try:
        await agent.start(ctx)
    finally:
        await agent.close()


async def run_worker() -> None:
    """Run the LiveKit agent worker process.

    Connects to the LiveKit server via cli.run_app.
    """
    logger.info(
        "Starting LiveKit agent worker (server=%s, agent=%s)",
        settings.LIVEKIT_URL,
        settings.LIVEKIT_AGENT_NAME,
    )

    options = WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name=settings.LIVEKIT_AGENT_NAME,
        ws_url=settings.LIVEKIT_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
        log_level=settings.LIVEKIT_WORKER_LOG_LEVEL,
        auto_subscribe=AutoSubscribe.AUDIO_ONLY,
    )

    cli.run_app(options)


# ── Singleton Access ────────────────────────────────────────────────

_agent_instance: VoiceAgent | None = None


def get_voice_agent() -> VoiceAgent:
    """Get or create the global VoiceAgent singleton."""
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = VoiceAgent()
    return _agent_instance
