"""
FreeSWITCH Integration — AI Voice Agent Bridge

Connects FreeSWITCH telephony to the AI voice pipeline (STT → LLM → TTS)
using FreeSWITCH's Event Socket Library (ESL) over TCP.

Architecture:
  FreeSWITCH → ESL (Event Socket) → bridge_service → VoicePipeline → TTS audio → FreeSWITCH

Components:
  - ESLClient:     Low-level pure-Python ESL socket client
  - CallHandler:   Manages a single call: record → transcribe → LLM → TTS → playback
  - BridgeService: Top-level orchestrator accepting inbound calls
  - HttpAPI:       Alternative REST integration for FreeSWITCH curl-based dialplans
  - EnergyVAD:     Energy-based voice activity detection for natural turn-taking
"""

from .bridge_service import FreeSwitchBridgeService, get_freeswitch_bridge
from .call_handler import FreeSwitchCallHandler
from .config import FreeSwitchSettings
from .esl_client import ESLClient
from .vad import EnergyVAD, VADConfig, get_vad

__all__ = [
    "FreeSwitchBridgeService",
    "FreeSwitchCallHandler",
    "FreeSwitchSettings",
    "ESLClient",
    "EnergyVAD",
    "VADConfig",
    "get_freeswitch_bridge",
    "get_vad",
]
