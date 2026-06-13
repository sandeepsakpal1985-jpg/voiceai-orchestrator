"""
Toolset Bridge — Wraps the ToolRegistry as LiveKit-compatible toolsets.
"""

import logging

from livekit.agents.llm import Toolset, function_tool

logger = logging.getLogger("ai_sales_agent.livekit.toolset_bridge")


class ToolRegistryToolset(Toolset):
    """Wraps the global ToolRegistry as a LiveKit-compatible Toolset."""

    def __init__(self) -> None:
        from app.tools.base import get_tool_registry
        registry = get_tool_registry()
        tool_instances = []
        tool_names = []

        for tool_name in registry.list_tools():
            tool_def = registry.get(tool_name)
            if tool_def is None:
                continue
            try:
                tool = function_tool(tool_def.handler, name=tool_def.name, description=tool_def.description, raw_schema={"name": tool_def.name, "description": tool_def.description, "parameters": tool_def.parameters, "strict": tool_def.strict})
                tool_instances.append(tool)
                tool_names.append(tool_def.name)
            except Exception as e:
                logger.warning("Failed to wrap tool '%s': %s", tool_def.name, e)

        super().__init__(id="tool_registry", tools=tool_instances if tool_instances else None)
        if tool_names:
            logger.info("ToolRegistryToolset wrapping %d tools: %s", len(tool_names), ", ".join(tool_names))


def create_registry_toolset() -> ToolRegistryToolset | None:
    """Create a ToolRegistryToolset if the ToolRegistry has tools."""
    from app.tools.base import get_tool_registry
    registry = get_tool_registry()
    if not registry.list_tools():
        return None
    return ToolRegistryToolset()
