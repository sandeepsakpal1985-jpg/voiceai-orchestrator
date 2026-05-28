"""
Tests for Auth Middleware — JWT verification, middleware dispatch, dependencies.

Covers:
  - verify_token() with valid/invalid/expired tokens
  - AuthMiddleware excluded paths
  - get_current_user dependency
  - require_role dependency
  - AUTH_BYPASS behavior
"""

import os
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

# Import the middleware functions directly (doesn't trigger livekit import)
from app.middleware.auth import (
    verify_token,
    get_current_user,
    require_role,
    AuthMiddleware,
    AUTH_EXCLUDED_PREFIXES,
)


# ═══════════════════════════════════════════════════════════════════════
# verify_token
# ═══════════════════════════════════════════════════════════════════════


class TestVerifyToken:
    def test_returns_dev_user_when_jose_not_installed(self):
        """When python-jose is not installed, should accept any token in dev."""
        with patch("app.middleware.auth._jose_available", False):
            payload = verify_token("any-token")
            assert payload is not None
            assert payload["sub"] == "dev-user"

    def test_returns_dev_user_when_secret_empty(self):
        """When AUTH_SECRET is empty, should accept any token in dev."""
        with patch.dict(os.environ, {"AUTH_SECRET": ""}, clear=True):
            with patch("app.middleware.auth._jose_available", True):
                payload = verify_token("any-token")
                assert payload is not None
                assert payload["sub"] == "dev-user"

    def test_returns_test_user_when_bypass(self):
        """When AUTH_BYPASS is true, should return test user."""
        with patch.dict(os.environ, {"AUTH_BYPASS": "true"}, clear=True):
            with patch("app.middleware.auth._jose_available", True):
                payload = verify_token("any-token")
                assert payload is not None
                assert payload["sub"] == "test-user"
                assert payload["role"] == "admin"

    def test_returns_none_for_invalid_token(self):
        """Should return None for a clearly invalid token when jose is available."""
        with patch.dict(os.environ, {"AUTH_SECRET": "my-secret-key"}, clear=True):
            with patch("app.middleware.auth._jose_available", True):
                with patch("app.middleware.auth.jose_jwt") as mock_jose:
                    from jose.exceptions import JWTError
                    mock_jose.decode.side_effect = JWTError("bad token")
                    payload = verify_token("invalid-token")
                    assert payload is None

    def test_returns_none_for_expired_token(self):
        """Should return None for an expired token."""
        with patch.dict(os.environ, {"AUTH_SECRET": "my-secret-key"}, clear=True):
            with patch("app.middleware.auth._jose_available", True):
                with patch("app.middleware.auth.jose_jwt") as mock_jose:
                    from jose.exceptions import ExpiredSignatureError
                    mock_jose.decode.side_effect = ExpiredSignatureError("expired")
                    payload = verify_token("expired-token")
                    assert payload is None

    def test_returns_payload_for_valid_token(self):
        """Should return decoded payload for a valid token."""
        with patch.dict(os.environ, {"AUTH_SECRET": "my-secret-key"}, clear=True):
            with patch("app.middleware.auth._jose_available", True):
                with patch("app.middleware.auth.jose_jwt") as mock_jose:
                    mock_jose.decode.return_value = {
                        "sub": "user-123",
                        "role": "admin",
                        "iat": 1000000,
                        "exp": 2000000,
                    }
                    payload = verify_token("valid-token")
                    assert payload["sub"] == "user-123"
                    assert payload["role"] == "admin"


# ═══════════════════════════════════════════════════════════════════════
# get_current_user dependency
# ═══════════════════════════════════════════════════════════════════════


class TestGetCurrentUser:
    """Tests for the get_current_user FastAPI dependency."""

    def test_returns_user_when_set(self):
        """Should return user dict when set on request state."""
        request = AsyncMock()
        request.state.user = {"id": "user-1", "role": "admin"}
        user = get_current_user(request)
        assert user["id"] == "user-1"
        assert user["role"] == "admin"

    def test_raises_403_when_not_set(self):
        """Should raise HTTPException 403 when no user in request state."""
        request = AsyncMock()
        request.state.user = None
        with pytest.raises(HTTPException) as exc:
            get_current_user(request)
        assert exc.value.status_code == 403
        assert "Not authenticated" in exc.value.detail

    def test_raises_403_when_user_not_present(self):
        """Should raise HTTPException 403 when user attribute missing."""
        request = AsyncMock()
        del request.state.user  # AttributeError should be caught
        with pytest.raises(HTTPException) as exc:
            get_current_user(request)
        assert exc.value.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# require_role dependency
# ═══════════════════════════════════════════════════════════════════════


class TestRequireRole:
    """Tests for the require_role dependency factory."""

    def test_allows_correct_role(self):
        """Should allow access when user has the required role."""
        check = require_role("admin")
        user = check({"id": "user-1", "role": "admin"})
        assert user["id"] == "user-1"

    def test_rejects_wrong_role(self):
        """Should raise 403 when user does not have required role."""
        check = require_role("admin")
        with pytest.raises(HTTPException) as exc:
            check({"id": "user-1", "role": "user"})
        assert exc.value.status_code == 403
        assert "Requires 'admin' role" in exc.value.detail

    def test_rejects_missing_role(self):
        """Should raise 403 when user has no role."""
        check = require_role("admin")
        with pytest.raises(HTTPException) as exc:
            check({"id": "user-1"})
        assert exc.value.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# AUTH_EXCLUDED_PREFIXES
# ═══════════════════════════════════════════════════════════════════════


class TestAuthExcludedPrefixes:
    """Tests for the AUTH_EXCLUDED_PREFIXES set."""

    def test_includes_health(self):
        assert "/health" in AUTH_EXCLUDED_PREFIXES

    def test_includes_swagger_paths(self):
        assert "/docs" in AUTH_EXCLUDED_PREFIXES
        assert "/redoc" in AUTH_EXCLUDED_PREFIXES
        assert "/openapi.json" in AUTH_EXCLUDED_PREFIXES

    def test_includes_twilio_webhooks(self):
        assert "/twilio" in AUTH_EXCLUDED_PREFIXES

    def test_includes_runtime(self):
        assert "/runtime" in AUTH_EXCLUDED_PREFIXES

    def test_includes_metrics_and_logs(self):
        assert "/metrics" in AUTH_EXCLUDED_PREFIXES
        assert "/logs" in AUTH_EXCLUDED_PREFIXES
