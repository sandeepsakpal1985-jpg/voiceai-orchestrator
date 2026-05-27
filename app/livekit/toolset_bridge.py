"""
Toolset Bridge — Wraps the ToolRegistry as LiveKit-compatible toolsets.

Provides:
  - ToolRegistryToolset: Bridges all ToolRegistry tools as LiveKit Tool objects
    for direct use in the Agent constructor's `tools` parameter.
  - register_toolset_tools(): Registers the ToolRegistryToolset with the global
    tool registry singleton.

Architecture:

    ToolRegistry (CRM, RAG, custom tools)
        │
        ▼
    ToolRegistryToolset (extends livekit.agents.llm.Toolset)
        │
        ├── RawFunctionTool (lookup_contact)
        ├── RawFunctionTool (get_contact_history)
        ├── RawFunctionTool (update_contact_notes)
        └── RawFunctionTool (search_knowledge_base)
        │
        ▼
    AdaptiveVoiceAgent.__init__(tools=[toolset])
        │
        ▼
    LiveKit AgentSession (native tool calling)

This enables the LiveKit framework to call ToolRegistry tools natively
during voice conversations, without needing @function_tool decorators
on the Agent subclass.
"""

import logging
from typing import Any

from livekit.agents.llm import Toolset, function_tool

logger = logging.getLogger("voiceai.livekit.toolset_bridge")


class ToolRegistryToolset(Toolset):
    """Wraps the global ToolRegistry as a LiveKit-compatible Toolset.

    Discovers all tools registered in the ToolRegistry and wraps each
    one as a RawFunctionTool with the exact parameter schema from the
    ToolDefinition. This preserves the manually crafted schemas for
    optimal LLM tool calling.

    Usage:
        toolset = ToolRegistryToolset()
        agent = AdaptiveVoiceAgent(..., tools=[toolset])
    """

    def __init__(self) -> None:
        from app.tools.base import get_tool_registry

        registry = get_tool_registry()
        tool_instances: list[Any] = []
        tool_names: list[str] = []

        for tool_name in registry.list_tools():
            tool_def = registry.get(tool_name)
            if tool_def is None:
                continue

            try:
                # Use raw_schema to preserve the exact parameter schema
                # from ToolDefinition, ensuring the LLM sees the same
                # schema that the ToolRegistry validates against.
                tool = function_tool(
                    tool_def.handler,
                    name=tool_def.name,
                    description=tool_def.description,
                    raw_schema={
                        "name": tool_def.name,
                        "description": tool_def.description,
                        "parameters": tool_def.parameters,
                        "strict": tool_def.strict,
                    },
                )
                tool_instances.append(tool)
                tool_names.append(tool_def.name)
            except Exception as e:
                logger.warning(
                    "Failed to wrap tool '%s': %s", tool_def.name, e
                )

        super().__init__(
            id="tool_registry",
            tools=tool_instances if tool_instances else None,
        )

        if tool_names:
            logger.info(
                "ToolRegistryToolset wrapping %d tools: %s",
                len(tool_names),
                ", ".join(tool_names),
            )


def create_registry_toolset() -> ToolRegistryToolset | None:
    """Create a ToolRegistryToolset if the ToolRegistry has tools.

    Returns:
        ToolRegistryToolset instance if tools are registered, else None.
        This allows callers to skip the toolset when no tools exist.
    """
    from app.tools.base import get_tool_registry

    registry = get_tool_registry()
    if not registry.list_tools():
        logger.debug("No tools registered in ToolRegistry — skipping toolset")
        return None

    return ToolRegistryToolset()
