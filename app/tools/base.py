"""
Tool Abstraction Layer — Core types and registry for MCP-compatible tools.

Provides:
- ToolDefinition: Standard tool schema for LLM tool calling
- ToolResult: Structured result from tool execution
- ToolRegistry: Central registry for all available tools
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine

logger = logging.getLogger("voiceai.tools")


@dataclass
class ToolDefinition:
    """Standard tool definition compatible with OpenAI/OpenRouter tool calling format.

    Example:
        def get_weather(city: str) -> str:
            \"\"\"Get the weather for a city.\"\"\"
            ...

        tool = ToolDefinition(
            name="get_weather",
            description="Get the current weather for a city",
            parameters={
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "The city name",
                    }
                },
                "required": ["city"],
            },
            handler=get_weather,
        )
    """
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
    """Central registry for all tools that LLMs can call.

    Tools can be registered and then retrieved in the format
    required by different LLM providers (OpenAI, Ollama, etc.).

    Usage:
        registry = ToolRegistry()

        async def get_contact(name: str) -> str:
            return f"Contact info for {name}"

        registry.register(
            "get_contact",
            ToolDefinition(
                name="get_contact",
                description="Look up a contact by name",
                parameters={...},
                handler=get_contact,
            )
        )

        # For LLM provider
        tools = registry.get_openai_format()
        result = await registry.execute("get_contact", {"name": "John"})
    """

    def __init__(self):
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, name: str, tool: ToolDefinition) -> None:
        """Register a tool by name."""
        self._tools[name] = tool
        logger.info("Registered tool: %s", name)

    def unregister(self, name: str) -> None:
        """Remove a tool from the registry."""
        self._tools.pop(name, None)

    def get(self, name: str) -> ToolDefinition | None:
        """Get a tool by name."""
        return self._tools.get(name)

    def list_tools(self) -> list[str]:
        """List all registered tool names."""
        return list(self._tools.keys())

    def get_openai_format(self) -> list[dict]:
        """Get tools in OpenAI-compatible format for LLM tool calling."""
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                    "strict": t.strict,
                },
            }
            for t in self._tools.values()
        ]

    def get_ollama_format(self) -> list[dict]:
        """Get tools in Ollama-compatible format."""
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in self._tools.values()
        ]

    async def execute(self, name: str, arguments: dict) -> ToolResult:
        """Execute a tool by name with the given arguments.

        Args:
            name: Tool name
            arguments: Dict of arguments to pass to the tool handler

        Returns:
            ToolResult with the execution output
        """
        tool = self._tools.get(name)
        if not tool:
            return ToolResult(
                success=False,
                output="",
                tool_name=name,
                error=f"Tool '{name}' not found",
            )

        try:
            if hasattr(tool.handler, "__call__"):
                result = tool.handler(**arguments)
                if hasattr(result, "__await__"):
                    result = await result
                return ToolResult(
                    success=True,
                    output=str(result),
                    tool_name=name,
                )
            else:
                result = tool.handler(**arguments)
                return ToolResult(
                    success=True,
                    output=str(result),
                    tool_name=name,
                )
        except Exception as e:
            logger.exception("Tool '%s' execution error", name)
            return ToolResult(
                success=False,
                output="",
                tool_name=name,
                error=str(e),
            )

    async def execute_tool_calls(self, tool_calls: list[dict]) -> str:
        """Execute multiple tool calls and return their results.

        Args:
            tool_calls: List of tool call dicts from LLM response,
                       each with 'id', 'function' keys

        Returns:
            JSON string with results of all tool calls
        """
        results = []
        for tc in tool_calls:
            function_info = tc.get("function", {})
            name = function_info.get("name", "")
            try:
                arguments = json.loads(function_info.get("arguments", "{}"))
            except json.JSONDecodeError:
                arguments = {}

            result = await self.execute(name, arguments)
            results.append({
                "tool_call_id": tc.get("id", ""),
                "tool_name": name,
                "result": result.output if result.success else f"Error: {result.error}",
            })

        return json.dumps({"tool_results": results})


# ── Singleton ──

_tool_registry: ToolRegistry | None = None


def get_tool_registry() -> ToolRegistry:
    global _tool_registry
    if _tool_registry is None:
        _tool_registry = ToolRegistry()
    return _tool_registry


def reset_tool_registry() -> None:
    global _tool_registry
    _tool_registry = None
