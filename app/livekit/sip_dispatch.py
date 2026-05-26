"""
LiveKit SIP Dispatch — Routes inbound SIP/PSTN calls to LiveKit rooms.

Architecture:
    Twilio Elastic SIP Trunk → LiveKit SIP Server → Room Dispatch → Agent Worker

Flow:
    1. Twilio receives an inbound PSTN call
    2. Twilio routes to LiveKit SIP via Origination URI (sip:<host>:5060)
    3. LiveKit SIP server receives the INVITE
    4. Dispatch rules map the call to a LiveKit room
    5. Agent worker joins the room, processes voice pipeline
    6. Audio flows: Caller ↔ Twilio ↔ SIP ↔ LiveKit ↔ Agent Worker

Configuration (livekit.yaml):
    sip:
      enabled: true
      server_address: "0.0.0.0"
      sip_port: 5060
      dispatch_rules:
        - destination: "twilio-sip-trunk"
          rule: "match all"
          room: "sip-{{.To}}"
          participant_identity: "caller-{{.From}}"

Environment Variables:
    SIP_ENABLED: Enable SIP integration (default: true)
    SIP_TRUNK_HOST: Twilio Elastic SIP Trunk host (optional, for filtering)
    SIP_ROOM_PREFIX: Prefix for SIP call rooms (default: "sip-")
"""

import logging
import time
from typing import Any

from app.config import settings

logger = logging.getLogger("voiceai.livekit.sip_dispatch")

# ── In-memory active SIP call tracking ──
_active_sip_calls: dict[str, "SipCallInfo"] = {}  # call_id → call_info


class SipCallInfo:
    """Information about an active SIP call."""

    def __init__(
        self,
        call_id: str,
        from_number: str,
        to_number: str,
        room_name: str,
        participant_identity: str,
    ):
        self.call_id = call_id
        self.from_number = from_number
        self.to_number = to_number
        self.room_name = room_name
        self.participant_identity = participant_identity
        self.started_at = time.time()
        self.status = "active"

    def to_dict(self) -> dict[str, Any]:
        return {
            "call_id": self.call_id,
            "from_number": self.from_number,
            "to_number": self.to_number,
            "room_name": self.room_name,
            "participant_identity": self.participant_identity,
            "started_at": self.started_at,
            "status": self.status,
            "duration_seconds": int(time.time() - self.started_at),
        }


async def dispatch_inbound_sip_call(
    call_id: str,
    from_number: str,
    to_number: str,
) -> SipCallInfo:
    """Dispatch an inbound SIP call to a LiveKit room.

    Uses the configured room prefix to create a deterministic room name.
    The Agent Worker will automatically join this room and begin
    the STT → LLM → TTS voice pipeline.

    Args:
        call_id: Unique SIP call identifier (from LiveKit or Twilio)
        from_number: Caller's phone number (E.164 format)
        to_number: Called phone number (E.164 format)

    Returns:
        SipCallInfo with the room name and participant identity
    """
    room_name = f"{settings.SIP_ROOM_PREFIX}{to_number}"
    participant_identity = f"caller-{from_number.replace('+', '')}"

    call_info = SipCallInfo(
        call_id=call_id,
        from_number=from_number,
        to_number=to_number,
        room_name=room_name,
        participant_identity=participant_identity,
    )

    _active_sip_calls[call_id] = call_info

    logger.info(
        "📞 SIP call dispatched — from: %s to: %s → room: %s (ID: %s)",
        from_number, to_number, room_name, call_id,
    )

    return call_info


async def end_sip_call(call_id: str) -> bool:
    """End an active SIP call.

    Removes the call from the active calls registry.
    The LiveKit room will be cleaned up by the room manager's
    empty_timeout setting.

    Args:
        call_id: SIP call identifier to end

    Returns:
        True if the call was found and ended, False otherwise
    """
    call = _active_sip_calls.get(call_id)
    if call is not None:
        call.status = "completed"
        logger.info("📞 SIP call ended — ID: %s", call_id)
        del _active_sip_calls[call_id]
        return True

    logger.warning("SIP call not found — ID: %s", call_id)
    return False


def get_active_sip_calls() -> list[dict[str, Any]]:
    """Get all active SIP calls."""
    return [info.to_dict() for info in _active_sip_calls.values()]


def get_sip_call(call_id: str) -> dict[str, Any] | None:
    """Get info for a specific SIP call."""
    info = _active_sip_calls.get(call_id)
    if info:
        return info.to_dict()
    return None


async def initialize_sip_dispatch():
    """Initialize the SIP dispatch system.

    Called during app startup if SIP is enabled.
    Validates configuration and logs the dispatch rules.
    """
    if not settings.SIP_ENABLED:
        logger.info("SIP dispatch disabled (set SIP_ENABLED=true to enable)")
        return

    logger.info(
        "SIP dispatch initialized — address: %s:%d, room_prefix: %s",
        settings.SIP_SERVER_ADDRESS,
        settings.SIP_PORT,
        settings.SIP_ROOM_PREFIX,
    )

    if settings.SIP_TRUNK_HOST:
        logger.info("SIP trunk host configured: %s", settings.SIP_TRUNK_HOST)

    logger.info(
        "Dispatch rule: inbound SIP calls → %s<to-number>",
        settings.SIP_ROOM_PREFIX,
    )
