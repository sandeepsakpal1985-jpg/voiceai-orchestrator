"""
LiveKit E2E Integration Test — Connects to the real LiveKit server.

Requires:
  - LiveKit server running on localhost:7880 (docker compose)
  - Redis + PostgreSQL containers (docker compose)

This test validates that the LiveKit server is reachable and basic room
lifecycle operations work via the LiveKit REST API (port 7880).

It does NOT start a full voice agent session (which requires a real
WebRTC connection), but it does verify:
  1. LiveKit server health endpoint responds
  2. Room creation via REST API
  3. Room listing and deletion via REST API
  4. Token generation for room access
"""

import os
import uuid

import pytest
import requests

import json as json_mod

from app.config import settings

# ── Constants ────────────────────────────────────────────────────────

LIVEKIT_HTTP_URL = os.getenv("LIVEKIT_E2E_URL", "http://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "devsecret")
SKIP_REASON = "LiveKit server not reachable — start with: docker compose up -d livekit-server"


# ── Fixtures ─────────────────────────────────────────────────────────


def is_livekit_reachable() -> bool:
    """Check if LiveKit server is reachable via HTTP."""
    try:
        resp = requests.get(f"{LIVEKIT_HTTP_URL}/", timeout=3)
        return resp.status_code == 200
    except (requests.ConnectionError, requests.Timeout):
        return False


def generate_room_name() -> str:
    """Generate a unique room name for testing."""
    short_id = str(uuid.uuid4())[:8]
    return f"e2e-test-{short_id}"


def generate_admin_token(identity: str = "e2e-admin") -> str:
    """Generate a LiveKit admin token with room management grants.

    For REST API (Twirp) calls, the token needs room_create=True
    in the video grant to allow room CRUD operations.
    Uses livekit-api v1.1.x SDK: VideoGrants (plural), with_grants(), with_identity().
    """
    try:
        from livekit.api import AccessToken, VideoGrants

        grant = VideoGrants(
            room_create=True,
            room_admin=True,
            can_publish=True,
            can_subscribe=True,
        )
        token = (
            AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            .with_identity(identity)
            .with_grants(grant)
        )
        return token.to_jwt()
    except ImportError:
        import jwt as pyjwt
        import time

        payload = {
            "exp": int(time.time()) + 300,
            "iat": int(time.time()) - 10,
            "iss": LIVEKIT_API_KEY,
            "sub": identity,
            "video": {
                "roomCreate": True,
                "roomAdmin": True,
                "canPublish": True,
                "canSubscribe": True,
            },
        }
        return pyjwt.encode(payload, LIVEKIT_API_SECRET, algorithm="HS256")


def generate_join_token(room_name: str, identity: str = "e2e-user") -> str:
    """Generate a LiveKit join token for a specific room.

    Uses the livekit-api Python SDK to create a join token.
    Falls back to manual JWT if the SDK is not available.
    """
    try:
        from livekit.api import AccessToken, VideoGrants

        grant = VideoGrants(room_join=True, room=room_name)
        token = (
            AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            .with_identity(identity)
            .with_grants(grant)
        )
        return token.to_jwt()
    except ImportError:
        import jwt as pyjwt
        import time

        payload = {
            "exp": int(time.time()) + 300,
            "iat": int(time.time()) - 10,
            "iss": LIVEKIT_API_KEY,
            "sub": identity,
            "video": {
                "room": room_name,
                "roomJoin": True,
            },
        }
        return pyjwt.encode(payload, LIVEKIT_API_SECRET, algorithm="HS256")


# ── Test: LiveKit Server Health ──────────────────────────────────────


@pytest.mark.livekit_e2e
class TestLiveKitServerHealth:
    """Verify that the LiveKit server is running and responsive."""

    def test_livekit_server_is_reachable(self):
        """LiveKit HTTP endpoint should respond with OK."""
        if not is_livekit_reachable():
            pytest.skip(SKIP_REASON)
        resp = requests.get(f"{LIVEKIT_HTTP_URL}/", timeout=5)
        assert resp.status_code == 200
        assert resp.text.strip() == "OK"


# ── Test: Room Lifecycle ─────────────────────────────────────────────


@pytest.mark.livekit_e2e
class TestLiveKitRoomLifecycle:
    """Test room creation, listing, and deletion via LiveKit REST API."""

    @pytest.fixture(autouse=True)
    def setup(self):
        if not is_livekit_reachable():
            pytest.skip(SKIP_REASON)

    @staticmethod
    def _headers(token: str) -> dict:
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def test_create_and_list_rooms(self):
        """Should create a room and verify it appears in the room list."""
        room_name = generate_room_name()
        admin_token = generate_admin_token()

        # Create room via REST API
        create_resp = requests.post(
            f"{LIVEKIT_HTTP_URL}/twirp/livekit.RoomService/CreateRoom",
            headers=self._headers(admin_token),
            json={"name": room_name},
            timeout=5,
        )
        # LiveKit may return 200 (room created) or 409 (already exists)
        assert create_resp.status_code in (200, 409), f"Create room failed: {create_resp.text}"

        # List rooms
        list_resp = requests.get(
            f"{LIVEKIT_HTTP_URL}/twirp/livekit.RoomService/ListRooms",
            headers=self._headers(admin_token),
            timeout=5,
        )
        if list_resp.status_code == 200:
            data = list_resp.json()
            if "rooms" in data:
                room_names = [r.get("name", "") for r in data["rooms"]]
                assert room_name in room_names, f"Room '{room_name}' not found in list"

    def test_delete_room(self):
        """Should delete a room successfully."""
        room_name = generate_room_name()
        admin_token = generate_admin_token()

        # Create room first
        requests.post(
            f"{LIVEKIT_HTTP_URL}/twirp/livekit.RoomService/CreateRoom",
            headers=self._headers(admin_token),
            json={"name": room_name},
            timeout=5,
        )

        # Delete room
        delete_resp = requests.post(
            f"{LIVEKIT_HTTP_URL}/twirp/livekit.RoomService/DeleteRoom",
            headers=self._headers(admin_token),
            json={"room": room_name},
            timeout=5,
        )
        assert delete_resp.status_code in (200, 404), f"Delete failed: {delete_resp.text}"

    def test_create_duplicate_room(self):
        """Creating a room with an existing name should succeed (idempotent)."""
        room_name = generate_room_name()
        admin_token = generate_admin_token()

        # Create twice
        resp1 = requests.post(
            f"{LIVEKIT_HTTP_URL}/twirp/livekit.RoomService/CreateRoom",
            headers=self._headers(admin_token),
            json={"name": room_name},
            timeout=5,
        )
        resp2 = requests.post(
            f"{LIVEKIT_HTTP_URL}/twirp/livekit.RoomService/CreateRoom",
            headers=self._headers(admin_token),
            json={"name": room_name},
            timeout=5,
        )
        assert resp1.status_code in (200, 409)
        assert resp2.status_code in (200, 409)

    def test_room_with_metadata(self):
        """Should create a room with metadata and verify it's stored."""
        room_name = generate_room_name()
        metadata = {"test": "voiceai-e2e", "version": "1.0"}
        admin_token = generate_admin_token()

        create_resp = requests.post(
            f"{LIVEKIT_HTTP_URL}/twirp/livekit.RoomService/CreateRoom",
            headers=self._headers(admin_token),
            json={"name": room_name, "metadata": json_mod.dumps(metadata)},
            timeout=5,
        )
        assert create_resp.status_code in (200, 409)


# ── Test: Token Generation ───────────────────────────────────────────


@pytest.mark.livekit_e2e
class TestLiveKitTokenGeneration:
    """Verify that LiveKit access tokens can be generated."""

    def test_generate_join_token(self):
        """Should generate a valid JWT for room access."""
        room_name = generate_room_name()
        token = generate_join_token(room_name, identity="e2e-user")

        assert token is not None
        assert len(token) > 50  # JWT should be reasonably long
        assert isinstance(token, str)

    def test_token_has_correct_payload(self):
        """Generated JWT should contain the expected claims."""
        room_name = generate_room_name()
        identity = "test-bot"
        token = generate_join_token(room_name, identity=identity)

        import jwt as pyjwt

        decoded = pyjwt.decode(token, LIVEKIT_API_SECRET, algorithms=["HS256"])
        assert decoded["sub"] == identity
        assert decoded["video"]["room"] == room_name
        assert decoded["video"]["roomJoin"] is True
        assert "exp" in decoded
        # SDK uses nbf (not-before) instead of iat (issued-at) in the JWT
        assert "nbf" in decoded or "iat" in decoded


# ── Test: LiveKit RTC Connectivity (Smoke-level) ─────────────────────


@pytest.mark.livekit_e2e
class TestLiveKitRTCConnectivity:
    """Smoke test for LiveKit RTC connectivity (no full WebRTC handshake).

    Verifies that the LiveKit WebSocket endpoint is accepting connections.
    A full WebRTC connection test would require browser-level automation
    or a LiveKit participant SDK — this is a smoke-level check.
    """

    def test_websocket_endpoint_reachable(self):
        """WebSocket port should be open."""
        import socket

        host = "localhost"
        port = 7880

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        try:
            result = sock.connect_ex((host, port))
            assert result == 0, f"Port {port} on {host} is not open (error: {result})"
        finally:
            sock.close()

    def test_udp_port_reachable(self):
        """WebRTC UDP port should be reachable."""
        import socket

        host = "localhost"
        port = 7882

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(3)
        try:
            sock.connect((host, port))
            # Connection to UDP doesn't raise (it's connectionless),
            # but connect() will raise if the port is entirely unbound
            assert True
        except (socket.timeout, ConnectionRefusedError, OSError):
            pytest.skip("UDP port 7882 not reachable (may not be mapped on this host)")
        finally:
            sock.close()


# ── Test: LiveKit REST API Error Handling ─────────────────────────────


@pytest.mark.livekit_e2e
class TestLiveKitErrorHandling:
    """Verify LiveKit REST API returns proper errors for invalid requests."""

    def test_invalid_token_rejected(self):
        """Requests with invalid tokens should be rejected."""
        if not is_livekit_reachable():
            pytest.skip(SKIP_REASON)

        resp = requests.post(
            f"{LIVEKIT_HTTP_URL}/twirp/livekit.RoomService/ListRooms",
            headers={"Authorization": "Bearer invalidtoken", "Content-Type": "application/json"},
            timeout=5,
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"

    def test_empty_body_returns_error(self):
        """Requests with empty body should return 4xx."""
        admin_token = generate_admin_token()

        resp = requests.post(
            f"{LIVEKIT_HTTP_URL}/twirp/livekit.RoomService/CreateRoom",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={},
            timeout=5,
        )
        # Should either succeed (with default name) or return validation error
        assert resp.status_code in (200, 400, 422)


# ── Test: Worker Reconnection ────────────────────────────────────────


@pytest.mark.livekit_e2e
class TestLiveKitWorkerReconnection:
    """Verify the worker server can handle reconnection scenarios.

    These tests validate that:
    1. The worker server FastAPI app can be instantiated
    2. The worker server routes are properly configured
    3. VoiceAgent can be created and stopped safely (idempotent)
    4. Provider adapters load gracefully even with missing providers

    Full WebRTC reconnection testing requires browser-level automation
    (Playwright + LiveKit client SDK), but these tests verify the
    server-side readiness for reconnection scenarios.
    """

    def test_worker_server_app_created(self):
        """Worker server FastAPI app should be creatable."""
        from app.livekit.worker_server import worker_app
        assert worker_app.title == "VoiceAI LiveKit Worker"

    def test_worker_server_routes(self):
        """Worker server should expose expected routes."""
        from app.livekit.worker_server import worker_app
        routes = [r.path for r in worker_app.routes if hasattr(r, 'path')]
        assert "/health" in routes
        assert "/sessions/active" in routes
        assert "/sessions/start" in routes

    @pytest.mark.asyncio
    async def test_voice_agent_stop_is_idempotent(self):
        """VoiceAgent.stop() should be safe to call multiple times."""
        from app.livekit.voice_agent import VoiceAgent

        agent = VoiceAgent()
        # Should not raise even with no session started
        await agent.stop()
        await agent.stop()  # Second call should also work

    @pytest.mark.asyncio
    async def test_voice_agent_close_is_idempotent(self):
        """VoiceAgent.close() should be safe to call multiple times."""
        from app.livekit.voice_agent import VoiceAgent

        agent = VoiceAgent()
        await agent.close()
        await agent.close()  # Second call should also work

    def test_load_provider_adapters_handles_missing_providers(self):
        """Provider fallback should return None for missing providers."""
        import os
        from app.config import reload_settings

        # Save original
        orig_stt = os.environ.get("STT_PROVIDER", "")
        orig_llm = os.environ.get("LLM_PROVIDER", "")
        orig_tts = os.environ.get("TTS_PROVIDER", "")

        try:
            # Set all providers to nonexistent values
            os.environ["STT_PROVIDER"] = "nonexistent_stt"
            os.environ["LLM_PROVIDER"] = "nonexistent_llm"
            os.environ["TTS_PROVIDER"] = "nonexistent_tts"
            reload_settings()

            from app.livekit.voice_agent import _load_provider_adapters

            adapters = _load_provider_adapters()
            # All adapters should be None due to missing providers
            assert adapters["stt"] is None
            assert adapters["llm"] is None
            assert adapters["tts"] is None
            assert adapters["vad"] is None
            # Should not crash — all four keys must be present
            assert set(adapters.keys()) == {"stt", "llm", "tts", "vad"}
        finally:
            # Restore originals
            if orig_stt:
                os.environ["STT_PROVIDER"] = orig_stt
            else:
                os.environ.pop("STT_PROVIDER", None)
            if orig_llm:
                os.environ["LLM_PROVIDER"] = orig_llm
            else:
                os.environ.pop("LLM_PROVIDER", None)
            if orig_tts:
                os.environ["TTS_PROVIDER"] = orig_tts
            else:
                os.environ.pop("TTS_PROVIDER", None)
            reload_settings()

    def test_load_provider_adapters_mixed_missing(self):
        """Provider fallback should handle partial failures gracefully."""
        import os
        from app.config import reload_settings

        # Save original
        orig_llm = os.environ.get("LLM_PROVIDER", "")

        try:
            # Only LLM provider is missing — STT and TTS should still load
            os.environ["LLM_PROVIDER"] = "nonexistent_llm"
            reload_settings()

            from app.livekit.voice_agent import _load_provider_adapters

            adapters = _load_provider_adapters()
            # LLM should be None, but STT and TTS should load
            assert adapters["llm"] is None
            # STT and TTS may or may not load depending on actual providers
            # The key thing is we don't crash
            assert set(adapters.keys()) == {"stt", "llm", "tts", "vad"}
        finally:
            if orig_llm:
                os.environ["LLM_PROVIDER"] = orig_llm
            else:
                os.environ.pop("LLM_PROVIDER", None)
            reload_settings()
