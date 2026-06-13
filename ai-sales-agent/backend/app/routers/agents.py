"""
Agent Management Router — CRUD operations for AI agent configuration.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import AgentCreate, AgentUpdate

logger = logging.getLogger("ai_sales_agent.agents")
router = APIRouter(prefix="/agents", tags=["Agents"])

_agents: dict[str, dict] = {}


@router.get("", response_model=dict)
async def list_agents(user_id: Optional[str] = Query(None), active_only: bool = Query(False)):
    agents = list(_agents.values())
    if user_id:
        agents = [a for a in agents if a.get("user_id") == user_id]
    if active_only:
        agents = [a for a in agents if a.get("is_active", False)]
    return {"agents": agents, "total": len(agents)}


@router.post("", response_model=dict, status_code=201)
async def create_agent(body: AgentCreate):
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    agent_id = str(uuid.uuid4())
    agent = {
        "id": agent_id, "user_id": body.user_id or "default", "name": body.name,
        "description": body.description, "system_prompt": body.system_prompt,
        "language": body.language or "en-US", "voice_id": body.voice_id,
        "stt_provider": body.stt_provider or "whisper", "llm_provider": body.llm_provider or "ollama",
        "tts_provider": body.tts_provider or "kokoro",
        "memory_enabled": body.memory_enabled if body.memory_enabled is not None else True,
        "tools_enabled": body.tools_enabled if body.tools_enabled is not None else True,
        "is_active": True, "temperature": body.temperature or 0.7, "max_tokens": body.max_tokens or 1024,
        "created_at": now, "updated_at": now,
    }
    _agents[agent_id] = agent
    logger.info("Created agent '%s' (id=%s)", body.name, agent_id)
    return {"agent": agent}


@router.get("/{agent_id}", response_model=dict)
async def get_agent(agent_id: str):
    agent = _agents.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"agent": agent}


@router.put("/{agent_id}", response_model=dict)
async def update_agent(agent_id: str, body: AgentUpdate):
    agent = _agents.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            agent[key] = value
    agent["updated_at"] = now
    _agents[agent_id] = agent
    return {"agent": agent}


@router.delete("/{agent_id}", response_model=dict)
async def delete_agent(agent_id: str):
    agent = _agents.pop(agent_id, None)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"success": True}


@router.post("/{agent_id}/activate", response_model=dict)
async def activate_agent(agent_id: str):
    agent = _agents.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent["is_active"] = True
    return {"agent": agent}


@router.post("/{agent_id}/deactivate", response_model=dict)
async def deactivate_agent(agent_id: str):
    agent = _agents.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent["is_active"] = False
    return {"agent": agent}
