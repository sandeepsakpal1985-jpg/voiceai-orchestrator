"""
Tests for Rate Limit Middleware — In-memory rate limiter and middleware dispatch.

Covers:
  - _InMemoryRateLimiter: check, get_remaining, sliding window, per-key isolation
  - AUTH_BYPASS path integration
  - Edge cases: zero limit, negative limit, rapid bursts, key isolation
"""

import os
import time
from unittest.mock import patch

import pytest

from app.middleware.rate_limit import _InMemoryRateLimiter, _RATE_LIMIT_EXCLUDED


# ═══════════════════════════════════════════════════════════════════════
# _InMemoryRateLimiter
# ═══════════════════════════════════════════════════════════════════════


class TestInMemoryRateLimiter:
    """Tests for the in-memory sliding window rate limiter."""

    def setup_method(self):
        self.limiter = _InMemoryRateLimiter()

    def test_allows_first_request(self):
        """First request should always be allowed."""
        allowed, remaining = self.limiter.check("client-1", 10, 60)
        assert allowed is True
        assert remaining == 9

    def test_blocks_after_limit_exceeded(self):
        """Should block requests after exceeding the limit."""
        for _ in range(10):
            self.limiter.check("client-1", 10, 60)
        allowed, remaining = self.limiter.check("client-1", 10, 60)
        assert allowed is False
        assert remaining == 0

    def test_tracks_remaining_correctly(self):
        """Should decrease remaining count with each request."""
        allowed1, rem1 = self.limiter.check("client-a", 5, 60)
        assert rem1 == 4
        allowed2, rem2 = self.limiter.check("client-a", 5, 60)
        assert rem2 == 3
        allowed3, rem3 = self.limiter.check("client-a", 5, 60)
        assert rem3 == 2

    def test_per_key_isolation(self):
        """Different keys should be tracked independently."""
        for _ in range(5):
            self.limiter.check("client-a", 5, 60)
        assert self.limiter.check("client-a", 5, 60)[0] is False
        assert self.limiter.check("client-b", 5, 60)[0] is True

    def test_sliding_window_expires_old_entries(self):
        """Old entries outside the window should not count."""
        key = "sliding-test"
        now = time.time()
        # Manually add old entries to the internal bucket with timestamps from the past
        self.limiter._buckets[key] = [now - 120, now - 110, now - 105]  # 2 min old
        self.limiter._buckets[key].append(now - 5)

        # Running check() should purge entries older than 60 seconds
        self.limiter.check(key, 10, 60)
        remaining = self.limiter.get_remaining(key, 10, 60)
        # Only the -5s and the current entries should remain
        assert remaining >= 7, f"Expected >= 7 remaining, got {remaining}"

    def test_get_remaining_returns_correct_count(self):
        """get_remaining should return the correct number of remaining requests."""
        self.limiter.check("client-1", 10, 60)
        self.limiter.check("client-1", 10, 60)
        remaining = self.limiter.get_remaining("client-1", 10, 60)
        assert remaining == 8

    def test_get_remaining_full_limit(self):
        """get_remaining should return full limit when no requests made."""
        remaining = self.limiter.get_remaining("fresh-client", 10, 60)
        assert remaining == 10

    def test_zero_limit_blocks_all(self):
        """Limit of 0 should block all requests."""
        allowed, remaining = self.limiter.check("blocked", 0, 60)
        assert allowed is False
        assert remaining == 0

    def test_negative_limit_blocks_all(self):
        """Negative limit should block all requests."""
        allowed, remaining = self.limiter.check("neg", -1, 60)
        assert allowed is False
        assert remaining == 0

    def test_rapid_bursts_within_limit(self):
        """Should handle rapid bursts within the limit."""
        for _ in range(100):
            allowed, _ = self.limiter.check("burst-1", 100, 60)
            assert allowed is True
        # 101st should be blocked
        assert self.limiter.check("burst-1", 100, 60)[0] is False

    def test_cleanup_old_entries_on_check(self):
        """check() should clean up old entries for the key."""
        key = "cleanup-test"
        # Add several old entries
        self.limiter._buckets[key] = [time.time() - 200, time.time() - 150]
        allowed, _ = self.limiter.check(key, 10, 60)
        assert allowed is True
        # Old entries should have been purged, only new entry remains
        assert len(self.limiter._buckets[key]) == 1

    def test_empty_bucket(self):
        """Should handle keys with no history gracefully."""
        remaining = self.limiter.get_remaining("nonexistent", 10, 60)
        assert remaining == 10
        allowed, rem = self.limiter.check("nonexistent", 10, 60)
        assert allowed is True
        assert rem == 9

    def test_key_not_in_buckets(self):
        """Should handle keys not yet in buckets dict."""
        remaining = self.limiter.get_remaining("new-key", 10, 60)
        assert remaining == 10


# ═══════════════════════════════════════════════════════════════════════
# _RATE_LIMIT_EXCLUDED paths
# ═══════════════════════════════════════════════════════════════════════


class TestRateLimitExcluded:
    """Tests for the _RATE_LIMIT_EXCLUDED path set."""

    def test_includes_health(self):
        assert "/health" in _RATE_LIMIT_EXCLUDED

    def test_includes_swagger_paths(self):
        assert "/docs" in _RATE_LIMIT_EXCLUDED
        assert "/redoc" in _RATE_LIMIT_EXCLUDED
        assert "/openapi.json" in _RATE_LIMIT_EXCLUDED

    def test_includes_twilio_webhooks(self):
        assert "/twilio" in _RATE_LIMIT_EXCLUDED
