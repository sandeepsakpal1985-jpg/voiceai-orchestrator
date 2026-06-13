"""
FreeSWITCH ESL Client — Pure Python Event Socket Library client.

Communicates with FreeSWITCH over TCP to receive call events
and send API commands. No external dependencies beyond the standard library.

Protocol:
  1. Connect to FreeSWITCH ESL port (default 8021)
  2. Authenticate with password
  3. Subscribe to desired events
  4. Send API commands and receive responses
  5. Listen for events in an event loop

References:
  https://developer.signalwire.com/freeswitch/FreeSWITCH-Explained/Eventsocket/
"""

import asyncio
import logging
import re
import time
from typing import Callable, Coroutine

from .config import get_freeswitch_settings
from .exceptions import ESLAuthError, ESLCommandError, ESLConnectionError
from .types import ESLCommand, ESLResponse

logger = logging.getLogger("ai_sales_agent.freeswitch.esl")

# ESL response/event header terminator
HEADER_TERMINATOR = re.compile(rb"\n\n")
# Content-Length header pattern
CONTENT_LENGTH_RE = re.compile(rb"Content-Length:\s*(\d+)", re.IGNORECASE)
# Reply text pattern
REPLY_RE = re.compile(rb"Reply-Text:\s*(.+)", re.IGNORECASE)
# Job UUID pattern for bgapi commands
JOB_UUID_RE = re.compile(rb"Job-UUID:\s*(.+)", re.IGNORECASE)


class ESLClient:
    """Low-level asynchronous FreeSWITCH ESL client over TCP."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8021, password: str = "ClueCon", timeout: int = 10) -> None:
        self._host = host
        self._port = port
        self._password = password
        self._timeout = timeout
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._connected = False
        self._authenticated = False
        self._event_listener_task: asyncio.Task | None = None
        self._event_handlers: dict[str, list[Callable]] = {}
        # Raw event callbacks for unfiltered event processing
        self._raw_handlers: list[Callable] = []

    @property
    def is_connected(self) -> bool:
        return self._connected and self._authenticated

    async def connect(self) -> None:
        """Connect to FreeSWITCH ESL and authenticate."""
        if self._connected:
            return

        try:
            logger.info(
                "STAGE[ESL CONNECT] Connecting to FreeSWITCH ESL at %s:%s ...",
                self._host, self._port,
            )
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self._host, self._port),
                timeout=self._timeout,
            )
            self._connected = True
            logger.info("STAGE[ESL CONNECTED] TCP connection established")
        except Exception as exc:
            raise ESLConnectionError(self._host, self._port, cause=exc) from exc

        # Read the initial "Content-Type: auth/request" greeting
        greeting = await self._read_response()
        logger.debug("ESL greeting: %s", greeting.body[:100] if greeting.body else "")

        # Authenticate
        logger.info("STAGE[ESL AUTH] Authenticating...")
        auth_cmd = f"auth {self._password}\n\n"
        self._writer.write(auth_cmd.encode())
        await self._writer.drain()

        auth_response = await self._read_response()
        # Check both body and Reply-Text header for errors
        reply_text = auth_response.headers.get("Reply-Text", "")
        check_text = (auth_response.body + " " + reply_text).lower()
        if "error" in check_text or "-err" in check_text:
            raise ESLAuthError(reply_text or auth_response.body.strip() or "Authentication rejected")

        self._authenticated = True
        logger.info("STAGE[ESL AUTHENTICATED] FreeSWITCH ESL successfully authenticated")

    async def disconnect(self) -> None:
        """Disconnect from FreeSWITCH ESL cleanly."""
        logger.info("STAGE[ESL DISCONNECT] Disconnecting from FreeSWITCH ESL...")
        if self._event_listener_task:
            self._event_listener_task.cancel()
            try:
                await self._event_listener_task
            except (asyncio.CancelledError, Exception):
                pass
            self._event_listener_task = None

        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass

        self._connected = False
        self._authenticated = False
        self._reader = None
        self._writer = None
        logger.info("STAGE[ESL DISCONNECTED] Disconnected from FreeSWITCH ESL")

    async def subscribe(self, events: str = "all") -> ESLResponse:
        """Subscribe to FreeSWITCH events.

        NOTE: 'event' is a connection-level ESL command, NOT an API command.
        It must be sent raw without the 'api' or 'bgapi' prefix.

        Args:
            events: Comma-separated event names or "all".

        Returns:
            ESLResponse from FreeSWITCH.
        """
        if not self._connected or not self._writer:
            raise ESLConnectionError(self._host, self._port)
        raw = f"event plain {events}\n\n".encode()
        logger.info("STAGE[ESL SUBSCRIBE] Subscribing to events: %s", events)
        self._writer.write(raw)
        await self._writer.drain()
        resp = await self._read_response()
        logger.info("STAGE[ESL SUBSCRIBED] Event subscription %s", "OK" if resp.success else "FAILED")
        return resp

    async def send_command(self, command: str, bgapi: bool = False) -> ESLResponse:
        """Send an API command to FreeSWITCH.

        Args:
            command: The full command string (e.g. "show calls", "uuid_record ...")
            bgapi: If True, run as background job.

        Returns:
            Parsed ESLResponse.
        """
        if not self._connected or not self._writer:
            raise ESLConnectionError(self._host, self._port)

        cmd = ESLCommand(command=command, bgapi=bgapi)
        raw = cmd.encode()
        logger.debug("ESL -> %s", raw.decode().strip())
        self._writer.write(raw)
        await self._writer.drain()

        return await self._read_response()

    async def send_bgapi(self, command: str) -> str:
        """Send a background API command and return the job UUID.

        Args:
            command: API command string.

        Returns:
            Job UUID string for tracking completion.
        """
        resp = await self.send_command(command, bgapi=True)
        return resp.job_uuid

    async def execute_uuid_record(
        self, uuid: str, file_path: str, limit_seconds: int = 30
    ) -> bool:
        """Start recording a call's audio to a file.

        Args:
            uuid: Call UUID to record.
            file_path: Path to save the audio file.
            limit_seconds: Maximum recording duration.

        Returns:
            True if the command succeeded.
        """
        cmd = (
            f"uuid_record {uuid} start {file_path} "
            f"{limit_seconds}s 0 0 0"
        )
        resp = await self.send_command(cmd)
        return resp.success

    async def execute_stop_record(self, uuid: str) -> bool:
        """Stop recording a call.

        ESL syntax: uuid_record <uuid> stop
        (No path argument needed — FreeSWITCH uses the initially provided path.)

        Args:
            uuid: Call UUID to stop recording.

        Returns:
            True if the command succeeded.
        """
        resp = await self.send_command(f"uuid_record {uuid} stop")
        return resp.success

    async def execute_uuid_broadcast(
        self, uuid: str, file_path: str
    ) -> bool:
        """Play an audio file to a call leg.

        Args:
            uuid: Call UUID to play audio to.
            file_path: Path to the audio file to play.

        Returns:
            True if the command succeeded.
        """
        resp = await self.send_command(
            f"uuid_broadcast {uuid} file://{file_path} aleg"
        )
        return resp.success

    async def execute_setvar(self, uuid: str, var: str, value: str) -> bool:
        """Set a channel variable on a call.

        Args:
            uuid: Call UUID.
            var: Variable name.
            value: Variable value.

        Returns:
            True if the command succeeded.
        """
        resp = await self.send_command(
            f"uuid_setvar {uuid} {var} {value}"
        )
        return resp.success

    async def execute_hangup(self, uuid: str) -> bool:
        """Hang up a call.

        Args:
            uuid: Call UUID to hang up.

        Returns:
            True if the command succeeded.
        """
        resp = await self.send_command(f"uuid_kill {uuid}")
        return resp.success

    async def execute_park(self, uuid: str) -> bool:
        """Park a call (hold it in the dialplan).

        Args:
            uuid: Call UUID to park.

        Returns:
            True if the command succeeded.
        """
        resp = await self.send_command(f"uuid_transfer {uuid} park inline")
        return resp.success

    # ── Event Listeners ─────────────────────────────────────────────

    def on_event(self, event_name: str, handler: Callable) -> None:
        """Register a handler for a specific FreeSWITCH event.

        Args:
            event_name: Event name (e.g. "CHANNEL_ANSWER", "CHANNEL_HANGUP").
            handler: Async or sync callable receiving the event dict.
        """
        if event_name not in self._event_handlers:
            self._event_handlers[event_name] = []
        self._event_handlers[event_name].append(handler)

    def on_raw(self, handler: Callable) -> None:
        """Register a handler for ALL unfiltered events.

        Args:
            handler: Async or sync callable receiving parsed event dict.
        """
        self._raw_handlers.append(handler)

    async def listen(self) -> None:
        """Start listening for events in the background."""
        if self._event_listener_task:
            self._event_listener_task.cancel()

        async def _event_loop():
            logger.info("STAGE[ESL LISTENING] ESL event listener active")
            while self._connected and self._authenticated:
                try:
                    response = await self._read_response()
                    if not response.body:
                        continue

                    event = self._parse_event(response)
                    if not event:
                        continue

                    event_name = event.get("Event-Name", "")
                    # Dispatch raw handlers
                    for handler in self._raw_handlers:
                        await self._safe_dispatch(handler, event)

                    # Dispatch named event handlers
                    if event_name in self._event_handlers:
                        for handler in self._event_handlers[event_name]:
                            await self._safe_dispatch(handler, event)

                except asyncio.CancelledError:
                    break
                except Exception:
                    logger.exception("Error in ESL event loop")
                    await asyncio.sleep(1)

        self._event_listener_task = asyncio.create_task(_event_loop())
        logger.info("STAGE[ESL LISTENER STARTED] ESL event listener started")

    # ── Internal Helpers ────────────────────────────────────────────

    async def _read_response(self) -> ESLResponse:
        """Read a complete ESL response from the socket.

        ESL messages are formatted as:
          Content-Type: text/plain
          Content-Length: <n>

          <body of n bytes>

        Or with just a Content-Type and body terminated by \\n\\n.

        Returns:
            Parsed ESLResponse.
        """
        if not self._reader:
            return ESLResponse(success=False, body="No reader available")

        # Read until we have the full header
        header_bytes = bytearray()
        while True:
            chunk = await self._reader.read(4096)
            if not chunk:
                return ESLResponse(success=False, body="Connection closed")
            header_bytes.extend(chunk)
            if HEADER_TERMINATOR.search(header_bytes):
                break

        header_str = header_bytes.decode("utf-8", errors="replace")
        header_part, sep, body_part = header_str.partition("\n\n")

        headers = {}
        for line in header_part.strip().split("\n"):
            if ":" in line:
                key, val = line.split(":", 1)
                headers[key.strip()] = val.strip()

        content_type = headers.get("Content-Type", "text/plain")
        content_length = int(headers.get("Content-Length", "0"))

        body = body_part if sep else ""

        # Read remaining body bytes if Content-Length is specified
        if content_length > len(body.encode("utf-8")):
            remaining = content_length - len(body.encode("utf-8"))
            body_bytes = bytearray(body.encode("utf-8"))
            while remaining > 0:
                chunk = await self._reader.read(min(4096, remaining))
                if not chunk:
                    break
                body_bytes.extend(chunk)
                remaining -= len(chunk)
            body = body_bytes.decode("utf-8", errors="replace")

        # Parse reply status
        success = True
        job_uuid = ""
        for line in header_part.split("\n"):
            if line.startswith("Reply-Text:"):
                reply_text = line.split(":", 1)[1].strip().lower()
                if "error" in reply_text or "-err" in reply_text:
                    success = False
                break

        job_match = JOB_UUID_RE.search(header_bytes)
        if job_match:
            job_uuid = job_match.group(1).decode()

        return ESLResponse(
            success=success,
            body=body.strip(),
            headers=headers,
            content_type=content_type,
            job_uuid=job_uuid,
        )

    def _parse_event(self, response: ESLResponse) -> dict[str, str] | None:
        """Parse an ESL event into a simple key-value dict.

        Args:
            response: ESLResponse from the socket.

        Returns:
            Dict of event headers, or None if not an event.
        """
        event_headers = {}
        for line in response.body.split("\n"):
            line = line.strip()
            if ":" in line:
                key, val = line.split(":", 1)
                event_headers[key.strip()] = val.strip()

        if not event_headers.get("Event-Name"):
            return None

        return event_headers

    async def _safe_dispatch(self, handler: Callable, event: dict) -> None:
        """Dispatch an event to a handler, catching exceptions.

        Args:
            handler: The event handler callable.
            event: The parsed event dict.
        """
        try:
            result = handler(event)
            if hasattr(result, "__await__"):
                await result
        except Exception:
            logger.exception("Error in ESL event handler %s", handler.__name__)
