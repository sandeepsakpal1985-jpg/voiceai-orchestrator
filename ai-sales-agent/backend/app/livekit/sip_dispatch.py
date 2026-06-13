"""
LiveKit SIP Dispatch — Routes inbound SIP/PSTN calls to LiveKit rooms.
"""

import logging
import time
from typing import Any

from app.config import settings

logger = logging.getLogger("ai_sales_agent.livekit.sip_dispatch")

_active_sip_calls: dict[str, "SipCallInfo"] = {}


class SipCallInfo:
    def __init__(self, call_id: str, from_number: str, to_number: str, room_name: str, participant_identity: str):
        self.call_id = call_id
        self.from_number = from_number
        self.to_number = to_number
        self.room_name = room_name
        self.participant_identity = participant_identity
        self.started_at = time.time()
        self.status = "active"

    def to_dict(self) -> dict[str, Any]:
        return {"call_id": self.call_id, "from_number": self.from_number, "to_number": self.to_number, "room_name": self.room_name, "participant_identity": self.participant_identity, "started_at": self.started_at, "status": self.status, "duration_seconds": int(time.time() - self.started_at)}


async def dispatch_inbound_sip_call(call_id: str, from_number: str, to_number: str) -> SipCallInfo:
    room_name = f"{settings.SIP_ROOM_PREFIX}{to_number}"
    participant_identity = f"caller-{from_number.replace('+', '')}"
    call_info = SipCallInfo(call_id=call_id, from_number=from_number, to_number=to_number, room_name=room_name, participant_identity=participant_identity)
    _active_sip_calls[call_id] = call_info
    logger.info("SIP call dispatched: %s -> %s (room: %s)", from_number, to_number, room_name)
    return call_info


async def end_sip_call(call_id: str) -> bool:
    call = _active_sip_calls.get(call_id)
    if call:
        call.status = "completed"
        del _active_sip_calls[call_id]
        return True
    return False


def get_active_sip_calls() -> list[dict[str, Any]]:
    return [info.to_dict() for info in _active_sip_calls.values()]


def get_sip_call(call_id: str) -> dict[str, Any] | None:
    info = _active_sip_calls.get(call_id)
    return info.to_dict() if info else None


async def initialize_sip_dispatch():
    if not settings.SIP_ENABLED:
        logger.info("SIP dispatch disabled")
        return
    logger.info("SIP dispatch initialized — address: %s:%d", settings.SIP_SERVER_ADDRESS, settings.SIP_PORT)
