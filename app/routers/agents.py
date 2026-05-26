"""Agent Management Router — CRUD operations for AI agent configuration.

Agents bind together STT/LLM/TTS providers with system prompts, tools,
social accounts, and memory settings. This router provides the API surface
for creating, reading, updating, and deleting agents.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.schemas import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    AgentToolCreate,
    AgentSocialAccountCreate,
    ToolResponse,
)
from app.services.conversation import get_conversation_service

logger = logging.getLogger("voiceai.agents")

router = APIRouter(prefix="/agents", tags=["Agents"])


# ── In-Memory Agent Store ──────────────────────────────────────────
# In production, this would be backed by PostgreSQL via Prisma.
# For now, we provide a lightweight in-memory store that mirrors
# the dashboard's API structure for development and testing.

_agents: dict[str, dict] = {}
_tools: dict[str, list[dict]] = {}
_social_accounts: dict[str, list[dict]] = {}


def _get_agent_or_404(agent_id: str) -> dict:
    agent = _agents.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


# ── Agent CRUD ─────────────────────────────────────────────────────


@router.get("", response_model=dict)
async def list_agents(
    user_id: Optional[str] = Query(None),
    active_only: bool = Query(False),
):
    """List all agents, optionally filtered by user or active status."""
    agents = list(_agents.values())
    if user_id:
        agents = [a for a in agents if a.get("user_id") == user_id]
    if active_only:
        agents = [a for a in agents if a.get("is_active", False)]
    return {
        "agents": agents,
        "total": len(agents),
    }


@router.post("", response_model=dict, status_code=201)
async def create_agent(body: AgentCreate):
    """Create a new AI agent with provider bindings and configuration."""
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    agent_id = str(uuid.uuid4())

    agent = {
        "id": agent_id,
        "user_id": body.user_id or "default",
        "name": body.name,
        "description": body.description,
        "system_prompt": body.system_prompt,
        "language": body.language or "en-US",
        "voice_id": body.voice_id,
        "stt_provider": body.stt_provider or "whisper",
        "llm_provider": body.llm_provider or "ollama",
        "tts_provider": body.tts_provider or "kokoro",
        "memory_enabled": body.memory_enabled if body.memory_enabled is not None else True,
        "memory_type": body.memory_type or "conversation",
        "tools_enabled": body.tools_enabled if body.tools_enabled is not None else True,
        "is_active": True,
        "temperature": body.temperature or 0.7,
        "max_tokens": body.max_tokens or 1024,
        "created_at": now,
        "updated_at": now,
    }

    _agents[agent_id] = agent
    _tools[agent_id] = []
    _social_accounts[agent_id] = []

    logger.info("Created agent '%s' (id=%s)", body.name, agent_id)
    return {"agent": agent, "tools": [], "social_accounts": []}


@router.get("/{agent_id}", response_model=dict)
async def get_agent(agent_id: str):
    """Get a single agent by ID with its tools and social accounts."""
    agent = _get_agent_or_404(agent_id)
    return {
        "agent": agent,
        "tools": _tools.get(agent_id, []),
        "social_accounts": _social_accounts.get(agent_id, []),
    }


@router.put("/{agent_id}", response_model=dict)
async def update_agent(agent_id: str, body: AgentUpdate):
    """Update an existing agent's configuration."""
    agent = _get_agent_or_404(agent_id)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            # Map camelCase from API to snake_case internal
            agent_key = key
            agent[agent_key] = value

    agent["updated_at"] = now
    _agents[agent_id] = agent

    logger.info("Updated agent '%s' (id=%s)", agent["name"], agent_id)
    return {"agent": agent, "tools": _tools.get(agent_id, []), "social_accounts": _social_accounts.get(agent_id, [])}


@router.delete("/{agent_id}", response_model=dict)
async def delete_agent(agent_id: str):
    """Delete an agent and its associated tools and social accounts."""
    _get_agent_or_404(agent_id)

    del _agents[agent_id]
    _tools.pop(agent_id, None)
    _social_accounts.pop(agent_id, None)

    logger.info("Deleted agent (id=%s)", agent_id)
    return {"success": True}


# ── Agent Tools ─────────────────────────────────────────────────────


@router.get("/{agent_id}/tools", response_model=dict)
async def list_agent_tools(agent_id: str):
    """List all tools configured for an agent."""
    _get_agent_or_404(agent_id)
    return {"tools": _tools.get(agent_id, [])}


@router.post("/{agent_id}/tools", response_model=dict, status_code=201)
async def add_agent_tool(agent_id: str, body: AgentToolCreate):
    """Add a tool to an agent (function call, webhook, or workflow)."""
    _get_agent_or_404(agent_id)

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    tool = {
        "id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "name": body.name,
        "type": body.type,
        "endpoint": body.endpoint,
        "schema": body.tool_schema,
        "enabled": body.enabled if body.enabled is not None else True,
        "created_at": now,
    }

    if agent_id not in _tools:
        _tools[agent_id] = []
    _tools[agent_id].append(tool)

    logger.info("Added tool '%s' to agent (id=%s)", body.name, agent_id)
    return {"tool": tool}


@router.delete("/{agent_id}/tools/{tool_id}", response_model=dict)
async def delete_agent_tool(agent_id: str, tool_id: str):
    """Remove a tool from an agent."""
    _get_agent_or_404(agent_id)
    tools = _tools.get(agent_id, [])
    _tools[agent_id] = [t for t in tools if t["id"] != tool_id]
    return {"success": True}


# ── Agent Social Accounts ───────────────────────────────────────────


@router.get("/{agent_id}/social", response_model=dict)
async def list_agent_social_accounts(agent_id: str):
    """List all social accounts connected to an agent."""
    _get_agent_or_404(agent_id)
    return {"social_accounts": _social_accounts.get(agent_id, [])}


@router.post("/{agent_id}/social", response_model=dict, status_code=201)
async def connect_agent_social(agent_id: str, body: AgentSocialAccountCreate):
    """Connect a social media account to an agent."""
    _get_agent_or_404(agent_id)

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    account = {
        "id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "platform": body.platform,
        "account_id": body.account_id,
        "account_name": body.account_name,
        "enabled": body.enabled if body.enabled is not None else True,
        "created_at": now,
    }

    if agent_id not in _social_accounts:
        _social_accounts[agent_id] = []
    _social_accounts[agent_id].append(account)

    logger.info("Connected %s account to agent (id=%s)", body.platform, agent_id)
    return {"social_account": account}


@router.delete("/{agent_id}/social/{social_id}", response_model=dict)
async def disconnect_agent_social(agent_id: str, social_id: str):
    """Disconnect a social account from an agent."""
    _get_agent_or_404(agent_id)
    accounts = _social_accounts.get(agent_id, [])
    _social_accounts[agent_id] = [a for a in accounts if a["id"] != social_id]
    return {"success": True}


# ── Agent Activation ────────────────────────────────────────────────


@router.post("/{agent_id}/activate", response_model=dict)
async def activate_agent(agent_id: str):
    """Activate an agent (enables it for receiving calls/messages)."""
    agent = _get_agent_or_404(agent_id)
    agent["is_active"] = True
    agent["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    _agents[agent_id] = agent
    logger.info("Activated agent (id=%s)", agent_id)
    return {"agent": agent}


@router.post("/{agent_id}/deactivate", response_model=dict)
async def deactivate_agent(agent_id: str):
    """Deactivate an agent."""
    agent = _get_agent_or_404(agent_id)
    agent["is_active"] = False
    agent["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    _agents[agent_id] = agent
    logger.info("Deactivated agent (id=%s)", agent_id)
    return {"agent": agent}
