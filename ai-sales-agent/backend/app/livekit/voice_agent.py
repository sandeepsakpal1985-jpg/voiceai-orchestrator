"""
LiveKit Voice Agent — Production voice agent using the LiveKit Agents framework.

Architecture:
    LiveKit Worker → JobContext → AdaptiveVoiceAgent → AgentSession → STT/LLM/TTS
"""

import asyncio
import logging
import time
from typing import Any

from livekit.agents import AutoSubscribe, JobContext, TurnHandlingOptions, WorkerOptions, cli, llm as lk_llm
from livekit.agents.llm import function_tool
from livekit.agents.voice import Agent, AgentSession

from app.config import settings
from app.providers import get_default_registry

logger = logging.getLogger("ai_sales_agent.livekit.voice_agent")

BASE_INSTRUCTIONS = (
    "You are a friendly and professional AI voice assistant. "
    "Keep responses concise and conversational, suitable for a voice call. "
    "Speak naturally and ask relevant follow-up questions. "
    "Use available tools to look up information, search the knowledge base, or update customer records."
)


def _load_provider_adapters() -> dict[str, Any]:
    """Load and wrap our providers into LiveKit-compatible adapters."""
    from app.livekit.adapters import LiveKitLLMAdapter, LiveKitSTTAdapter, LiveKitTTSAdapter

    s = settings
    registry = get_default_registry()
    adapters: dict[str, Any] = {"stt": None, "llm": None, "tts": None, "vad": None}

    try:
        stt_provider = registry.get_stt(s.STT_PROVIDER)
        adapters["stt"] = LiveKitSTTAdapter(stt_provider=stt_provider, sample_rate=s.SAMPLE_RATE)
    except Exception as e:
        logger.warning("Failed to create STT adapter: %s", e)

    try:
        llm_provider = registry.get_llm(s.LLM_PROVIDER)
        adapters["llm"] = LiveKitLLMAdapter(llm_provider=llm_provider)
    except Exception as e:
        logger.warning("Failed to create LLM adapter: %s", e)

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
        adapters["tts"] = LiveKitTTSAdapter(tts_provider=tts_provider, audio_cache=cache)
    except Exception as e:
        logger.warning("Failed to create TTS adapter: %s", e)

    return adapters


class AdaptiveVoiceAgent(Agent):
    """Agent subclass with tool support and conversation tracking."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._conversation_id: str | None = None
        self._turn_count: int = 0

    async def on_enter(self) -> None:
        self._turn_count = 0
        logger.info("AdaptiveVoiceAgent entered session")

    async def on_user_turn_completed(self, turn_ctx: lk_llm.ChatContext, new_message: lk_llm.ChatMessage) -> None:
        self._turn_count += 1
        user_text = ""
        for content in new_message.content:
            if hasattr(content, 'text'):
                user_text += content.text

        if self._conversation_id and user_text.strip():
            try:
                from app.services.conversation import get_conversation_service
                from app.models.schemas import Message
                conv = get_conversation_service()
                conv.add_message(self._conversation_id, Message(role="user", content=user_text, timestamp=time.time()))
            except Exception:
                pass

    @function_tool
    async def lookup_contact(self, name: str = "", phone: str = "") -> str:
        """Look up a contact in the CRM by name or phone number."""
        try:
            from app.tools.base import get_tool_registry
            result = await get_tool_registry().execute("lookup_contact", {"name": name, "phone": phone})
            return result.output
        except Exception as e:
            return f"Unable to look up contact: {e}"

    @function_tool
    async def search_knowledge_base(self, query: str, top_k: int = 3) -> str:
        """Search the knowledge base for relevant information."""
        try:
            from app.tools.base import get_tool_registry
            result = await get_tool_registry().execute("search_knowledge_base", {"query": query, "top_k": min(top_k, 10)})
            return result.output
        except Exception as e:
            return f"Knowledge base search unavailable: {e}"


class VoiceAgent:
    """High-level voice agent managing the LiveKit session lifecycle."""

    def __init__(self):
        self._session: AgentSession | None = None

    async def start(self, ctx: JobContext) -> None:
        logger.info("Agent received job: room=%s", ctx.room.name)
        await ctx.connect()
        participant = await ctx.wait_for_participant()
        logger.info("Participant joined: %s", participant.identity)

        adapters = _load_provider_adapters()
        turn_handling = TurnHandlingOptions(endpointing={"min_delay": 0.5, "max_delay": 2.0}, interruption={"enabled": True})

        agent = AdaptiveVoiceAgent(instructions=BASE_INSTRUCTIONS, stt=adapters.get("stt"), llm=adapters.get("llm"), tts=adapters.get("tts"), vad=adapters.get("vad"), turn_handling=turn_handling)

        try:
            from app.models.schemas import ConversationCreate
            from app.services.conversation import get_conversation_service
            conv_service = get_conversation_service()
            conv = conv_service.create(ConversationCreate(contact_phone=f"livekit-{participant.identity}", contact_name=participant.identity, metadata={"source": "livekit", "room": ctx.room.name}))
            agent._conversation_id = conv.id
            logger.info("Conversation created: %s", conv.id)

            try:
                from app.services.persistence import get_persistence
                store = await get_persistence()
                await store.save_conversation(conv.id, {"contact_phone": f"livekit-{participant.identity}", "contact_name": participant.identity, "room": ctx.room.name, "status": "in_progress", "started_at": time.time()})
            except Exception:
                pass
        except Exception as e:
            logger.warning("Failed to create conversation: %s", e)

        session = AgentSession()
        self._session = session

        logger.info("Starting agent session in room '%s'...", ctx.room.name)
        await session.start(agent=agent, room=ctx.room)

        try:
            await session.wait_for_inactive()
        except asyncio.CancelledError:
            logger.info("Session cancelled")
        finally:
            await session.aclose()
            logger.info("Session ended")

    async def close(self) -> None:
        if self._session:
            try:
                await self._session.aclose()
            except Exception:
                pass


async def entrypoint(ctx: JobContext) -> None:
    """LiveKit worker entrypoint."""
    agent = VoiceAgent()
    try:
        await agent.start(ctx)
    finally:
        await agent.close()


async def run_worker() -> None:
    """Run the LiveKit agent worker process."""
    logger.info("Starting LiveKit worker (server=%s)", settings.LIVEKIT_URL)
    options = WorkerOptions(entrypoint_fnc=entrypoint, agent_name=settings.LIVEKIT_AGENT_NAME, ws_url=settings.LIVEKIT_URL, api_key=settings.LIVEKIT_API_KEY, api_secret=settings.LIVEKIT_API_SECRET, log_level=settings.LIVEKIT_WORKER_LOG_LEVEL, auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    cli.run_app(options)


_agent_instance: VoiceAgent | None = None


def get_voice_agent() -> VoiceAgent:
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = VoiceAgent()
    return _agent_instance
