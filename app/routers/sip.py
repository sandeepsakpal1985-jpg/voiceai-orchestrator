"""
SIP / Telephony API — Manage PSTN calls routed through LiveKit SIP.

This module provides an API layer on top of the LiveKit SIP dispatch system.
It integrates with Twilio Elastic SIP Trunks via LiveKit's built-in SIP support.

Endpoints:
    GET  /sip/calls            — List active SIP calls
    GET  /sip/calls/{call_id}  — Get info for a specific SIP call
    POST /sip/calls/{call_id}/end — End an active SIP call
    GET  /sip/config           — Get SIP trunk configuration

Architecture:
    Twilio Elastic SIP Trunk
        → Origination URI (sip:<server>:5060)
        → LiveKit SIP Server
        → Dispatch Rules → Room
        → Agent Worker (STT → LLM → TTS)

This replaces the older Twilio webhook-only approach.
LiveKit handles the SIP transport; this API manages call lifecycle.
"""

import logging
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.livekit.sip_dispatch import (
    get_active_sip_calls,
    get_sip_call,
    end_sip_call,
)

logger = logging.getLogger("voiceai.routers.sip")

router = APIRouter(prefix="/sip", tags=["SIP / Telephony"])


@router.get("/calls")
async def list_sip_calls():
    """Get all active SIP calls.

    Returns a list of active calls with their:
    - Call ID (from LiveKit SIP server)
    - Caller number (E.164)
    - Called number (E.164)
    - LiveKit room name
    - Duration in seconds
    """
    calls = get_active_sip_calls()
    return {
        "active_calls": len(calls),
        "calls": calls,
    }


@router.get("/calls/{call_id}")
async def get_sip_call_info(call_id: str):
    """Get information about a specific SIP call.

    Args:
        call_id: The SIP call identifier

    Returns:
        Call details including room name, numbers, and duration
    """
    call = get_sip_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="SIP call not found")
    return call


@router.post("/calls/{call_id}/end")
async def end_sip_call_route(call_id: str):
    """End an active SIP call.

    Args:
        call_id: The SIP call identifier to end

    Returns:
        Status message confirming the call was ended
    """
    success = await end_sip_call(call_id)
    if not success:
        raise HTTPException(status_code=404, detail="SIP call not found")
    return {"status": "ended", "call_id": call_id}


@router.get("/config")
async def get_sip_config():
    """Get the current SIP trunk configuration.

    Returns the LiveKit SIP server configuration for debugging
    and verifying the Twilio trunk setup.
    """
    return {
        "sip_enabled": settings.SIP_ENABLED,
        "server_address": settings.SIP_SERVER_ADDRESS,
        "sip_port": settings.SIP_PORT,
        "room_prefix": settings.SIP_ROOM_PREFIX,
        "trunk_host": settings.SIP_TRUNK_HOST or "(not configured)",
        "dispatch_destination": settings.SIP_DISPATCH_DESTINATION,
        "note": (
            "Configure your Twilio Elastic SIP Trunk with the "
            f"Origination URI: sip:{settings.SIP_SERVER_ADDRESS}:{settings.SIP_PORT};transport=udp"
        ),
    }
