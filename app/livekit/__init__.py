"""
LiveKit Realtime Voice Runtime — Core realtime voice orchestration layer.

LiveKit replaces the architecture from Vapi/Bland-style external providers.
It acts as the realtime audio transport and session management layer.

Architecture:
    Browser/Phone → LiveKit → Agent Worker → STT → LLM → TTS → Audio Stream

Components:
    - room_manager.py: Room/session lifecycle management
    - agent_worker.py: ⚠️ DEPRECATED — Legacy voice pipeline agent (manual audio handling)
    - voice_agent.py: ✅ PRODUCTION — LiveKit Agents v1.x VoiceAgent + AgentSession
    - adapters.py: Provider adapters (STT/TTS/LLM/VAD) wrapping our providers
    - audio_bridge.py: Audio transport between LiveKit and the voice pipeline
    - sip_dispatch.py: SIP trunk integration (PSTN → LiveKit)

This package should be the ONLY realtime voice transport layer.
The dashboard WebSocket server handles admin/analytics data only.
"""

from .room_manager import LiveKitRoomManager, get_room_manager
from .agent_worker import LiveKitAgentWorker
from .audio_bridge import LiveKitAudioBridge
from .sip_dispatch import (
    SipCallInfo,
    dispatch_inbound_sip_call,
    end_sip_call,
    get_active_sip_calls,
    get_sip_call,
    initialize_sip_dispatch,
)
from .voice_agent import (
    VoiceAgent,
    entrypoint as voice_agent_entrypoint,
    run_worker as run_voice_agent_worker,
    get_voice_agent,
)
from .adapters import (
    LiveKitSTTAdapter,
    LiveKitTTSAdapter,
    LiveKitLLMAdapter,
    LiveKitVADAdapter,
)

__all__ = [
    # Room management
    "LiveKitRoomManager",
    "get_room_manager",
    # Workers
    "LiveKitAgentWorker",
    "VoiceAgent",
    "get_voice_agent",
    "voice_agent_entrypoint",
    "run_voice_agent_worker",
    # Provider adapters
    "LiveKitSTTAdapter",
    "LiveKitTTSAdapter",
    "LiveKitLLMAdapter",
    "LiveKitVADAdapter",
    # Audio bridge
    "LiveKitAudioBridge",
    # SIP dispatch
    "SipCallInfo",
    "dispatch_inbound_sip_call",
    "end_sip_call",
    "get_active_sip_calls",
    "get_sip_call",
    "initialize_sip_dispatch",
]
