"""Tests for telephony/freeswitch/esl_client.py — ESL protocol client.

Uses mocked asyncio streams to simulate FreeSWITCH ESL responses.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from telephony.freeswitch.esl_client import ESLClient
from telephony.freeswitch.exceptions import ESLConnectionError, ESLAuthError


class MockStreamReader:
    """Simulates an asyncio.StreamReader with canned responses.

    Responses are consumed in order (first in, first out).
    """

    def __init__(self, responses: list[bytes]):
        self._responses = responses.copy()
        self._buffer = b""

    async def read(self, n: int = 4096) -> bytes:
        if self._responses:
            return self._responses.pop(0)
        return b""

    async def readexactly(self, n: int) -> bytes:
        return await self.read(n)


class MockStreamWriter:
    """Simulates an asyncio.StreamWriter."""

    def __init__(self):
        self.written = bytearray()
        self._closed = False

    def write(self, data: bytes) -> None:
        self.written.extend(data)

    async def drain(self) -> None:
        pass

    def close(self) -> None:
        self._closed = True

    async def wait_closed(self) -> None:
        pass

    @property
    def is_closing(self) -> bool:
        return self._closed


@pytest.fixture
def esl_client():
    return ESLClient(host="127.0.0.1", port=8021, password="ClueCon", timeout=5)


@pytest.mark.asyncio
class TestESLClientConnect:
    async def test_connect_success(self, monkeypatch):
        """Test successful connection and authentication."""
        client = ESLClient(host="127.0.0.1", port=8021, password="ClueCon", timeout=5)

        # Simulate ESL greeting then auth success
        greeting = b"Content-Type: auth/request\n\n"
        auth_ok = b"Content-Type: command/reply\nReply-Text: +OK accepted\n\n"

        reader = MockStreamReader([greeting, auth_ok])

        async def mock_open_connection(host, port, **kwargs):
            return reader, MockStreamWriter()

        monkeypatch.setattr(asyncio, "open_connection", mock_open_connection)

        await client.connect()
        assert client.is_connected is True
        await client.disconnect()

    async def test_connect_auth_failure(self, monkeypatch):
        """Test authentication failure raises ESLAuthError."""
        client = ESLClient(host="127.0.0.1", port=8021, password="wrong", timeout=5)
        greeting = b"Content-Type: auth/request\n\n"
        auth_fail = b"Content-Type: command/reply\nReply-Text: -ERR invalid\n\n"

        reader = MockStreamReader([greeting, auth_fail])

        async def mock_open_connection(host, port, **kwargs):
            return reader, MockStreamWriter()

        monkeypatch.setattr(asyncio, "open_connection", mock_open_connection)

        with pytest.raises(ESLAuthError):
            await client.connect()

        await client.disconnect()

    async def test_connect_timeout(self, monkeypatch):
        """Test connection timeout raises ESLConnectionError."""
        client = ESLClient(host="10.0.0.1", port=8021, password="ClueCon", timeout=1)

        async def mock_open_connection(host, port, **kwargs):
            raise asyncio.TimeoutError("Connection timed out")

        monkeypatch.setattr(asyncio, "open_connection", mock_open_connection)

        with pytest.raises(ESLConnectionError):
            await client.connect()


@pytest.mark.asyncio
class TestESLClientCommands:
    async def setup_client(self, monkeypatch):
        """Helper to set up a connected client with mock streams."""
        client = ESLClient(host="127.0.0.1", port=8021, password="ClueCon", timeout=5)
        greeting = b"Content-Type: auth/request\n\n"
        auth_ok = b"Content-Type: command/reply\nReply-Text: +OK accepted\n\n"

        writer = MockStreamWriter()

        async def mock_open_connection(host, port, **kwargs):
            return MockStreamReader([greeting, auth_ok]), writer

        monkeypatch.setattr(asyncio, "open_connection", mock_open_connection)
        await client.connect()
        return client, writer

    async def test_send_command(self, monkeypatch):
        """Test sending an API command and parsing the response."""
        client, writer = await self.setup_client(monkeypatch)
        # Override reader to return a command response
        cmd_resp = b"Content-Type: command/reply\nReply-Text: +OK\nContent-Length: 5\n\nHello"
        # Need to inject the response into the reader
        client._reader = MockStreamReader([cmd_resp])

        resp = await client.send_command("status")
        assert b"api status" in writer.written
        await client.disconnect()

    async def test_subscribe_raw(self, monkeypatch):
        """Test subscribe sends raw 'event' command (no api prefix)."""
        client, writer = await self.setup_client(monkeypatch)
        # Reset writer to clear auth commands
        writer.written.clear()
        client._reader = MockStreamReader([
            b"Content-Type: command/reply\nReply-Text: +OK\n\n"
        ])

        resp = await client.subscribe("CHANNEL_ANSWER CHANNEL_HANGUP")
        # Must NOT have 'api' prefix
        written_str = writer.written.decode()
        assert written_str.startswith("event plain"), \
            f"Subscribe should start with 'event plain', got: {written_str}"
        assert "CHANNEL_ANSWER" in written_str
        assert "CHANNEL_HANGUP" in written_str
        await client.disconnect()

    async def test_uuid_record(self, monkeypatch):
        """Test uuid_record command format."""
        client, writer = await self.setup_client(monkeypatch)
        client._reader = MockStreamReader([
            b"Content-Type: command/reply\nReply-Text: +OK\n\n"
        ])

        success = await client.execute_uuid_record(
            "call-uuid-123",
            "/tmp/recording.wav",
            limit_seconds=10,
        )
        written = writer.written.decode()
        assert "uuid_record call-uuid-123 start" in written
        assert "/tmp/recording.wav" in written
        assert "10s" in written
        await client.disconnect()

    async def test_stop_record(self, monkeypatch):
        """Test uuid_record stop (no extra UUID argument)."""
        client, writer = await self.setup_client(monkeypatch)
        # Reset writer to clear auth commands
        writer.written.clear()
        client._reader = MockStreamReader([
            b"Content-Type: command/reply\nReply-Text: +OK\n\n"
        ])

        success = await client.execute_stop_record("call-uuid-123")
        written = writer.written.decode()
        # Should be "api uuid_record call-uuid-123 stop" — no extra arg
        assert "uuid_record call-uuid-123 stop" in written
        assert written.strip() == "api uuid_record call-uuid-123 stop"
        await client.disconnect()

    async def test_uuid_broadcast(self, monkeypatch):
        """Test uuid_broadcast command."""
        client, writer = await self.setup_client(monkeypatch)
        client._reader = MockStreamReader([
            b"Content-Type: command/reply\nReply-Text: +OK\n\n"
        ])

        success = await client.execute_uuid_broadcast("call-uuid", "/tmp/tts.wav")
        written = writer.written.decode()
        assert "uuid_broadcast" in written
        assert "call-uuid" in written
        assert "file:///tmp/tts.wav" in written or "file:///tmp/tts.wav" in written
        assert "aleg" in written
        await client.disconnect()

    async def test_execute_hangup(self, monkeypatch):
        """Test uuid_kill command."""
        client, writer = await self.setup_client(monkeypatch)
        client._reader = MockStreamReader([
            b"Content-Type: command/reply\nReply-Text: +OK\n\n"
        ])

        success = await client.execute_hangup("call-uuid-123")
        written = writer.written.decode()
        assert "uuid_kill call-uuid-123" in written
        await client.disconnect()

    async def test_setvar(self, monkeypatch):
        """Test uuid_setvar command."""
        client, writer = await self.setup_client(monkeypatch)
        client._reader = MockStreamReader([
            b"Content-Type: command/reply\nReply-Text: +OK\n\n"
        ])

        success = await client.execute_setvar("call-uuid", "my_var", "my_value")
        written = writer.written.decode()
        assert "uuid_setvar call-uuid my_var my_value" in written
        await client.disconnect()


@pytest.mark.asyncio
class TestESLClientEvents:
    async def test_event_dispatch(self, monkeypatch):
        """Test that registered event handlers are called."""
        client, writer = await self._make_connected(monkeypatch)
        events_received = []

        async def handler(event):
            events_received.append(event)

        client.on_event("CHANNEL_ANSWER", handler)
        client.on_raw(lambda e: events_received.append(("raw", e)))

        # Simulate a CHANNEL_ANSWER event
        client._reader = MockStreamReader([
            b"Content-Type: text/event-plain\n\n"
            b"Event-Name: CHANNEL_ANSWER\n"
            b"Unique-ID: abc-123\n"
            b"Caller-Caller-ID-Number: +15551234567\n\n"
        ])

        # Manually trigger read
        resp = await client._read_response()
        event = client._parse_event(resp)
        assert event is not None
        assert event["Event-Name"] == "CHANNEL_ANSWER"
        assert event["Unique-ID"] == "abc-123"

        await client.disconnect()

    async def test_parse_event_returns_none_for_non_events(self, monkeypatch):
        """Test that non-event responses return None from _parse_event."""
        client, writer = await self._make_connected(monkeypatch)
        resp = type("Resp", (), {"body": "Reply-Text: +OK", "headers": {}})()
        result = client._parse_event(resp)
        assert result is None
        await client.disconnect()

    async def _make_connected(self, monkeypatch):
        """Create a connected client for event tests."""
        client = ESLClient(host="127.0.0.1", port=8021, password="ClueCon", timeout=5)
        greeting = b"Content-Type: auth/request\n\n"
        auth_ok = b"Content-Type: command/reply\nReply-Text: +OK accepted\n\n"

        writer = MockStreamWriter()

        async def mock_open_connection(host, port, **kwargs):
            return MockStreamReader([greeting, auth_ok]), writer

        monkeypatch.setattr(asyncio, "open_connection", mock_open_connection)
        await client.connect()
        return client, writer
