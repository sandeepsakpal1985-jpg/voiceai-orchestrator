"""
ToolRegistry MCP Server Bridge — Exposes the in-process ToolRegistry as an MCPServer.

This allows the ToolRegistry's CRM and RAG tools to be accessed via the MCP protocol
using LiveKit's MCPServer → MCPToolset → Agent.tools pipeline.

Architecture:

    ┌─ VoiceAgent ──────────────────────────────────────┐
    │  tools=[                                            │
    │    MCPToolset(id="tool_registry", mcp_server=...)    │
    │  ]                                                   │
    └──────────────────────────┬──────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
            ToolRegistryMCPServer   External MCP Server
            (in-process memory)     (e.g., PostgreSQL)

    ToolRegistryMCPServer creates a pair of anyio memory object streams
    and runs an in-process MCP protocol handler on one end. The LiveKit
    MCPToolset connects to the other end, treating it like any external
    MCP server — but without any network overhead.

Usage:
    from app.livekit.mcp_server_bridge import create_tool_registry_mcp_server

    server = create_tool_registry_mcp_server()
    if server:
        toolset = MCPToolset(id="tool_registry", mcp_server=server)
        await toolset.setup()
        agent = AdaptiveVoiceAgent(..., tools=[toolset])
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from anyio import create_memory_object_stream
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from livekit.agents.llm.mcp import MCPServer
from mcp.shared.message import SessionMessage
from mcp.types import (
    CallToolResult,
    Implementation,
    InitializeResult,
    JSONRPCError as MCPJSONRPCError,
    JSONRPCMessage,
    JSONRPCNotification,
    JSONRPCRequest,
    JSONRPCResponse,
    ListToolsResult,
    ServerCapabilities,
    TextContent,
    Tool as MCPTool,
)
from mcp.shared.version import LATEST_PROTOCOL_VERSION

from app.tools.base import get_tool_registry

logger = logging.getLogger("voiceai.livekit.mcp_server_bridge")

# ── Helpers ─────────────────────────────────────────────────────────


def _tool_registry_to_mcp_tools() -> list[MCPTool]:
    """Convert ToolRegistry tools to MCP Tool format for tools/list."""
    registry = get_tool_registry()
    mcp_tools: list[MCPTool] = []

    for name in registry.list_tools():
        tool_def = registry.get(name)
        if tool_def is None:
            continue

        mcp_tools.append(
            MCPTool(
                name=tool_def.name,
                description=tool_def.description or "",
                inputSchema=tool_def.parameters,
            )
        )

    return mcp_tools


def _jsonrpc_response(
    request: JSONRPCRequest,
    result: dict[str, Any],
) -> SessionMessage:
    """Create a SessionMessage wrapping a successful JSON-RPC response."""
    return SessionMessage(
        message=JSONRPCMessage(
            root=JSONRPCResponse(
                jsonrpc="2.0",
                id=request.id,
                result=result,
            )
        )
    )


def _jsonrpc_error(
    request: JSONRPCRequest,
    code: int,
    message: str,
) -> SessionMessage:
    """Create a SessionMessage wrapping a JSON-RPC error response."""
    return SessionMessage(
        message=JSONRPCMessage(
            root=MCPJSONRPCError(
                jsonrpc="2.0",
                id=request.id,
                error={
                    "code": code,
                    "message": message,
                },
            )
        )
    )


# ── MCP Server Handler ─────────────────────────────────────────────


async def _handle_mcp_request(
    request: JSONRPCRequest,
) -> dict[str, Any]:
    """Handle a single MCP JSON-RPC request and return the result dict.

    Supports:
        - initialize          → InitializeResult
        - tools/list          → ListToolsResult
        - tools/call          → CallToolResult
        - ping                → empty dict
    """
    method = request.method
    params = request.params or {}

    if method == "initialize":
        return _handle_initialize(params)

    elif method == "tools/list":
        return _handle_tools_list()

    elif method == "tools/call":
        return await _handle_tools_call(params)

    elif method == "ping":
        return {}

    else:
        raise ValueError(f"Unknown MCP method: {method}")


def _handle_initialize(params: dict[str, Any]) -> dict[str, Any]:
    """Handle the MCP initialize request."""
    return InitializeResult(
        protocolVersion=LATEST_PROTOCOL_VERSION,
        capabilities=ServerCapabilities(
            tools={},  # Enable tool support
            logging=None,
            prompts=None,
            resources=None,
        ),
        serverInfo=Implementation(
            name="tool-registry-bridge",
            version="1.0.0",
        ),
        instructions="Access CRM and RAG tools via the ToolRegistry",
    ).model_dump(mode="json")


def _handle_tools_list() -> dict[str, Any]:
    """Handle the MCP tools/list request."""
    mcp_tools = _tool_registry_to_mcp_tools()
    result: ListToolsResult = ListToolsResult(tools=mcp_tools)
    return result.model_dump(mode="json")


async def _handle_tools_call(params: dict[str, Any]) -> dict[str, Any]:
    """Handle the MCP tools/call request."""
    tool_name = params.get("name", "")
    arguments = params.get("arguments", {})

    if not tool_name:
        return CallToolResult(
            content=[TextContent(type="text", text="Error: Missing tool name")],
            isError=True,
        ).model_dump(mode="json")

    try:
        registry = get_tool_registry()
        result = await registry.execute(tool_name, arguments)

        if result.success:
            return CallToolResult(
                content=[TextContent(type="text", text=result.output)],
                isError=False,
            ).model_dump(mode="json")
        else:
            error_msg = result.error or "Unknown error"
            return CallToolResult(
                content=[TextContent(type="text", text=f"Error: {error_msg}")],
                isError=True,
            ).model_dump(mode="json")

    except Exception as e:
        logger.exception("Tool execution error: %s", tool_name)
        return CallToolResult(
            content=[TextContent(type="text", text=f"Error: {e}")],
            isError=True,
        ).model_dump(mode="json")


# ── Server Runner ──────────────────────────────────────────────────


async def _run_mcp_server(
    receive_from_client: MemoryObjectReceiveStream[SessionMessage],
    send_to_client: MemoryObjectSendStream[SessionMessage],
) -> None:
    """Run the MCP server loop, processing client messages.

    Reads SessionMessage objects from receive_from_client, processes
    JSON-RPC requests/notifications, and sends responses to
    send_to_client.
    """
    try:
        async with receive_from_client, send_to_client:
            async for session_msg in receive_from_client:
                try:
                    jmsg: JSONRPCMessage = session_msg.message
                    root = jmsg.root

                    # ── Notifications (no response expected) ──
                    if isinstance(root, JSONRPCNotification):
                        method = root.method
                        if method == "notifications/initialized":
                            logger.debug("MCP: client initialized")
                        elif method == "notifications/cancelled":
                            logger.debug("MCP: request cancelled")
                        else:
                            logger.debug(
                                "MCP: unhandled notification: %s", method
                            )
                        continue

                    # ── Requests (response expected) ──
                    if not isinstance(root, JSONRPCRequest):
                        logger.warning(
                            "MCP: unexpected message type: %s", type(root).__name__
                        )
                        continue

                    request_id = root.id
                    logger.debug(
                        "MCP: request %s: %s", request_id, root.method
                    )

                    # Process and respond
                    # JSONRPCRequest is guaranteed to have .method
                    result_dict = await _handle_mcp_request(root)
                    response = _jsonrpc_response(root, result_dict)
                    await send_to_client.send(response)

                except Exception as e:
                    logger.exception("Error processing MCP message: %s", e)
                    # Try to send an error response if we have a request_id
                    if isinstance(session_msg.message.root, JSONRPCRequest):
                        error_resp = _jsonrpc_error(
                            session_msg.message.root,
                            code=-32603,
                            message=f"Internal error: {e}",
                        )
                        try:
                            await send_to_client.send(error_resp)
                        except Exception:
                            pass

    except asyncio.CancelledError:
        logger.debug("MCP server task cancelled")
        raise
    except Exception as e:
        logger.error("MCP server error: %s", e)
        raise


# ── ToolRegistryMCPServer ──────────────────────────────────────────


class ToolRegistryMCPServer(MCPServer):
    """In-process MCPServer that bridges to the ToolRegistry.

    Pairs with LiveKit's MCPToolset to expose ToolRegistry tools
    (CRM, RAG, custom) via the MCP protocol over in-process memory
    object streams — no network or subprocess overhead.

    Usage:
        server = ToolRegistryMCPServer()
        toolset = MCPToolset(id=\"tool_registry\", mcp_server=server)
        await toolset.setup()
        agent = VoiceAgent(..., tools=[toolset])
    """

    def __init__(self) -> None:
        super().__init__(client_session_timeout_seconds=30.0)
        self._server_task: asyncio.Task[None] | None = None

    @asynccontextmanager
    async def client_streams(
        self,
    ) -> AsyncIterator[
        tuple[
            MemoryObjectReceiveStream[SessionMessage | Exception],
            MemoryObjectSendStream[SessionMessage],
        ]
    ]:
        """Create in-process memory streams and start the MCP server.

        Returns two connected memory stream pairs:
          - The *client* end (receive responses, send requests)
          - The *server* end runs the MCP protocol handler

        The LiveKit MCPToolset's ClientSession connects to the client
        end, and our _run_mcp_server processes messages on the server end.
        """
        # ── Server receives from client ──
        # Client sends → server receives
        # send_to_server: where client puts messages
        # receive_from_client: where server reads messages
        send_to_server: MemoryObjectSendStream[SessionMessage]
        receive_from_client: MemoryObjectReceiveStream[SessionMessage]
        send_to_server, receive_from_client = (
            create_memory_object_stream[SessionMessage](256)
        )

        # ── Server sends to client ──
        # Server sends → client receives
        # send_to_client: where server puts responses
        # receive_from_server: where client reads responses
        send_to_client: MemoryObjectSendStream[SessionMessage]
        receive_from_server: MemoryObjectReceiveStream[SessionMessage]
        send_to_client, receive_from_server = (
            create_memory_object_stream[SessionMessage](256)
        )

        # Start the MCP server task (reads from receive_from_client,
        # writes to send_to_client)
        self._server_task = asyncio.create_task(
            _run_mcp_server(receive_from_client, send_to_client),
            name="ToolRegistryMCPServer._run_server",
        )

        try:
            # Return the *client* end: client receives from server,
            # client sends to server
            yield (receive_from_server, send_to_server)
        finally:
            self._server_task.cancel()
            try:
                await self._server_task
            except (asyncio.CancelledError, Exception):
                pass
            self._server_task = None


def create_tool_registry_mcp_server() -> ToolRegistryMCPServer | None:
    """Create a ToolRegistryMCPServer if the ToolRegistry has tools.

    Returns:
        ToolRegistryMCPServer instance if tools are registered, else None.
        This allows callers to skip the MCP server when no tools exist.
    """
    registry = get_tool_registry()
    if not registry.list_tools():
        logger.debug(
            "No tools registered in ToolRegistry — skipping MCP server"
        )
        return None
    return ToolRegistryMCPServer()
