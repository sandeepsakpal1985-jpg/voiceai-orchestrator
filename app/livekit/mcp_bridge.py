"""
MCP Server Bridge — Integrates MCP (Model Context Protocol) servers with the LiveKit Agent.

Architecture:

    ┌─ VoiceAgent ──────────────────────────────────────────────┐
    │  tools=[                                                     │
    │    MCPToolset(id="db", mcp_server=MCPServerHTTP(...)),        │
    │    MCPToolset(id="web", mcp_server=MCPServerStdio(...)),      │
    │  ]                                                            │
    └──────────────────────────────────────────────────────────────-┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
            External MCP           External MCP
            Server (HTTP)          Server (Stdio)
            e.g. PostgreSQL        e.g. Web Search

Configuration (via MCP_SERVERS env var):

    MCP_SERVERS = json_encode([
        {
            "id": "database",
            "type": "http",
            "url": "http://localhost:8080/mcp",
            "headers": {"Authorization": "Bearer ..."},
        },
        {
            "id": "filesystem",
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
        },
    ])

Usage:
    from app.livekit.mcp_bridge import load_mcp_toolsets

    toolsets = await load_mcp_toolsets()
    agent = AdaptiveVoiceAgent(
        instructions=BASE_INSTRUCTIONS,
        tools=[*toolsets],  # Pass MCP toolsets alongside @function_tool methods
        ...
    )
"""

import json
import logging
import os
from typing import Any

logger = logging.getLogger("voiceai.livekit.mcp_bridge")


def _parse_mcp_servers_config() -> list[dict[str, Any]]:
    """Parse MCP server configurations from the MCP_SERVERS env var.

    The env var should be a JSON-encoded list of server config dicts.
    Returns an empty list if not configured or on parse error.

    Config format per server:
        {
            "id": "unique-server-id",
            "type": "http" | "stdio",
            "url": "http://..." (required for http),
            "command": "cmd" (required for stdio),
            "args": ["arg1", "arg2"] (optional for stdio),
            "env": {"KEY": "VALUE"} (optional for stdio),
            "cwd": "/path" (optional for stdio),
            "headers": {"Authorization": "Bearer ..."} (optional for http),
            "timeout": 30 (optional, default 5),
        }
    """
    raw = os.getenv("MCP_SERVERS", "")
    if not raw:
        return []

    try:
        configs = json.loads(raw)
        if not isinstance(configs, list):
            logger.warning("MCP_SERVERS must be a JSON list of server configs")
            return []
        return configs
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse MCP_SERVERS config: %s", e)
        return []


def _create_mcp_server(config: dict[str, Any]):
    """Create an MCPServer instance from a configuration dict.

    Args:
        config: Server config dict with fields described in _parse_mcp_servers_config

    Returns:
        An MCPServer instance (MCPServerHTTP or MCPServerStdio), or None on error

    Raises:
        ValueError: If config is invalid or missing required fields
    """
    server_type = config.get("type", "").lower()
    server_id = config.get("id", "unknown")

    if server_type == "http":
        url = config.get("url", "")
        if not url:
            raise ValueError(f"MCP HTTP server '{server_id}' missing 'url'")

        from livekit.agents.llm.mcp import MCPServerHTTP

        return MCPServerHTTP(
            url=url,
            headers=config.get("headers"),
            timeout=config.get("timeout", 5),
            sse_read_timeout=config.get("sse_read_timeout", 300),
        )

    elif server_type == "stdio":
        command = config.get("command", "")
        if not command:
            raise ValueError(f"MCP Stdio server '{server_id}' missing 'command'")

        from livekit.agents.llm.mcp import MCPServerStdio

        return MCPServerStdio(
            command=command,
            args=config.get("args", []),
            env=config.get("env"),
            cwd=config.get("cwd"),
        )

    else:
        raise ValueError(f"Unsupported MCP server type '{server_type}' for '{server_id}'. Use 'http' or 'stdio'.")


async def load_mcp_toolsets() -> list:
    """Load all configured MCP servers and wrap them as MCPToolset instances.

    Reads MCP_SERVERS env var, creates MCPServer instances for each
    configured server, wraps them in MCPToolset, calls setup(), and
    returns the list ready to pass to the Agent's ``tools`` parameter.

    Returns:
        List of MCPToolset instances (ready for Agent.tools), or empty list
        if no MCP servers are configured or all fail to load.
    """
    from livekit.agents.llm.mcp import MCPToolset

    configs = _parse_mcp_servers_config()
    if not configs:
        logger.debug("No MCP servers configured (MCP_SERVERS empty or not set)")
        return []

    toolsets: list = []
    for config in configs:
        server_id = config.get("id", "mcp-server")
        try:
            server = _create_mcp_server(config)
            if server is None:
                continue

            toolset = MCPToolset(id=server_id, mcp_server=server)
            await toolset.setup()
            toolsets.append(toolset)
            logger.info(
                "MCP toolset '%s' connected (%s server: %s)",
                server_id,
                config.get("type"),
                config.get("url", config.get("command", "unknown")),
            )

        except Exception as e:
            logger.warning("Failed to load MCP server '%s': %s", server_id, e)

    return toolsets


async def close_mcp_toolsets(toolsets: list) -> None:
    """Gracefully close all MCP toolsets.

    Args:
        toolsets: List of MCPToolset instances to close
    """
    for toolset in toolsets:
        try:
            await toolset.aclose()
            logger.debug("MCP toolset '%s' closed", getattr(toolset, 'id', 'unknown'))
        except Exception as e:
            logger.warning("Error closing MCP toolset: %s", e)
