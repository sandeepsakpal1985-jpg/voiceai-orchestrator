"""
LiveKit Realtime Voice Runtime — Core realtime voice orchestration layer.

LiveKit replaces the architecture from Vapi/Bland-style external providers.
It acts as the realtime audio transport and session management layer.

Architecture:
    Browser/Phone → LiveKit → Agent Worker → STT → LLM → TTS → Audio Stream

Components:
    - room_manager.py: Room/session lifecycle management
    - agent_worker.py: Voice pipeline agent that runs inside LiveKit
    - audio_bridge.py: Audio transport between LiveKit and the voice pipeline
    - config.py: LiveKit server configuration

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

__all__ = [
    "LiveKitRoomManager",
    "get_room_manager",
    "LiveKitAgentWorker",
    "LiveKitAudioBridge",
    "SipCallInfo",
    "dispatch_inbound_sip_call",
    "end_sip_call",
    "get_active_sip_calls",
    "get_sip_call",
    "initialize_sip_dispatch",
]
