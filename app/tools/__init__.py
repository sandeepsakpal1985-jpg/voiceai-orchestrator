"""
MCP + Tool Abstraction Layer — Prepare system for external tools and MCP servers.

This package provides the abstraction layer for:
- MCP (Model Context Protocol) servers
- CRM tools (lookup contacts, update records)
- Calendar tools (check availability, schedule)
- RAG retrieval tools (knowledge base search)
- Custom business workflow tools

Architecture:
    LLM Provider → Tool Registry → MCP Servers / CRM / Calendar / RAG

Each tool is defined as a ToolDefinition that the LLM can call via
function/tool calling. The ToolRegistry manages available tools.

Usage:
    registry = ToolRegistry()
    registry.register("get_contact_info", get_contact_info_tool)
    tools = registry.get_openai_tools()  # For OpenAI-compatible APIs
"""

from .base import ToolDefinition, ToolResult, ToolRegistry, get_tool_registry

__all__ = [
    "ToolDefinition",
    "ToolResult",
    "ToolRegistry",
    "get_tool_registry",
]
