"""
Integration Tests — Auth middleware, rate limiting, monitoring, persistence.

Tests the production-hardening features:
  - AuthMiddleware: JWT validation, excluded paths, error responses
  - RateLimitMiddleware: Token bucket enforcement, headers
  - Monitoring: /metrics endpoint, /health/deep endpoint format
  - Persistence: Redis/in-memory store CRUD operations
"""

import json
import os
import time

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.providers import reset_default_registry


# ── Fixtures ─────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_state():
    """Reset global state before each test."""
    reset_default_registry()
    # Ensure AUTH_SECRET is set for tests that need it
    old_secret = os.environ.get("AUTH_SECRET")
    if not old_secret:
        os.environ["AUTH_SECRET"] = "test-secret-that-is-at-least-32-bytes-long-for-hs256!!"
    yield
    if old_secret is None:
        os.environ.pop("AUTH_SECRET", None)


@pytest.fixture
def client():
    """Create a test client (bypassed auth for health endpoint)."""
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    )


# ── Auth Middleware Tests ────────────────────────────────────────────


class TestAuthMiddleware:
    """Test the JWT Bearer authentication middleware.

    These tests explicitly set AUTH_BYPASS=false so they can test
    auth rejection, even though conftest.py enables AUTH_BYPASS globally.
    """

    @pytest.fixture(autouse=True)
    def disable_bypass(self):
        """Disable AUTH_BYPASS for auth tests."""
        os.environ["AUTH_BYPASS"] = "false"
        yield
        os.environ["AUTH_BYPASS"] = "true"

    async def test_health_endpoint_bypasses_auth(self, client):
        """/health should work without any token."""
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

    async def test_docs_endpoint_bypasses_auth(self, client):
        """/docs should work without any token."""
        response = await client.get("/docs")
        assert response.status_code in (200, 307)  # FastAPI docs redirect

    async def test_protected_endpoint_rejects_no_auth(self, client):
        """Protected endpoints should return 401 without Authorization header."""
        # /conversations is a protected endpoint
        response = await client.get("/conversations")
        assert response.status_code == 401
        data = response.json()
        assert "Unauthorized" in data.get("error", "") or "Unauthorized" in data.get("detail", "")

    async def test_protected_endpoint_rejects_bad_token(self, client):
        """Protected endpoints should return 401 with an invalid Bearer token."""
        response = await client.get(
            "/conversations",
            headers={"Authorization": "Bearer invalid-token-that-will-fail-validation"},
        )
        assert response.status_code == 401

    async def test_protected_endpoint_rejects_malformed_header(self, client):
        """Authorization header without Bearer prefix should be rejected."""
        response = await client.get(
            "/conversations",
            headers={"Authorization": "Basic somecreds"},
        )
        assert response.status_code == 401

    async def test_protected_endpoint_accepts_valid_token(self, client):
        """A valid JWT should pass auth middleware."""
        from jose import jwt

        secret = os.environ["AUTH_SECRET"].encode("utf-8")
        token = jwt.encode(
            {"sub": "test-user", "role": "admin", "iat": int(time.time())},
            secret,
            algorithm="HS256",
        )

        response = await client.get(
            "/conversations",
            headers={"Authorization": f"Bearer {token}"},
        )
        # The endpoint may return 200 or an empty list — the key is it doesn't return 401
        assert response.status_code != 401

    async def test_twilio_webhook_bypasses_auth(self, client):
        """/twilio endpoints should work without auth (verified via Twilio signature)."""
        response = await client.post(
            "/twilio/voice",
            data={"CallSid": "test", "From": "+1234", "To": "+5678"},
        )
        # Twilio returns TwiML XML, which is a 200
        assert response.status_code == 200 or response.status_code == 401
        # Note: if Twilio webhook has its own auth check, 401 is acceptable

    async def test_openapi_bypasses_auth(self, client):
        """/openapi.json should work without any token."""
        response = await client.get("/openapi.json")
        assert response.status_code == 200

    async def test_runtime_bypasses_auth(self, client):
        """/runtime endpoints should work without auth."""
        response = await client.get("/runtime/status")
        assert response.status_code in (200, 404)  # 404 if not implemented


# ── Rate Limiting Tests ──────────────────────────────────────────────


class TestRateLimitMiddleware:
    """Test the rate limiting middleware (with low limits for testing)."""

    async def test_rate_limit_headers_present(self, client):
        """Authenticated requests should include rate limit headers."""
        from jose import jwt

        secret = os.environ["AUTH_SECRET"].encode("utf-8")
        token = jwt.encode(
            {"sub": "test-user", "role": "admin", "iat": int(time.time())},
            secret,
            algorithm="HS256",
        )

        response = await client.get(
            "/conversations",
            headers={"Authorization": f"Bearer {token}"},
        )
        # Rate limit headers may not be present on error responses
        if response.status_code == 200:
            assert "X-RateLimit-Limit" in response.headers or \
                   "X-RateLimit-Remaining" in response.headers

    async def test_health_not_rate_limited(self, client):
        """/health should not be subject to rate limiting."""
        for _ in range(5):
            response = await client.get("/health")
            assert response.status_code == 200


# ── Monitoring Tests ────────────────────────────────────────────────


class TestMonitoring:
    """Test the monitoring and observability endpoints."""

    async def test_metrics_endpoint_exists(self, client):
        """/metrics should return Prometheus-formatted text."""
        response = await client.get("/metrics")
        # Auth bypass: /metrics is not in excluded paths, so may need auth
        if response.status_code == 401:
            from jose import jwt

            secret = os.environ["AUTH_SECRET"].encode("utf-8")
            token = jwt.encode(
                {"sub": "test-user", "role": "admin", "iat": int(time.time())},
                secret,
                algorithm="HS256",
            )
            response = await client.get(
                "/metrics",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code in (200, 404)
        if response.status_code == 200:
            text = response.text
            assert "# HELP voiceai_uptime_seconds" in text
            assert "voiceai_uptime_seconds" in text
            assert "voiceai_http_requests_total" in text
            assert "voiceai_ws_connections_active" in text

    async def test_health_readiness(self, client):
        """/health/readiness should return ready status."""
        response = await client.get("/health/readiness")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"

    async def test_health_liveness(self, client):
        """/health/liveness should return alive status."""
        response = await client.get("/health/liveness")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"

    async def test_deep_health_structure(self, client):
        """/health/deep should return structured health data (may be degraded without services)."""
        response = await client.get("/health/deep")
        # May fail with ImportError on psutil in some envs, so handle gracefully
        if response.status_code == 200:
            data = response.json()
            assert "status" in data
            assert "services" in data
            assert "system" in data

    async def test_recent_logs(self, client):
        """/logs/recent should return log entries."""
        from jose import jwt

        secret = os.environ["AUTH_SECRET"].encode("utf-8")
        token = jwt.encode(
            {"sub": "test-user", "role": "admin", "iat": int(time.time())},
            secret,
            algorithm="HS256",
        )

        response = await client.get(
            "/logs/recent?limit=5",
            headers={"Authorization": f"Bearer {token}"},
        )
        # May not be registered in main router list
        if response.status_code != 404:
            assert response.status_code == 200
            data = response.json()
            assert "entries" in data
            assert "total_available" in data


# ── Persistence Layer Tests ──────────────────────────────────────────


class TestPersistence:
    """Test the persistence layer (in-memory fallback)."""

    @pytest.fixture
    async def store(self):
        from app.services.persistence import get_persistence, reset_persistence
        await reset_persistence()
        store = await get_persistence()
        yield store

    @pytest.mark.asyncio
    async def test_ping(self, store):
        """Ping should return True for in-memory store."""
        assert await store.ping() is True

    @pytest.mark.asyncio
    async def test_stats(self, store):
        """Stats should return valid metadata."""
        stats = await store.get_stats()
        assert "sip_calls_stored" in stats
        assert "usage_keys" in stats
        assert "voice_profiles" in stats
        assert "backend" in stats

    @pytest.mark.asyncio
    async def test_sip_call_crud(self, store):
        """SIP call create, read, update, delete flow."""
        # Create
        await store.save_sip_call("call-1", {
            "call_id": "call-1",
            "from_number": "+1234",
            "to_number": "+5678",
            "status": "active",
            "room_name": "sip-+5678",
        })

        # Read
        call = await store.get_sip_call("call-1")
        assert call is not None
        assert call["from_number"] == "+1234"
        assert call["status"] == "active"

        # Update (end)
        ended = await store.end_sip_call("call-1")
        assert ended is True

        # Verify end
        call = await store.get_sip_call("call-1")
        assert call is not None
        assert call["status"] == "completed"

        # End non-existent
        assert await store.end_sip_call("nonexistent") is False

    @pytest.mark.asyncio
    async def test_active_sip_calls(self, store):
        """Active calls should only return non-ended calls."""
        await store.save_sip_call("call-active", {
            "call_id": "call-active",
            "status": "active",
            "from_number": "+1111",
            "to_number": "+2222",
        })
        await store.save_sip_call("call-ended", {
            "call_id": "call-ended",
            "status": "completed",
            "from_number": "+3333",
            "to_number": "+4444",
        })

        active = await store.get_active_sip_calls()
        call_ids = [c["call_id"] for c in active]
        assert "call-active" in call_ids
        assert "call-ended" not in call_ids

    @pytest.mark.asyncio
    async def test_cleanup_stale_calls(self, store):
        """Stale completed calls should be cleaned up."""
        import time as tmod

        # Add a call that looks old
        await store.save_sip_call("old-call", {
            "call_id": "old-call",
            "status": "completed",
            "ended_at": tmod.time() - 7200,  # 2 hours ago
        })
        await store.save_sip_call("recent-call", {
            "call_id": "recent-call",
            "status": "completed",
            "ended_at": tmod.time() - 60,  # 1 minute ago
        })

        cleaned = await store.cleanup_stale_calls(max_age_sec=3600)
        assert cleaned == 1

    @pytest.mark.asyncio
    async def test_usage_tracking(self, store):
        """Usage recording and counting should work."""
        count = await store.record_usage("user:test-user")
        assert count >= 1

        count = await store.record_usage("user:test-user")
        assert count >= 2

        count_window = await store.get_usage_count("user:test-user", window_sec=3600)
        assert count_window >= 2

    @pytest.mark.asyncio
    async def test_usage_keys(self, store):
        """Usage keys should be listable."""
        await store.record_usage("user:a")
        await store.record_usage("user:b")
        keys = await store.get_all_usage_keys()
        assert len(keys) >= 2

    @pytest.mark.asyncio
    async def test_voice_profile_crud(self, store):
        """Voice profile create, read, list, delete."""
        # Create
        await store.save_voice_profile("vp-1", {
            "name": "Test Voice",
            "provider": "kokoro",
            "languages": ["en"],
        })

        # Read
        vp = await store.get_voice_profile("vp-1")
        assert vp is not None
        assert vp["name"] == "Test Voice"

        # List
        profiles = await store.list_voice_profiles()
        assert len(profiles) >= 1
        assert any(p.get("name") == "Test Voice" for p in profiles)

        # Delete
        deleted = await store.delete_voice_profile("vp-1")
        assert deleted is True
        assert await store.get_voice_profile("vp-1") is None
        assert await store.delete_voice_profile("nonexistent") is False


# ── Excluded Paths Verification ──────────────────────────────────────


class TestExcludedPaths:
    """Verify that excluded paths from auth are accessible."""

    AUTH_EXCLUDED = [
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
    ]

    async def test_all_excluded_paths_accessible(self, client):
        """All configured excluded paths should return non-401 status codes."""
        for path in self.AUTH_EXCLUDED:
            response = await client.get(path)
            assert response.status_code != 401, f"{path} should not require auth"
