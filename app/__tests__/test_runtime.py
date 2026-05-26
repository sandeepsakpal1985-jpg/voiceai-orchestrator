"""Tests for the Runtime Status endpoints (app/routers/runtime.py).

Tests cover:
    - GET /runtime/livekit — LiveKit room status (enabled/disabled, error)
    - GET /runtime/sip — Active SIP call status
    - GET /runtime/providers — Registered provider health
    - GET /runtime/status — Aggregated runtime status
    - Error handling and edge cases
"""

from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

# Build a minimal test app with just the runtime router
app = FastAPI()
from app.routers.runtime import router  # noqa: PLC0415
app.include_router(router)


class TestLiveKitStatus:
    """Tests for GET /runtime/livekit."""

    @pytest.mark.asyncio
    async def test_livekit_disabled(self):
        """Returns disabled status when LIVEKIT_ENABLED is False."""
        with patch("app.routers.runtime.settings.LIVEKIT_ENABLED", False):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/livekit")
                assert resp.status_code == 200
                data = resp.json()
                assert data["enabled"] is False
                assert data["connected"] is False
                assert data["active_rooms"] == 0
                assert data["rooms"] == []

    @pytest.mark.asyncio
    async def test_livekit_enabled_room_manager_not_available(self):
        """Returns degraded status when room manager is not importable."""
        with (
            patch("app.routers.runtime.settings.LIVEKIT_ENABLED", True),
            patch(
                "app.routers.runtime._get_room_manager",
                return_value=None,
            ),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/livekit")
                assert resp.status_code == 200
                data = resp.json()
                assert data["enabled"] is True
                assert data["connected"] is True
                assert data["active_rooms"] == 0

    @pytest.mark.asyncio
    async def test_livekit_room_manager_exception(self):
        """Returns degraded status when room manager raises."""
        mock_mgr = MagicMock()
        mock_mgr.get_active_rooms.side_effect = RuntimeError("LiveKit unreachable")

        with (
            patch("app.routers.runtime.settings.LIVEKIT_ENABLED", True),
            patch("app.routers.runtime._get_room_manager", return_value=mock_mgr),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/livekit")
                assert resp.status_code == 200
                data = resp.json()
                assert "error" in data
                assert data["connected"] is False

    @pytest.mark.asyncio
    async def test_livekit_with_active_rooms(self):
        """Returns room data when room manager returns rooms."""
        mock_mgr = MagicMock()
        mock_mgr.get_active_rooms.return_value = [
            {"name": "room-1", "participants": 2, "created_at": "2025-01-01T00:00:00Z"},
            {"name": "room-2", "participants": 1, "created_at": "2025-01-01T00:01:00Z"},
        ]

        with (
            patch("app.routers.runtime.settings.LIVEKIT_ENABLED", True),
            patch("app.routers.runtime._get_room_manager", return_value=mock_mgr),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/livekit")
                assert resp.status_code == 200
                data = resp.json()
                assert data["active_rooms"] == 2
                assert len(data["rooms"]) == 2
                assert data["rooms"][0]["name"] == "room-1"
                assert data["rooms"][0]["participants"] == 2
                assert data["rooms"][1]["name"] == "room-2"

    @pytest.mark.asyncio
    async def test_livekit_no_get_active_rooms_method(self):
        """Returns empty rooms when room manager has no get_active_rooms."""
        mock_mgr = MagicMock(spec=[])  # No methods
        with (
            patch("app.routers.runtime.settings.LIVEKIT_ENABLED", True),
            patch("app.routers.runtime._get_room_manager", return_value=mock_mgr),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/livekit")
                assert resp.status_code == 200
                data = resp.json()
                assert data["active_rooms"] == 0
                assert data["connected"] is True


class TestSipStatus:
    """Tests for GET /runtime/sip."""

    @pytest.mark.asyncio
    async def test_sip_enabled_empty(self):
        """Returns 0 active calls when SIP is enabled but no calls."""
        with (
            patch("app.routers.runtime.settings.SIP_ENABLED", True),
            patch("app.routers.runtime._get_sip_calls", return_value=[]),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/sip")
                assert resp.status_code == 200
                data = resp.json()
                assert data["enabled"] is True
                assert data["active_calls"] == 0
                assert data["calls"] == []

    @pytest.mark.asyncio
    async def test_sip_enabled_with_calls(self):
        """Returns active call details when SIP has calls."""
        mock_calls = [
            {
                "call_id": "sip-call-001",
                "from_number": "+14155551212",
                "to_number": "+14155551234",
                "room_name": "sip-+14155551234",
                "status": "active",
                "duration_seconds": 42,
            }
        ]
        with (
            patch("app.routers.runtime.settings.SIP_ENABLED", True),
            patch("app.routers.runtime._get_sip_calls", return_value=mock_calls),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/sip")
                assert resp.status_code == 200
                data = resp.json()
                assert data["active_calls"] == 1
                assert data["calls"][0]["call_id"] == "sip-call-001"
                assert data["calls"][0]["from_number"] == "+14155551212"

    @pytest.mark.asyncio
    async def test_sip_disabled(self):
        """Returns disabled status when SIP_ENABLED is False."""
        with (
            patch("app.routers.runtime.settings.SIP_ENABLED", False),
            patch("app.routers.runtime.settings.SIP_SERVER_ADDRESS", "0.0.0.0"),
            patch("app.routers.runtime.settings.SIP_PORT", 5060),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/sip")
                assert resp.status_code == 200
                data = resp.json()
                assert data["enabled"] is False
                assert data["active_calls"] == 0

    @pytest.mark.asyncio
    async def test_sip_exception(self):
        """Returns degraded status when SIP calls raise."""
        with patch(
            "app.routers.runtime._get_sip_calls",
            side_effect=RuntimeError("SIP dispatch unavailable"),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/sip")
                assert resp.status_code == 200
                data = resp.json()
                assert "error" in data
                assert data["active_calls"] == 0


class TestProviderStatus:
    """Tests for GET /runtime/providers."""

    @pytest.fixture
    def mock_registry(self):
        """Create a mock registry with sample providers."""
        registry = MagicMock()
        registry.list_stt_providers.return_value = ["whisper", "deepgram"]
        registry.list_llm_providers.return_value = ["ollama", "openai"]
        registry.list_tts_providers.return_value = ["kokoro", "openvoice", "xtts"]
        return registry

    @pytest.mark.asyncio
    async def test_providers_returns_active_and_registered(self, mock_registry):
        """Returns active providers and full registered list."""
        with (
            patch("app.routers.runtime.settings.STT_PROVIDER", "whisper"),
            patch("app.routers.runtime.settings.LLM_PROVIDER", "ollama"),
            patch("app.routers.runtime.settings.TTS_PROVIDER", "kokoro"),
            patch("app.routers.runtime._get_registry", return_value=mock_registry),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/providers")
                assert resp.status_code == 200
                data = resp.json()
                assert data["active"]["stt"] == "whisper"
                assert data["active"]["llm"] == "ollama"
                assert data["active"]["tts"] == "kokoro"
                assert len(data["registered"]["stt"]) == 2
                assert len(data["registered"]["llm"]) == 2
                assert len(data["registered"]["tts"]) == 3

    @pytest.mark.asyncio
    async def test_providers_active_flags(self, mock_registry):
        """Correctly marks which providers are active."""
        with (
            patch("app.routers.runtime.settings.STT_PROVIDER", "whisper"),
            patch("app.routers.runtime.settings.LLM_PROVIDER", "ollama"),
            patch("app.routers.runtime.settings.TTS_PROVIDER", "kokoro"),
            patch("app.routers.runtime._get_registry", return_value=mock_registry),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/providers")
                data = resp.json()
                stt = data["registered"]["stt"]
                assert stt[0]["name"] == "whisper"
                assert stt[0]["is_active"] is True
                assert stt[1]["name"] == "deepgram"
                assert stt[1]["is_active"] is False

    @pytest.mark.asyncio
    async def test_providers_exception(self):
        """Returns active names with empty registered on error."""
        with (
            patch(
                "app.routers.runtime._get_registry",
                side_effect=RuntimeError("Registry unavailable"),
            ),
            patch("app.routers.runtime.settings.STT_PROVIDER", "whisper"),
            patch("app.routers.runtime.settings.LLM_PROVIDER", "ollama"),
            patch("app.routers.runtime.settings.TTS_PROVIDER", "kokoro"),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/providers")
                assert resp.status_code == 200
                data = resp.json()
                assert data["active"]["stt"] == "whisper"
                assert "error" in data
                assert data["registered"]["stt"] == []


class TestAggregatedStatus:
    """Tests for GET /runtime/status."""

    @pytest.mark.asyncio
    async def test_aggregated_healthy(self):
        """Returns healthy status when all subsystems respond."""
        mock_registry = MagicMock()
        mock_registry.list_stt_providers.return_value = ["whisper"]
        mock_registry.list_llm_providers.return_value = ["ollama"]
        mock_registry.list_tts_providers.return_value = ["kokoro"]

        with (
            patch("app.routers.runtime.settings.LIVEKIT_ENABLED", False),
            patch("app.routers.runtime.settings.SIP_ENABLED", False),
            patch("app.routers.runtime.settings.STT_PROVIDER", "whisper"),
            patch("app.routers.runtime.settings.LLM_PROVIDER", "ollama"),
            patch("app.routers.runtime.settings.TTS_PROVIDER", "kokoro"),
            patch("app.routers.runtime._get_registry", return_value=mock_registry),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/status")
                assert resp.status_code == 200
                data = resp.json()
                assert data["status"] == "healthy"
                assert "timestamp" in data
                assert data["errors"] is None

    @pytest.mark.asyncio
    async def test_aggregated_returns_individual_sections(self):
        """Returns livekit, sip, and providers as separate sections."""
        with (
            patch("app.routers.runtime.settings.LIVEKIT_ENABLED", False),
            patch("app.routers.runtime.settings.SIP_ENABLED", False),
            patch("app.routers.runtime.settings.STT_PROVIDER", "whisper"),
            patch("app.routers.runtime.settings.LLM_PROVIDER", "ollama"),
            patch("app.routers.runtime.settings.TTS_PROVIDER", "kokoro"),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/runtime/status")
                data = resp.json()
                assert "livekit" in data
                assert "sip" in data
                assert "providers" in data
                assert data["livekit"]["enabled"] is False
                assert data["sip"]["enabled"] is False
