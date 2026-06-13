"""
Tool Abstraction Layer — Core types and registry for LLM-callable tools.
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine

logger = logging.getLogger("ai_sales_agent.tools")


@dataclass
class ToolDefinition:
    """Standard tool definition compatible with OpenAI/Ollama tool calling format."""
    name: str
    description: str
    parameters: dict
    handler: Callable[..., Coroutine[Any, Any, str]] | Callable[..., str]
    strict: bool = False


@dataclass
class ToolResult:
    """Structured result from a tool execution."""
    success: bool
    output: str
    tool_name: str
    error: str | None = None
    metadata: dict = field(default_factory=dict)


class ToolRegistry:
    """Central registry for all tools that LLMs can call."""

    def __init__(self):
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, name: str, tool: ToolDefinition) -> None:
        self._tools[name] = tool
        logger.info("Registered tool: %s", name)

    def unregister(self, name: str) -> None:
        self._tools.pop(name, None)

    def get(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def list_tools(self) -> list[str]:
        return list(self._tools.keys())

    def get_openai_format(self) -> list[dict]:
        return [{"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters, "strict": t.strict}} for t in self._tools.values()]

    async def execute(self, name: str, arguments: dict) -> ToolResult:
        tool = self._tools.get(name)
        if not tool:
            return ToolResult(success=False, output="", tool_name=name, error=f"Tool '{name}' not found")
        try:
            result = tool.handler(**arguments)
            if hasattr(result, "__await__"):
                result = await result
            return ToolResult(success=True, output=str(result), tool_name=name)
        except Exception as e:
            logger.exception("Tool '%s' execution error", name)
            return ToolResult(success=False, output="", tool_name=name, error=str(e))


_tool_registry: ToolRegistry | None = None


def get_tool_registry() -> ToolRegistry:
    global _tool_registry
    if _tool_registry is None:
        _tool_registry = ToolRegistry()
    return _tool_registry


def reset_tool_registry() -> None:
    global _tool_registry
    _tool_registry = None
