"""Social Automation Router — Connect and manage social media accounts.

Provides API endpoints for connecting social platforms (Instagram,
Facebook Messenger, WhatsApp), configuring auto-reply rules, managing
incoming messages, and syncing with CRM.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import (
    SocialConnectionCreate,
    SocialConnectionUpdate,
    SocialConnectionResponse,
    SocialMessageResponse,
    AutoReplyConfig,
)

logger = logging.getLogger("voiceai.social")

router = APIRouter(prefix="/social", tags=["Social Automation"])


# ── In-Memory Store ────────────────────────────────────────────────

_connections: dict[str, dict] = {}
_messages: dict[str, list[dict]] = {}
_auto_reply_configs: dict[str, dict] = {}


def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _get_connection_or_404(connection_id: str) -> dict:
    conn = _connections.get(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Social connection not found")
    return conn


# ── Connection Management ──────────────────────────────────────────


@router.get("/connections", response_model=dict)
async def list_connections(
    platform: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """List all social media connections with optional filtering."""
    conns = list(_connections.values())

    if platform:
        conns = [c for c in conns if c.get("platform") == platform]
    if status:
        conns = [c for c in conns if c.get("status") == status]

    return {"connections": conns, "total": len(conns)}


@router.post("/connections", response_model=dict, status_code=201)
async def create_connection(body: SocialConnectionCreate):
    """Connect a new social media account."""
    conn_id = str(uuid.uuid4())

    connection = {
        "id": conn_id,
        "platform": body.platform,
        "account_id": body.account_id,
        "account_name": body.account_name,
        "auto_reply": body.auto_reply if body.auto_reply is not None else False,
        "welcome_message": body.welcome_message,
        "status": "connected",
        "last_sync_at": None,
        "created_at": _now(),
    }

    _connections[conn_id] = connection
    _messages[conn_id] = []

    logger.info("Connected %s account: %s", body.platform, body.account_id)
    return {"connection": connection}


@router.get("/connections/{connection_id}", response_model=dict)
async def get_connection(connection_id: str):
    """Get a single social connection by ID."""
    conn = _get_connection_or_404(connection_id)
    return {"connection": conn}


@router.put("/connections/{connection_id}", response_model=dict)
async def update_connection(connection_id: str, body: SocialConnectionUpdate):
    """Update a social connection's configuration."""
    conn = _get_connection_or_404(connection_id)

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            conn[key] = value

    conn["updated_at"] = _now()
    _connections[connection_id] = conn

    return {"connection": conn}


@router.delete("/connections/{connection_id}", response_model=dict)
async def delete_connection(connection_id: str):
    """Disconnect and remove a social media account."""
    _get_connection_or_404(connection_id)
    del _connections[connection_id]
    _messages.pop(connection_id, None)
    _auto_reply_configs.pop(connection_id, None)

    logger.info("Disconnected social account (id=%s)", connection_id)
    return {"success": True}


# ── Auto-Reply Configuration ───────────────────────────────────────


@router.get("/connections/{connection_id}/auto-reply", response_model=dict)
async def get_auto_reply_config(connection_id: str):
    """Get the auto-reply configuration for a social connection."""
    _get_connection_or_404(connection_id)
    config = _auto_reply_configs.get(connection_id, {
        "enabled": False,
        "welcome_message": "",
        "keywords": [],
        "ai_response": True,
        "working_hours_only": False,
        "crm_sync": True,
    })
    return {"auto_reply": config}


@router.put("/connections/{connection_id}/auto-reply", response_model=dict)
async def update_auto_reply_config(connection_id: str, body: AutoReplyConfig):
    """Update auto-reply settings for a social connection."""
    _get_connection_or_404(connection_id)

    config = {
        "connection_id": connection_id,
        "enabled": body.enabled if body.enabled is not None else False,
        "welcome_message": body.welcome_message or "",
        "keywords": body.keywords or [],
        "ai_response": body.ai_response if body.ai_response is not None else True,
        "working_hours_only": body.working_hours_only if body.working_hours_only is not None else False,
        "crm_sync": body.crm_sync if body.crm_sync is not None else True,
        "updated_at": "2025-05-25T00:00:00Z",
    }

    _auto_reply_configs[connection_id] = config
    logger.info("Updated auto-reply config for connection (id=%s)", connection_id)

    return {"auto_reply": config}


# ── Message Management ─────────────────────────────────────────────


@router.get("/connections/{connection_id}/messages", response_model=dict)
async def list_messages(
    connection_id: str,
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = Query(False),
):
    """List recent messages from a social connection."""
    _get_connection_or_404(connection_id)
    msgs = _messages.get(connection_id, [])

    if unread_only:
        msgs = [m for m in msgs if not m.get("read", False)]

    msgs.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return {"messages": msgs[:limit], "total": len(msgs), "unread": len([m for m in msgs if not m.get("read", False)])}


@router.post("/connections/{connection_id}/messages", response_model=dict, status_code=201)
async def send_message(connection_id: str, body: SocialMessageResponse):
    """Send a message through a social connection."""
    _get_connection_or_404(connection_id)
    msg_id = str(uuid.uuid4())

    message = {
        "id": msg_id,
        "connection_id": connection_id,
        "content": body.content,
        "direction": "outgoing",
        "status": "sent",
        "created_at": "2025-05-25T00:00:00Z",
    }

    if connection_id not in _messages:
        _messages[connection_id] = []
    _messages[connection_id].append(message)

    logger.info("Sent message via connection (id=%s)", connection_id)
    return {"message": message}


@router.get("/messages/inbox", response_model=dict)
async def get_inbox(
    limit: int = Query(20, ge=1, le=100),
    platform: Optional[str] = Query(None),
):
    """Get aggregated inbox across all connected social platforms."""
    all_messages = []
    for conn_id, msgs in _messages.items():
        conn = _connections.get(conn_id)
        if conn and (not platform or conn["platform"] == platform):
            for msg in msgs:
                all_messages.append({
                    **msg,
                    "platform": conn["platform"],
                    "account_name": conn["account_name"],
                })

    all_messages.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return {
        "messages": all_messages[:limit],
        "total": len(all_messages),
        "platforms": list(set(c["platform"] for c in _connections.values())),
    }


# ── Platform Status ────────────────────────────────────────────────


@router.get("/platforms", response_model=dict)
async def list_platforms():
    """List all supported social platforms with their status."""
    return {
        "platforms": [
            {
                "id": "instagram",
                "name": "Instagram",
                "description": "DM automation, comment replies, lead capture",
                "icon": "instagram",
                "available": True,
                "connected_count": len([c for c in _connections.values() if c["platform"] == "instagram"]),
            },
            {
                "id": "facebook",
                "name": "Facebook Messenger",
                "description": "Automated responses, lead forms, page bots",
                "icon": "facebook",
                "available": True,
                "connected_count": len([c for c in _connections.values() if c["platform"] == "facebook"]),
            },
            {
                "id": "whatsapp",
                "name": "WhatsApp",
                "description": "Business API, templates, automated replies",
                "icon": "message_square",
                "available": True,
                "connected_count": len([c for c in _connections.values() if c["platform"] == "whatsapp"]),
            },
        ]
    }


@router.post("/sync/{connection_id}", response_model=dict)
async def sync_connection(connection_id: str):
    """Trigger a sync for a specific social connection."""
    conn = _get_connection_or_404(connection_id)
    conn["last_sync_at"] = "2025-05-25T00:00:00Z"
    _connections[connection_id] = conn

    logger.info("Synced social connection (id=%s)", connection_id)
    return {
        "success": True,
        "last_sync_at": conn["last_sync_at"],
        "platform": conn["platform"],
    }
